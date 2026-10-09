import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Db } from "mongodb";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildServer } from "../../src/server.js";
import { CatalogSnapshotSchema } from "@token-optimizer/core";
import { runMigrations } from "@token-optimizer/catalog-tools";
import { seedCatalog } from "@token-optimizer/catalog-tools";

describe("Catalog API Contract Tests (T038, contracts/catalog-api.yaml, Principle III, VIII)", () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let server: ReturnType<typeof buildServer>;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("test_catalog");

    // Run all 8 migrations
    const migrationsDir = path.resolve(__dirname, "../../migrations");
    await runMigrations(db, { migrationsDir });

    // Seed test catalog data from maintainer JSON
    const seedDataPath = path.resolve(
      __dirname,
      "../../../catalog-tools/data/seed-catalog.json"
    );
    const rawSeed = JSON.parse(fs.readFileSync(seedDataPath, "utf-8"));
    await seedCatalog(db, rawSeed);

    server = buildServer({ db });
  }, 60000);

  afterAll(async () => {
    if (client) await client.close();
    if (mongod) await mongod.stop();
  });

  it("GET /v1/health returns status ok and catalog version", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/v1/health",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe("ok");
    expect(body.catalogVersion).toBeGreaterThanOrEqual(1);
    expect(body.dbConnected).toBe(true);
  });

  it("GET /v1/catalog returns 200 with schema-valid snapshot and ETag", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/v1/catalog",
    });

    expect(res.statusCode).toBe(200);
    const etag = res.headers["etag"];
    expect(etag).toBeDefined();
    expect(typeof etag).toBe("string");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");

    const body = JSON.parse(res.body);
    // Validate against CatalogSnapshotSchema
    const validated = CatalogSnapshotSchema.parse(body);
    expect(validated.version).toBeGreaterThanOrEqual(1);
    expect(validated.providers.length).toBeGreaterThan(0);
    expect(validated.models.length).toBeGreaterThan(0);
    expect(validated.pricing.length).toBeGreaterThan(0);
    expect(validated.phases.length).toBeGreaterThan(0);
    expect(validated.platforms.length).toBeGreaterThan(0);
    expect(validated.promptTemplates.length).toBeGreaterThan(0);

    // Principle VIII: Strategies served by API must only have reviewStatus: 'approved'
    for (const strategy of validated.strategies) {
      expect(strategy.reviewStatus).toBe("approved");
    }

    // Principle VII: Pricing records must have sourceUrl and verifiedAt
    for (const pricing of validated.pricing) {
      expect(pricing.sourceUrl).toBeDefined();
      expect(pricing.verifiedAt).toBeDefined();
    }
  });

  it("GET /v1/catalog returns 304 Not Modified when matching If-None-Match is sent", async () => {
    const firstRes = await server.inject({
      method: "GET",
      url: "/v1/catalog",
    });
    expect(firstRes.statusCode).toBe(200);
    const etag = firstRes.headers["etag"] as string;

    const secondRes = await server.inject({
      method: "GET",
      url: "/v1/catalog",
      headers: {
        "if-none-match": etag,
      },
    });

    expect(secondRes.statusCode).toBe(304);
    expect(secondRes.body).toBe("");
  });

  it("GET /v1/catalog/:collection returns collection payload with version and items", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/v1/catalog/models",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.collection).toBe("models");
    expect(body.version).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });

  it("GET /v1/catalog/unknown_collection returns 404", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/v1/catalog/unknown_collection",
    });

    expect(res.statusCode).toBe(404);
  });

  it("Principle VIII Gate: draft strategies are invisible; only approved strategies with named reviewer are served", async () => {
    // 1. Initial seeded state: strategies are in draft, so /v1/catalog serves 0 strategies
    const initialRes = await server.inject({
      method: "GET",
      url: "/v1/catalog",
    });
    const initialBody = JSON.parse(initialRes.body);
    expect(initialBody.strategies.length).toBe(0);

    // 2. Approve one strategy via human review workflow
    const { approveStrategy } = await import("@token-optimizer/catalog-tools");
    await approveStrategy(db, "prompt-prefix-caching", "Alice (Reviewer)");

    // 3. Now /v1/catalog serves exactly the approved strategy
    const afterRes = await server.inject({
      method: "GET",
      url: "/v1/catalog",
    });
    const afterBody = JSON.parse(afterRes.body);
    expect(afterBody.strategies.length).toBe(1);
    expect(afterBody.strategies[0].id).toBe("prompt-prefix-caching");
    expect(afterBody.strategies[0].reviewStatus).toBe("approved");
    expect(afterBody.strategies[0].reviewedBy).toBe("Alice (Reviewer)");
    expect(afterBody.strategies[0].reviewedAt).toBeDefined();
  });

  it("Rate Limiting: opt-in rate limit configuration is supported without crashing", () => {
    const rateLimitedServer = buildServer({ db, enableRateLimit: true });
    expect(rateLimitedServer).toBeDefined();
  });
});
