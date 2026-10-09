import type { Phase, PhaseOverride } from "../protocol/types.js";

export class ParamValidationError extends Error {
  constructor(
    public readonly paramName: string,
    public readonly reason: string,
    public readonly values?: { low: number; expected: number; high: number }
  ) {
    super(`Invalid parameter range for '${paramName}': ${reason}`);
    this.name = "ParamValidationError";
  }
}

export interface MetricRange {
  low: number;
  expected: number;
  high: number;
}

export interface ResolvedParams {
  calls: MetricRange;
  tokensPerCall: MetricRange;
  retries: MetricRange;
  volumeMultiplier: MetricRange;
}

function validateRange(
  name: string,
  low: number,
  expected: number,
  high: number
): void {
  if (low > high) {
    throw new ParamValidationError(
      name,
      `low (${low}) cannot be greater than high (${high})`,
      { low, expected, high }
    );
  }
  if (expected < low) {
    throw new ParamValidationError(
      name,
      `expected (${expected}) cannot be less than low (${low})`,
      { low, expected, high }
    );
  }
  if (expected > high) {
    throw new ParamValidationError(
      name,
      `expected (${expected}) cannot be greater than high (${high})`,
      { low, expected, high }
    );
  }
}

/**
 * Pure function resolving default parameters and user overrides with boundary validation.
 * (FR-020, clarification Q2)
 */
export function resolveParams(
  defaultParams: Phase["defaultParams"],
  override?: PhaseOverride
): ResolvedParams {
  const callsLow = override?.callsLow ?? defaultParams.callsLow;
  const callsExpected = override?.callsExpected ?? defaultParams.callsExpected;
  const callsHigh = override?.callsHigh ?? defaultParams.callsHigh;
  validateRange("calls", callsLow, callsExpected, callsHigh);

  const tokensLow = override?.tokensPerCallLow ?? defaultParams.tokensPerCallLow;
  const tokensExpected =
    override?.tokensPerCallExpected ?? defaultParams.tokensPerCallExpected;
  const tokensHigh = override?.tokensPerCallHigh ?? defaultParams.tokensPerCallHigh;
  validateRange("tokensPerCall", tokensLow, tokensExpected, tokensHigh);

  const retriesLow = defaultParams.retriesLow;
  const retriesExpected =
    override?.retriesExpected ?? defaultParams.retriesExpected;
  const retriesHigh = defaultParams.retriesHigh;
  validateRange("retries", retriesLow, retriesExpected, retriesHigh);

  const volumeLow =
    defaultParams.volumeMultiplierLow ?? 1.0;
  const volumeExpected =
    override?.volumeMultiplierExpected ??
    defaultParams.volumeMultiplierExpected ??
    1.0;
  const volumeHigh =
    defaultParams.volumeMultiplierHigh ??
    Math.max(1.0, volumeExpected);
  validateRange("volumeMultiplier", volumeLow, volumeExpected, volumeHigh);

  return {
    calls: { low: callsLow, expected: callsExpected, high: callsHigh },
    tokensPerCall: { low: tokensLow, expected: tokensExpected, high: tokensHigh },
    retries: { low: retriesLow, expected: retriesExpected, high: retriesHigh },
    volumeMultiplier: {
      low: volumeLow,
      expected: volumeExpected,
      high: volumeHigh,
    },
  };
}

export const ParamResolver = {
  resolve: resolveParams,
};
