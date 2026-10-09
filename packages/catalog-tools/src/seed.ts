import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, type Db } from "mongodb";
import { loadEnv } from "./env.js";
import {
  ModelSchema,
  PricingSchema,
  ProviderSchema,
  PhaseSchema,
  StrategySchema,
  PlatformSchema,
  PromptTemplateSchema,
  CatalogMetaSchema,
} from "@token-optimizer/core";

export interface SeedPayload {
  meta?: unknown;
  providers?: unknown[];
  models?: unknown[];
  pricing?: unknown[];
  phases?: unknown[];
  strategies?: unknown[];
  platforms?: unknown[];
  promptTemplates?: unknown[];
}

export interface SeedResult {
  modelsCount: number;
  pricingCount: number;
  providersCount: number;
  phasesCount: number;
  strategiesCount: number;
  platformsCount: number;
  promptTemplatesCount: number;
}

export async function seedCatalog(db: Db, rawData: SeedPayload): Promise<SeedResult> {
  const result: SeedResult = {
    modelsCount: 0,
    pricingCount: 0,
    providersCount: 0,
    phasesCount: 0,
    strategiesCount: 0,
    platformsCount: 0,
    promptTemplatesCount: 0,
  };

  // 1. Validate & Seed Providers
  if (Array.isArray(rawData.providers)) {
    const col = db.collection("providers");
    for (const item of rawData.providers) {
      const parsed = ProviderSchema.parse(item);
      await col.updateOne({ id: parsed.id }, { $set: parsed }, { upsert: true });
      result.providersCount++;
    }
  }

  // 2. Validate & Seed Models
  if (Array.isArray(rawData.models)) {
    const col = db.collection("models");
    for (const item of rawData.models) {
      const parsed = ModelSchema.parse(item);
      await col.updateOne({ id: parsed.id }, { $set: parsed }, { upsert: true });
      result.modelsCount++;
    }
  }

  // 3. Validate & Seed Pricing (Principle VII Auditability Check)
  if (Array.isArray(rawData.pricing)) {
    const col = db.collection("pricing");
    for (const item of rawData.pricing) {
      const raw = item as Record<string, unknown>;
      if (!raw.sourceUrl || typeof raw.sourceUrl !== "string") {
        throw new Error(
          `Principle VII violation: Pricing row for model '${raw?.modelId}' is missing required 'sourceUrl'`
        );
      }
      if (!raw.verifiedAt || typeof raw.verifiedAt !== "string") {
        throw new Error(
          `Principle VII violation: Pricing row for model '${raw?.modelId}' is missing required 'verifiedAt'`
        );
      }

      const parsed = PricingSchema.parse(item);
      await col.updateOne(
        { modelId: parsed.modelId, effectiveFrom: parsed.effectiveFrom },
        { $set: parsed },
        { upsert: true }
      );
      result.pricingCount++;
    }
  }

  // 4. Validate & Seed Phases
  if (Array.isArray(rawData.phases)) {
    const col = db.collection("phases");
    for (const item of rawData.phases) {
      const parsed = PhaseSchema.parse(item);
      await col.updateOne({ id: parsed.id }, { $set: parsed }, { upsert: true });
      result.phasesCount++;
    }
  }

  // 5. Validate & Seed Strategies (Principle VIII: Seeds only ever write reviewStatus: "draft")
  if (Array.isArray(rawData.strategies)) {
    const col = db.collection("strategies");
    for (const item of rawData.strategies) {
      const raw = item as Record<string, unknown>;
      if (raw.reviewStatus === "approved") {
        throw new Error(
          `Principle VIII violation: Seed scripts must only write reviewStatus='draft'. Strategy '${String(raw.id)}' cannot be seeded directly as approved; approval requires the human review workflow.`
        );
      }
      const docToParse = {
        ...raw,
        reviewStatus: "draft" as const,
      };
      const parsed = StrategySchema.parse(docToParse);
      await col.updateOne({ id: parsed.id }, { $set: parsed }, { upsert: true });
      result.strategiesCount++;
    }
  }

  // 6. Validate & Seed Platforms
  if (Array.isArray(rawData.platforms)) {
    const col = db.collection("platforms");
    for (const item of rawData.platforms) {
      const parsed = PlatformSchema.parse(item);
      await col.updateOne({ id: parsed.id }, { $set: parsed }, { upsert: true });
      result.platformsCount++;
    }
  }

  // 7. Validate & Seed Prompt Templates
  if (Array.isArray(rawData.promptTemplates)) {
    const col = db.collection("prompt_templates");
    for (const item of rawData.promptTemplates) {
      const parsed = PromptTemplateSchema.parse(item);
      await col.updateOne({ id: parsed.id }, { $set: parsed }, { upsert: true });
      result.promptTemplatesCount++;
    }
  }

  // 8. Meta
  if (rawData.meta) {
    const col = db.collection("catalog_meta");
    const parsed = CatalogMetaSchema.parse(rawData.meta);
    await col.updateOne({ version: parsed.version }, { $set: parsed }, { upsert: true });
  }

  return result;
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let filePath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && args[i + 1]) {
      filePath = args[i + 1];
      i++;
    }
  }

  if (!filePath) {
    const defaultDataPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../data/seed-catalog.json"
    );
    if (fs.existsSync(defaultDataPath)) {
      filePath = defaultDataPath;
    } else {
      console.error("Usage: tsx seed.ts --file <path-to-json>");
      process.exit(1);
    }
  }

  loadEnv();
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("Error: MONGODB_URI environment variable is required.");
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const client = new MongoClient(mongoUri);

  client
    .connect()
    .then(async () => {
      const db = client.db();
      console.log(`Seeding catalog from ${filePath}...`);
      const res = await seedCatalog(db, raw);
      console.log("Seeding completed successfully:", res);
    })
    .then(() => client.close())
    .catch((err) => {
      console.error("Seeding failed:", err);
      client.close().finally(() => process.exit(1));
    });
}
