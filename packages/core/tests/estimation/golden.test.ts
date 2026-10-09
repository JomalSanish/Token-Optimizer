import { describe, it, expect } from "vitest";
import { estimate } from "../../src/estimation/EstimationEngine.js";
import { ProjectProfileSchema } from "../../src/profile/schema.js";
import { CatalogSnapshotSchema } from "../../src/catalog/schemas.js";
import { EstimationResultSchema } from "../../src/protocol/schemas.js";
import goldenProfileRaw from "../../../fixtures/profiles/ts-rag-chatbot.json";
import goldenEstimateRaw from "../../../fixtures/estimates/ts-rag-chatbot.json";
import catalogSnapshotRaw from "../../../extension/resources/catalog-snapshot.json";

describe("Estimation Golden File Tests (T075, T077, FR-019, Principle IV)", () => {
  const profile = ProjectProfileSchema.parse(goldenProfileRaw);
  const catalog = CatalogSnapshotSchema.parse(catalogSnapshotRaw);

  it("produces valid estimation conforming to EstimationResultSchema", () => {
    const result = estimate(profile, catalog);
    const parsed = EstimationResultSchema.parse(result);
    expect(parsed.profileVersion).toBe(profile.profileVersion);
    expect(parsed.build.phases).toHaveLength(2);
    expect(parsed.runtime.phases).toHaveLength(1);
    expect(parsed.totalExpectedCost).toBeGreaterThan(0);
  });

  it("matches golden file exactly (byte & numerical determinism)", () => {
    const actual = estimate(profile, catalog);
    expect(actual).toEqual(goldenEstimateRaw);
  });

  it("fails when a phase parameter changes", () => {
    const modifiedProfile = {
      ...profile,
      phases: profile.phases.map((p, idx) =>
        idx === 0 ? { ...p, name: "Mutated Name" } : p
      ),
    };

    const actual = estimate(modifiedProfile, catalog);
    expect(actual).not.toEqual(goldenEstimateRaw);
  });
});
