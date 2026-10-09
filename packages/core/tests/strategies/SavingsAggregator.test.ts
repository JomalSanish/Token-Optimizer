import { describe, it, expect } from "vitest";
import {
  SavingsAggregator,
  combineSavings,
} from "../../src/strategies/SavingsAggregator.js";
import type { Strategy } from "../../src/protocol/types.js";

const strategyA: Strategy = {
  id: "strat-cache",
  name: "Prompt Prefix Caching",
  group: "caching",
  targets: ["build", "runtime"],
  summary: "Caches static system prompt and few-shot examples.",
  savings: {
    minPercent: 30,
    maxPercent: 50,
    basis: "Documented provider prefix cache discount",
  },
  reviewStatus: "approved",
  reviewedBy: "Alice",
  reviewedAt: "2026-10-01T00:00:00.000Z",
};

const strategyB: Strategy = {
  id: "strat-compress",
  name: "Context Compression",
  group: "prompt-efficiency",
  targets: ["runtime"],
  summary: "Strips redundant conversational fluff and formatting.",
  savings: {
    minPercent: 20,
    maxPercent: 40,
    basis: "Observed token reduction across conversation history",
  },
  reviewStatus: "approved",
  reviewedBy: "Bob",
  reviewedAt: "2026-10-01T00:00:00.000Z",
};

const strategyFiftyOne: Strategy = {
  id: "strat-50a",
  name: "50% Savings Strategy A",
  group: "test",
  targets: ["runtime"],
  summary: "50% savings test",
  savings: {
    minPercent: 50,
    maxPercent: 50,
    basis: "Test basis",
  },
  reviewStatus: "approved",
  reviewedBy: "Charlie",
  reviewedAt: "2026-10-01T00:00:00.000Z",
};

const strategyFiftyTwo: Strategy = {
  id: "strat-50b",
  name: "50% Savings Strategy B",
  group: "test",
  targets: ["runtime"],
  summary: "50% savings test",
  savings: {
    minPercent: 50,
    maxPercent: 50,
    basis: "Test basis",
  },
  reviewStatus: "approved",
  reviewedBy: "Charlie",
  reviewedAt: "2026-10-01T00:00:00.000Z",
};

describe("SavingsAggregator (T070, T089, FR-029, Principle V)", () => {
  it("compounds two 50% strategies to 75% (never 100%)", () => {
    expect(SavingsAggregator.combine).toBe(combineSavings);
    const combined = combineSavings([strategyFiftyOne, strategyFiftyTwo], "runtime");

    // 1 - (1 - 0.5) * (1 - 0.5) = 1 - 0.25 = 0.75 (75%)
    expect(combined.minPercent).toBe(75);
    expect(combined.maxPercent).toBe(75);
    expect(combined.basis).toContain("Multiplicative compounding");
  });

  it("calculates min and max ranges multiplicatively and separately", () => {
    const combined = combineSavings([strategyA, strategyB], "runtime");

    // Min: 1 - (1 - 0.3) * (1 - 0.2) = 1 - 0.7 * 0.8 = 1 - 0.56 = 44%
    // Max: 1 - (1 - 0.5) * (1 - 0.4) = 1 - 0.5 * 0.6 = 1 - 0.30 = 70%
    expect(combined.minPercent).toBe(44);
    expect(combined.maxPercent).toBe(70);
  });

  it("filters strategies strictly by target track", () => {
    // strategyB only targets runtime, strategyA targets build + runtime
    const buildCombined = combineSavings([strategyA, strategyB], "build");

    expect(buildCombined.minPercent).toBe(30);
    expect(buildCombined.maxPercent).toBe(50);
  });

  it("returns 0% when no strategies match the track or input is empty", () => {
    expect(combineSavings([], "build").minPercent).toBe(0);
    expect(combineSavings([strategyB], "build").minPercent).toBe(0);
  });
});
