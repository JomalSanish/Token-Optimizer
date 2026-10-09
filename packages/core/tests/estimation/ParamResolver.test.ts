import { describe, it, expect } from "vitest";
import {
  ParamResolver,
  resolveParams,
  ParamValidationError,
} from "../../src/estimation/ParamResolver.js";
import type { Phase, PhaseOverride } from "../../src/protocol/types.js";

const sampleDefaultParams: Phase["defaultParams"] = {
  callsLow: 2,
  callsExpected: 10,
  callsHigh: 30,
  tokensPerCallLow: 500,
  tokensPerCallExpected: 2000,
  tokensPerCallHigh: 5000,
  retriesLow: 0,
  retriesExpected: 1,
  retriesHigh: 3,
  volumeMultiplierLow: 1.0,
  volumeMultiplierExpected: 1.0,
  volumeMultiplierHigh: 2.0,
};

describe("ParamResolver (T071, FR-020, clarification Q2)", () => {
  it("resolves default parameters when no override is provided", () => {
    expect(ParamResolver.resolve).toBe(resolveParams);
    const resolved = resolveParams(sampleDefaultParams);

    expect(resolved.calls).toEqual({ low: 2, expected: 10, high: 30 });
    expect(resolved.tokensPerCall).toEqual({
      low: 500,
      expected: 2000,
      high: 5000,
    });
    expect(resolved.retries).toEqual({ low: 0, expected: 1, high: 3 });
    expect(resolved.volumeMultiplier).toEqual({
      low: 1.0,
      expected: 1.0,
      high: 2.0,
    });
  });

  it("applies valid user overrides correctly", () => {
    const override: PhaseOverride = {
      phaseId: "test-phase",
      callsLow: 5,
      callsExpected: 15,
      callsHigh: 25,
      tokensPerCallExpected: 3500,
      retriesExpected: 2,
    };

    const resolved = resolveParams(sampleDefaultParams, override);

    expect(resolved.calls).toEqual({ low: 5, expected: 15, high: 25 });
    expect(resolved.tokensPerCall.expected).toBe(3500);
    expect(resolved.tokensPerCall.low).toBe(500); // kept default
    expect(resolved.retries.expected).toBe(2);
  });

  it("throws ParamValidationError when low > high", () => {
    const invalidOverride: PhaseOverride = {
      phaseId: "test-phase",
      callsLow: 40,
      callsHigh: 20,
    };

    expect(() => resolveParams(sampleDefaultParams, invalidOverride)).toThrowError(
      ParamValidationError
    );
  });

  it("throws ParamValidationError when expected < low", () => {
    const invalidOverride: PhaseOverride = {
      phaseId: "test-phase",
      callsExpected: 1, // sample default callsLow is 2
    };

    expect(() => resolveParams(sampleDefaultParams, invalidOverride)).toThrowError(
      ParamValidationError
    );
  });

  it("throws ParamValidationError when expected > high", () => {
    const invalidOverride: PhaseOverride = {
      phaseId: "test-phase",
      tokensPerCallExpected: 10000, // sample default high is 5000
    };

    expect(() => resolveParams(sampleDefaultParams, invalidOverride)).toThrowError(
      ParamValidationError
    );
  });
});
