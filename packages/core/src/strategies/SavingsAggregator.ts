import type { SavingsRange, Strategy } from "../protocol/types.js";

/**
 * Pure function combining individual strategy savings multiplicatively per track.
 * (FR-029, Principle V)
 *
 * Guarantees:
 * - Multiplicative compounding: 1 - prod(1 - s/100) for min and max separately.
 * - Two 50% strategies compound to 75%, never 100%.
 * - Clamped within [0, 100]%.
 * - Unqualified percentage claims never appear; basis is always stated.
 */
export function combineSavings(
  strategies: Strategy[],
  track: "build" | "runtime"
): SavingsRange {
  if (!Array.isArray(strategies) || strategies.length === 0) {
    return {
      minPercent: 0,
      maxPercent: 0,
      basis: "No applicable strategies active",
      unit: "percent",
      appliesTo: "total",
    };
  }

  const applicable = strategies.filter((s) => s.targets.includes(track));

  if (applicable.length === 0) {
    return {
      minPercent: 0,
      maxPercent: 0,
      basis: `No strategies targeted to ${track} track`,
      unit: "percent",
      appliesTo: "total",
    };
  }

  let minRemaining = 1.0;
  let maxRemaining = 1.0;

  for (const strat of applicable) {
    const minP = Math.max(0, Math.min(100, strat.savings.minPercent)) / 100;
    const maxP = Math.max(0, Math.min(100, strat.savings.maxPercent)) / 100;

    minRemaining *= 1 - minP;
    maxRemaining *= 1 - maxP;
  }

  const rawMin = (1 - minRemaining) * 100;
  const rawMax = (1 - maxRemaining) * 100;

  const minPercent = Math.min(100, Math.max(0, Math.round(rawMin * 10) / 10));
  const maxPercent = Math.min(100, Math.max(0, Math.round(rawMax * 10) / 10));

  const names = applicable.map((s) => s.name).join(", ");
  const basis = `Multiplicative compounding of ${applicable.length} strategy(ies) (${names}) on ${track} track`;

  return {
    minPercent,
    maxPercent,
    basis: basis.length > 500 ? basis.slice(0, 497) + "..." : basis,
    unit: "percent",
    appliesTo: "total",
  };
}

export const SavingsAggregator = {
  combine: combineSavings,
};
