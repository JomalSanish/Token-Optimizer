import type {
  EstimateStageInput,
  OptimizeStageInput,
  OptimizeStageOutput,
  ProviderAdapter,
  HostModelAdapter,
  ProviderCompletionResult,
} from "../pipeline/contracts.js";
import type { EstimationResult } from "../protocol/types.js";

export class SpyProviderAdapter implements ProviderAdapter {
  public callCount = 0;
  public prompts: string[] = [];

  async complete(
    prompt: string,
    _options?: { signal?: AbortSignal }
  ): Promise<ProviderCompletionResult> {
    this.callCount++;
    this.prompts.push(prompt);
    return {
      text: JSON.stringify({
        narrative: "Mock narrative",
        profile: {
          schemaVersion: "1.0",
          projectType: "rag-chatbot",
          overview: "Mock overview",
          techStack: [],
          llm: {
            providers: ["anthropic"],
            usesRag: true,
            usesAgents: false,
            avgPromptTokens: 500,
            avgOutputTokens: 200,
          },
          components: [],
          dataFlow: "",
          scale: { requestsPerDay: 100 },
          buildAssumptions: { teamSize: 1, sprintWeeks: 2, iterationsPerFeature: 1 },
          phases: [],
          constraints: [],
          profileVersion: 1,
          createdAt: "2026-10-08T00:00:00.000Z",
        },
      }),
      usage: {
        inputTokens: 500,
        outputTokens: 200,
      },
    };
  }

  async *completeStream(
    _prompt: string,
    _options?: { signal?: AbortSignal }
  ): AsyncIterable<string> {
    yield "Mock stream chunk";
  }

  reset(): void {
    this.callCount = 0;
    this.prompts = [];
  }
}

export class SpyHostModelAdapter implements HostModelAdapter {
  public callCount = 0;
  public requests: string[] = [];

  async sendRequest(
    prompt: string,
    _options?: { signal?: AbortSignal }
  ): Promise<string> {
    this.callCount++;
    this.requests.push(prompt);
    return "Mock host model response";
  }

  reset(): void {
    this.callCount = 0;
    this.requests = [];
  }
}

/**
 * Pure deterministic estimate stage execution for test harness.
 * Guaranteed to make ZERO calls to any LLM or external adapter.
 */
export function runEstimateStage(input: EstimateStageInput): EstimationResult {
  const clock = input.clock ?? (() => "2026-10-08T00:00:00.000Z");
  return {
    profileVersion: input.profile.profileVersion,
    currency: "USD",
    build: {
      phases: [],
      totalByModel: {},
    },
    runtime: {
      phases: [],
      totalByModel: {},
    },
    totalExpectedCost: 0,
    generatedAt: clock(),
  };
}

/**
 * Pure deterministic optimize stage execution for test harness.
 * Guaranteed to make ZERO calls to any LLM or external adapter.
 */
export function runOptimizeStage(input: OptimizeStageInput): OptimizeStageOutput {
  return {
    preselected: input.strategies.slice(0, 1).map((s) => ({
      strategyId: s.id,
      reason: s.reasonTemplate || "Catalog default recommendation",
    })),
    notPreselected: input.strategies.slice(1).map((s) => ({
      strategyId: s.id,
      reason: "Predicate requirement not met",
    })),
    conflicts: [],
    savings: {
      build: { minPercent: 5, maxPercent: 15, basis: "Catalog empirical range" },
      runtime: { minPercent: 10, maxPercent: 25, basis: "Catalog empirical range" },
    },
  };
}
