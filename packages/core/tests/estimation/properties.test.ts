import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { estimate } from "../../src/estimation/EstimationEngine.js";
import { ProjectProfileSchema, type ProjectProfile } from "../../src/profile/schema.js";
import { CatalogSnapshotSchema } from "../../src/catalog/schemas.js";
import type { PhaseOverride } from "../../src/protocol/types.js";
import goldenProfileRaw from "../../../fixtures/profiles/ts-rag-chatbot.json";
import catalogSnapshotRaw from "../../../extension/resources/catalog-snapshot.json";

describe("Estimation Property Tests (T076, FR-019, Principle IV)", () => {
  const baseProfile: ProjectProfile = ProjectProfileSchema.parse(goldenProfileRaw);
  const catalog = CatalogSnapshotSchema.parse(catalogSnapshotRaw);

  it("Property (a): Monotonicity - doubling calls never decreases cost", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 100, max: 8000 }),
        (calls, tokensPerCall) => {
          const overrides1: PhaseOverride[] = [
            {
              phaseId: "phase-architecture",
              callsLow: calls,
              callsExpected: calls,
              callsHigh: calls * 2,
              tokensPerCallLow: tokensPerCall,
              tokensPerCallExpected: tokensPerCall,
              tokensPerCallHigh: tokensPerCall * 2,
            },
          ];

          const overrides2: PhaseOverride[] = [
            {
              phaseId: "phase-architecture",
              callsLow: calls * 2,
              callsExpected: calls * 2,
              callsHigh: calls * 4,
              tokensPerCallLow: tokensPerCall,
              tokensPerCallExpected: tokensPerCall,
              tokensPerCallHigh: tokensPerCall * 2,
            },
          ];

          const est1 = estimate(baseProfile, catalog, overrides1);
          const est2 = estimate(baseProfile, catalog, overrides2);

          // For every model, doubling calls must result in cost2 >= cost1
          for (const model of catalog.models) {
            const cost1 = est1.build.totalByModel[model.id];
            const cost2 = est2.build.totalByModel[model.id];
            if (cost1 && cost2) {
              expect(cost2.expected).toBeGreaterThanOrEqual(cost1.expected);
              expect(cost2.high).toBeGreaterThanOrEqual(cost1.high);
              expect(cost2.low).toBeGreaterThanOrEqual(cost1.low);
            }
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("Property (b): Determinism - identical inputs produce identical outputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 500, max: 5000 }),
        (calls, tokens) => {
          const overrides: PhaseOverride[] = [
            {
              phaseId: "phase-implementation",
              callsLow: calls,
              callsExpected: calls,
              callsHigh: calls * 2,
              tokensPerCallLow: tokens,
              tokensPerCallExpected: tokens,
              tokensPerCallHigh: tokens * 2,
            },
          ];

          const run1 = estimate(baseProfile, catalog, overrides);
          const run2 = estimate(baseProfile, catalog, overrides);

          expect(run1).toEqual(run2);
          expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
        }
      ),
      { numRuns: 200 }
    );
  });

  it("Property (c): Sum of phases equals track total for all models", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 10, max: 200 }),
        (callsArch, callsImpl, callsQuery) => {
          const overrides: PhaseOverride[] = [
            {
              phaseId: "phase-architecture",
              callsLow: callsArch,
              callsExpected: callsArch,
              callsHigh: callsArch * 2,
            },
            {
              phaseId: "phase-implementation",
              callsLow: callsImpl,
              callsExpected: callsImpl,
              callsHigh: callsImpl * 2,
            },
            {
              phaseId: "phase-query-answering",
              callsLow: callsQuery,
              callsExpected: callsQuery,
              callsHigh: callsQuery * 2,
            },
          ];

          const res = estimate(baseProfile, catalog, overrides);

          for (const model of catalog.models) {
            // Build track verification
            const buildSum = res.build.phases.reduce((acc, p) => {
              return acc + (p.costByModel[model.id]?.expected ?? 0);
            }, 0);
            const buildTrackExpected = res.build.totalByModel[model.id]?.expected ?? 0;
            expect(Math.abs(buildTrackExpected - buildSum)).toBeLessThanOrEqual(0.0002);

            // Runtime track verification
            const runtimeSum = res.runtime.phases.reduce((acc, p) => {
              return acc + (p.costByModel[model.id]?.expected ?? 0);
            }, 0);
            const runtimeTrackExpected = res.runtime.totalByModel[model.id]?.expected ?? 0;
            expect(Math.abs(runtimeTrackExpected - runtimeSum)).toBeLessThanOrEqual(0.0002);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});
