import {
  ProjectProfileSchema,
  suggestPhases,
  CostCalculator,
  type ProjectProfile,
  type ProviderAdapter,
  type CatalogSnapshot,
  type ChatMessage,
  type HostToWebviewMsg,
} from "@token-optimizer/core";
import { KeyService } from "../secrets/KeyService.js";
import { ProfileHistoryStore } from "./ProfileHistoryStore.js";
import { TaxonomyPromptBuilder } from "./TaxonomyPromptBuilder.js";

export interface EnhanceRequest {
  description: string;
  providerId: string;
  modelId: string;
  keySlot?: number;
  previousProfileVersion?: number;
}

export interface EnhanceServiceOptions {
  keyService: KeyService;
  adapters: Map<string, ProviderAdapter>;
  getCatalogSnapshot: () => CatalogSnapshot | null;
  postMessage: (msg: HostToWebviewMsg) => Promise<void>;
  historyStore: ProfileHistoryStore;
}

interface ExtractedPayload {
  narrative: string;
  profile: unknown;
}

export class EnhanceService {
  private keyService: KeyService;
  private adapters: Map<string, ProviderAdapter>;
  private getCatalogSnapshot: () => CatalogSnapshot | null;
  private postMessage: (msg: HostToWebviewMsg) => Promise<void>;
  private historyStore: ProfileHistoryStore;

  constructor(options: EnhanceServiceOptions) {
    this.keyService = options.keyService;
    this.adapters = options.adapters;
    this.getCatalogSnapshot = options.getCatalogSnapshot;
    this.postMessage = options.postMessage;
    this.historyStore = options.historyStore;
  }

  public async run(request: EnhanceRequest): Promise<ProjectProfile | null> {
    const { description, providerId, modelId, keySlot, previousProfileVersion } = request;

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      await this.postMessage({
        version: 1,
        type: "enhance/error",
        payload: {
          error: "llm-failed",
          message: `No provider adapter found for ${providerId}`,
        },
      });
      return null;
    }

    const snapshot = this.getCatalogSnapshot();
    const catalogPhases = snapshot?.phases ?? [];

    // Prompt Template selection by purpose="enhance" (T059)
    const promptTemplate = snapshot?.promptTemplates.find(
      (t) => t.purpose === "enhance" && t.active
    ) || snapshot?.promptTemplates.find((t) => t.purpose === "enhance");

    // If refining a previous profile version, include previous context to avoid duplicating sections
    let previousProfileContext = "";
    if (previousProfileVersion) {
      const prevEntry = this.historyStore.getVersion(previousProfileVersion);
      if (prevEntry) {
        previousProfileContext = `\n\nPrevious Profile Version ${previousProfileVersion} to refine:\n${JSON.stringify(
          prevEntry.profile
        )}`;
      }
    }

    const model = snapshot?.models.find((m) => m.id === modelId);
    let taxonomyResult: {
      level: "full" | "short" | "compact";
      phasesTaxonomyText: string;
      estimatedTaxonomyTokens: number;
      availableBudgetTokens: number;
    };
    try {
      taxonomyResult = TaxonomyPromptBuilder.buildTaxonomyText({
        modelContextWindow: model?.contextWindow ?? 128000,
        modelMaxOutput: model?.maxOutput ?? 4096,
        description,
        previousProfileContext,
        catalogPhases,
      });
    } catch (err) {
      await this.postMessage({
        version: 1,
        type: "enhance/error",
        payload: {
          error: "llm-failed",
          message: err instanceof Error ? err.message : String(err),
        },
      });
      return null;
    }

    let promptText: string;
    if (promptTemplate) {
      promptText = promptTemplate.template
        .replace("{{description}}", description)
        .replace("{{phasesTaxonomy}}", taxonomyResult.phasesTaxonomyText);
    } else {
      promptText = `Analyze project architecture and generate token optimization profile.\n\nProject:\n${description}\n\nPhases:\n${taxonomyResult.phasesTaxonomyText}\n\nOutput JSON with "narrative" and "profile" conforming to ProjectProfileSchema.`;
    }

    if (previousProfileContext) {
      promptText += previousProfileContext;
    }

    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are an expert AI architect. You analyze software descriptions and produce JSON with keys 'narrative' (string describing architecture) and 'profile' conforming to ProjectProfileSchema. Return ONLY valid JSON.",
      },
      {
        role: "user",
        content: promptText,
      },
    ];

    const getKey = this.keyService.getKeyGetter(providerId, keySlot ?? 0);

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    let content: string;
    try {
      const result = await adapter.complete(messages, getKey, {
        model: modelId,
        temperature: 0.2,
      });
      content = result.content;
      totalInputTokens += result.inputTokens ?? 0;
      totalOutputTokens += result.outputTokens ?? 0;
    } catch (err) {
      await this.postMessage({
        version: 1,
        type: "enhance/error",
        payload: {
          error: "llm-failed",
          message: err instanceof Error ? err.message : String(err),
        },
      });
      return null;
    }

    // Try parsing initial response
    let extracted = this.extractJson(content);
    let validationResult = extracted
      ? ProjectProfileSchema.safeParse(extracted.profile)
      : null;

    // Single repair attempt if parse or schema validation failed (T059, FR-010, FR-013)
    if (!extracted || !validationResult || !validationResult.success) {
      const errorMsg = !extracted
        ? "Malformed JSON output"
        : validationResult?.error?.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ");

      const repairMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant", content },
        {
          role: "user",
          content: `The previous response failed validation: ${errorMsg}. Please respond with ONLY valid JSON containing "narrative" (string) and "profile" (valid ProjectProfileSchema).`,
        },
      ];

      try {
        const repairResult = await adapter.complete(repairMessages, getKey, {
          model: modelId,
          temperature: 0.1,
        });
        totalInputTokens += repairResult.inputTokens ?? 0;
        totalOutputTokens += repairResult.outputTokens ?? 0;

        extracted = this.extractJson(repairResult.content);
        validationResult = extracted
          ? ProjectProfileSchema.safeParse(extracted.profile)
          : null;
      } catch (err) {
        await this.postMessage({
          version: 1,
          type: "enhance/error",
          payload: {
            error: "repair-failed",
            message: `Repair call failed: ${err instanceof Error ? err.message : String(err)}`,
          },
        });
        return null;
      }

      // If still invalid after the single repair attempt, abort without altering previous version
      if (!extracted || !validationResult || !validationResult.success) {
        await this.postMessage({
          version: 1,
          type: "enhance/error",
          payload: {
            error: "repair-failed",
            message: "Failed to produce schema-valid Project Profile after repair attempt.",
          },
        });
        return null;
      }
    }

    const narrative = extracted.narrative || "Architecture synthesis completed.";
    const profile = validationResult.data;

    // Validate phases against catalog taxonomy (T133, T147, FR-052)
    const validPhaseTypeIds = new Set(catalogPhases.map((p) => p.id));
    let usablePhases = Array.isArray(profile.phases) && profile.phases.length > 0;
    if (usablePhases) {
      for (const phase of profile.phases) {
        if (!validPhaseTypeIds.has(phase.phaseTypeId)) {
          usablePhases = false;
          break;
        }
      }
    }

    // Fall back to deterministic PhaseSuggester if no usable phases returned
    if (!usablePhases) {
      profile.phases = suggestPhases(profile, catalogPhases);
    }

    // Stream narrative preview deltas
    // If taxonomy budget degradation occurred, note it in the narrative stream so it is explainable
    let streamNarrative = narrative;
    if (taxonomyResult.level !== "full") {
      const budgetNote = `[Taxonomy budget level: ${taxonomyResult.level} - prompt compacted to fit context budget]\n\n`;
      streamNarrative = budgetNote + narrative;
    }

    const chunkSize = 40;
    for (let i = 0; i < streamNarrative.length; i += chunkSize) {
      const delta = streamNarrative.slice(i, i + chunkSize);
      await this.postMessage({
        version: 1,
        type: "enhance/stream",
        payload: { delta },
      });
    }

    // Calculate prompt execution cost
    let costUsd = 0;
    const pricing = snapshot?.pricing?.find((p) => p.modelId === modelId);
    if (pricing) {
      costUsd = CostCalculator.computeCostUsd(totalInputTokens, totalOutputTokens, pricing);
    }

    const nextVersion = previousProfileVersion
      ? previousProfileVersion + 1
      : this.historyStore.getNextVersion();

    profile.profileVersion = nextVersion;
    profile.createdAt = new Date().toISOString();

    const entry = await this.historyStore.add({
      version: nextVersion,
      narrative,
      profile,
      createdAt: profile.createdAt,
      costUsd,
      tokens: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
    });

    await this.postMessage({
      version: 1,
      type: "enhance/result",
      payload: {
        narrative,
        profile: entry.profile,
        profileVersion: entry.version,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUsd,
        taxonomyBudgetLevel: taxonomyResult.level,
      },
    });

    // Hydrate webview history summaries
    await this.postMessage({
      version: 1,
      type: "enhance/historyLoaded",
      payload: {
        summaries: this.historyStore.getSummaries(),
      },
    });

    return entry.profile;
  }

  private extractJson(content: string): ExtractedPayload | null {
    if (!content || typeof content !== "string") {
      return null;
    }

    // 1. Direct JSON parse
    try {
      const parsed = JSON.parse(content.trim());
      if (parsed && typeof parsed === "object") {
        return parsed as ExtractedPayload;
      }
    } catch {
      // Continue to next extraction strategy
    }

    // 2. Fenced code block ```json ... ```
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        if (parsed && typeof parsed === "object") {
          return parsed as ExtractedPayload;
        }
      } catch {
        // Continue
      }
    }

    // 3. Balanced braces heuristic
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const snippet = content.slice(firstBrace, lastBrace + 1);
        const parsed = JSON.parse(snippet);
        if (parsed && typeof parsed === "object") {
          return parsed as ExtractedPayload;
        }
      } catch {
        // Fall through
      }
    }

    return null;
  }
}
