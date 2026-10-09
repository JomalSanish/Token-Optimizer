import type {
  CostRange,
  EstimationResult,
  ExplainNode,
  Model,
  PhaseOverride,
  PhaseResult,
  Pricing,
  ProjectProfile,
  TokenBreakdown,
  TrackResult,
} from "../protocol/types.js";
import type { CatalogSnapshot } from "../catalog/schemas.js";
import { PhaseResolver, type ResolvedPhase } from "../phases/PhaseResolver.js";
import { ParamResolver, type ResolvedParams } from "./ParamResolver.js";
import { TokenizerLayer } from "./TokenizerLayer.js";

function round4(val: number): number {
  return Math.round(val * 10000) / 10000;
}

function findActivePricing(
  modelId: string,
  catalogPricing: Pricing[],
  referenceTime: string
): Pricing | null {
  const matching = catalogPricing
    .filter((p) => p.modelId === modelId)
    .sort((a, b) => {
      // Sort effectiveFrom descending
      return b.effectiveFrom.localeCompare(a.effectiveFrom);
    });

  if (matching.length === 0) {
    return null;
  }

  // Find latest pricing where effectiveFrom <= referenceTime
  const active = matching.find((p) => p.effectiveFrom <= referenceTime);
  return active ?? matching[matching.length - 1];
}

interface PhaseComputation {
  phase: ResolvedPhase;
  params: ResolvedParams;
  tokensByModel: Record<string, TokenBreakdown>;
  costByModel: Record<string, CostRange>;
  explainTree: ExplainNode;
}

function computePhase(
  phase: ResolvedPhase,
  profile: ProjectProfile,
  models: Model[],
  catalogPricing: Pricing[],
  referenceTime: string,
  override?: PhaseOverride
): PhaseComputation {
  const params = ParamResolver.resolve(phase.defaultParams, override);

  const avgPrompt = Math.max(1, profile.llm?.avgPromptTokens ?? 1);
  const avgOutput = Math.max(1, profile.llm?.avgOutputTokens ?? 1);
  const ratioInput = avgPrompt / (avgPrompt + avgOutput);

  // Volume calculations
  const iterations = profile.buildAssumptions?.iterationsPerFeature ?? 1;
  const requestsPerDay = profile.scale?.requestsPerDay ?? 1;
  const monthlyDays = profile.scale?.monthlyDays ?? 22;
  const monthlyMultiplier = requestsPerDay * monthlyDays;

  const volumeExpected =
    phase.track === "build"
      ? params.calls.expected * (1 + params.retries.expected) * iterations
      : params.calls.expected *
        (1 + params.retries.expected) *
        params.volumeMultiplier.expected *
        monthlyMultiplier;

  const tokensByModel: Record<string, TokenBreakdown> = {};
  const costByModel: Record<string, CostRange> = {};

  let primaryExplainTree: ExplainNode | null = null;

  for (const model of models) {
    const pricing = findActivePricing(model.id, catalogPricing, referenceTime);
    const inputPrice = pricing?.inputPerMTok ?? 0;
    const outputPrice = pricing?.outputPerMTok ?? 0;
    const cachedPrice = pricing?.cachedInputPerMTok ?? inputPrice;

    // Expected tokens per call breakdown
    const tpcExp = params.tokensPerCall.expected;
    const rawInputExp = Math.round(tpcExp * ratioInput);
    const rawOutputExp = tpcExp - rawInputExp;

    const canCache = Boolean(model.supportsCaching && phase.cacheablePrefix);
    const cachedInputExp = canCache ? Math.round(rawInputExp * 0.5) : 0;
    const regularInputExp = rawInputExp - cachedInputExp;

    // Total phase tokens
    const totalInputTokens = Math.round(regularInputExp * volumeExpected);
    const totalCachedTokens =
      cachedInputExp > 0 ? Math.round(cachedInputExp * volumeExpected) : undefined;
    const totalOutputTokens = Math.round(rawOutputExp * volumeExpected);
    const totalPhaseTokens =
      totalInputTokens + (totalCachedTokens ?? 0) + totalOutputTokens;

    const tokenizer = TokenizerLayer.getTokenizer(model);
    const countSample = tokenizer.count("test");
    const label = countSample.label;
    const approximationMargin = countSample.margin;

    tokensByModel[model.id] = {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cachedInputTokens: totalCachedTokens,
      totalTokens: totalPhaseTokens,
      label,
      approximationMargin,
    };

    // Calculate scenario costs
    const calcCost = (
      calls: number,
      retries: number,
      volMult: number,
      tpc: number
    ): number => {
      const vol =
        phase.track === "build"
          ? calls * (1 + retries) * iterations
          : calls * (1 + retries) * volMult * monthlyMultiplier;

      const rawIn = Math.round(tpc * ratioInput);
      const rawOut = tpc - rawIn;
      const cachedIn = canCache ? Math.round(rawIn * 0.5) : 0;
      const regIn = rawIn - cachedIn;

      const costIn = (regIn * vol * inputPrice) / 1_000_000;
      const costCached = (cachedIn * vol * cachedPrice) / 1_000_000;
      const costOut = (rawOut * vol * outputPrice) / 1_000_000;

      return round4(costIn + costCached + costOut);
    };

    const lowCost = calcCost(
      params.calls.low,
      params.retries.low,
      params.volumeMultiplier.low,
      params.tokensPerCall.low
    );
    const expCost = calcCost(
      params.calls.expected,
      params.retries.expected,
      params.volumeMultiplier.expected,
      params.tokensPerCall.expected
    );
    const highCost = calcCost(
      params.calls.high,
      params.retries.high,
      params.volumeMultiplier.high,
      params.tokensPerCall.high
    );

    costByModel[model.id] = {
      low: lowCost,
      expected: expCost,
      high: highCost,
      currency: "USD",
      pricingVerifiedAt: pricing?.verifiedAt,
    };

    if (!primaryExplainTree) {
      primaryExplainTree = {
        label: `Phase Cost: ${phase.name}`,
        formula: "(regularInputCost + cachedInputCost + outputCost)",
        inputs: {
          model: model.label,
          track: phase.track,
          callsExpected: params.calls.expected,
          tokensPerCallExpected: tpcExp,
          retriesExpected: params.retries.expected,
          volumeExpected,
          inputPerMTok: inputPrice,
          outputPerMTok: outputPrice,
        },
        result: expCost,
        children: [
          {
            label: "Call Volume",
            formula:
              phase.track === "build"
                ? "calls * (1 + retries) * iterations"
                : "calls * (1 + retries) * volumeMultiplier * requestsPerDay * monthlyDays",
            inputs:
              phase.track === "build"
                ? {
                    calls: params.calls.expected,
                    retries: params.retries.expected,
                    iterations,
                  }
                : {
                    calls: params.calls.expected,
                    retries: params.retries.expected,
                    volumeMultiplier: params.volumeMultiplier.expected,
                    requestsPerDay,
                    monthlyDays,
                  },
            result: volumeExpected,
          },
          {
            label: "Tokens Per Call Breakdown",
            formula: "regularInput + cachedInput + output",
            inputs: {
              regularInput: regularInputExp,
              cachedInput: cachedInputExp,
              output: rawOutputExp,
            },
            result: tpcExp,
          },
          {
            label: "Total Expected Phase Tokens",
            formula: "volumeExpected * tokensPerCallExpected",
            inputs: {
              volumeExpected,
              tokensPerCallExpected: tpcExp,
            },
            result: totalPhaseTokens,
          },
        ],
      };
    }
  }

  const explainTree: ExplainNode = primaryExplainTree ?? {
    label: `Phase Cost: ${phase.name}`,
    formula: "0",
    inputs: {},
    result: 0,
  };

  return {
    phase,
    params,
    tokensByModel,
    costByModel,
    explainTree,
  };
}

/**
 * Pure, deterministic estimation engine.
 * (FR-017, FR-018, FR-019, FR-020, FR-021, FR-022, Principle IV, Principle XII)
 *
 * Guarantees:
 * - Deterministic: identical profile, catalog, and overrides produce byte-identical EstimationResult.
 * - Zero LLM or network calls.
 * - Validates all phases through PhaseResolver.
 * - Supports parameter overrides with low <= expected <= high validation.
 * - Computes BUILD and RUNTIME tracks with model cost ranges and explainability trees.
 */
export function estimate(
  profile: ProjectProfile,
  catalog: Pick<CatalogSnapshot, "phases" | "models" | "pricing" | "publishedAt">,
  overrides?: PhaseOverride[]
): EstimationResult {
  const resolvedPhases = PhaseResolver.resolve(profile.phases, catalog.phases);

  const activeModels = (catalog.models as Model[]).filter(
    (m: Model) => m.status === "active"
  );

  const referenceTime =
    catalog.publishedAt ??
    profile.finalizedAt ??
    profile.createdAt ??
    "2026-10-09T00:00:00.000Z";

  const overrideMap = new Map<string, PhaseOverride>();
  if (Array.isArray(overrides)) {
    for (const ov of overrides) {
      overrideMap.set(ov.phaseId, ov);
    }
  }

  const buildPhasesResult: PhaseResult[] = [];
  const runtimePhasesResult: PhaseResult[] = [];

  for (const resolved of resolvedPhases) {
    const comp = computePhase(
      resolved,
      profile,
      activeModels,
      catalog.pricing,
      referenceTime,
      overrideMap.get(resolved.id)
    );

    const phaseResult: PhaseResult = {
      phaseId: resolved.id,
      phaseName: resolved.name,
      params: comp.params as unknown as Record<string, unknown>,
      tokensByModel: comp.tokensByModel,
      costByModel: comp.costByModel,
      explainTree: comp.explainTree,
    };

    if (resolved.track === "build") {
      buildPhasesResult.push(phaseResult);
    } else {
      runtimePhasesResult.push(phaseResult);
    }
  }

  const computeTrackTotals = (phases: PhaseResult[]): Record<string, CostRange> => {
    const totals: Record<string, CostRange> = {};

    for (const model of activeModels) {
      let sumLow = 0;
      let sumExp = 0;
      let sumHigh = 0;
      let verifiedAt: string | undefined = undefined;

      for (const p of phases) {
        const cost = p.costByModel[model.id];
        if (cost) {
          sumLow += cost.low;
          sumExp += cost.expected;
          sumHigh += cost.high;
          if (!verifiedAt && cost.pricingVerifiedAt) {
            verifiedAt = cost.pricingVerifiedAt;
          }
        }
      }

      totals[model.id] = {
        low: round4(sumLow),
        expected: round4(sumExp),
        high: round4(sumHigh),
        currency: "USD",
        pricingVerifiedAt: verifiedAt,
      };
    }

    return totals;
  };

  const buildTotals = computeTrackTotals(buildPhasesResult);
  const runtimeTotals = computeTrackTotals(runtimePhasesResult);

  const buildTrack: TrackResult = {
    phases: buildPhasesResult,
    totalByModel: buildTotals,
  };

  const runtimeTrack: TrackResult = {
    phases: runtimePhasesResult,
    totalByModel: runtimeTotals,
  };

  // Primary model total for top-level totalExpectedCost
  const primaryModel = activeModels[0];
  const primaryBuild = primaryModel ? buildTotals[primaryModel.id]?.expected ?? 0 : 0;
  const primaryRuntime = primaryModel
    ? runtimeTotals[primaryModel.id]?.expected ?? 0
    : 0;
  const totalExpectedCost = round4(primaryBuild + primaryRuntime);

  // Deterministic generatedAt timestamp for byte-identical determinism
  const generatedAt =
    catalog.publishedAt ??
    profile.finalizedAt ??
    profile.createdAt ??
    "2026-10-09T00:00:00.000Z";

  return {
    profileVersion: profile.profileVersion,
    currency: "USD",
    build: buildTrack,
    runtime: runtimeTrack,
    totalExpectedCost,
    generatedAt,
  };
}

export const EstimationEngine = {
  estimate,
};
