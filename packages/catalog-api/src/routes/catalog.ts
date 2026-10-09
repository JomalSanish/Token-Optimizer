import type { FastifyPluginAsync } from "fastify";
import type { Db } from "mongodb";
import {
  CatalogSnapshotSchema,
  ProviderSchema,
  ModelSchema,
  PricingSchema,
  PhaseSchema,
  StrategySchema,
  PlatformSchema,
  PromptTemplateSchema,
  type CatalogSnapshot,
} from "@token-optimizer/core";
import { generateETag, matchesETag, CACHE_CONTROL_HEADER } from "../db/etag.js";

export interface CatalogRouteOptions {
  db: Db | null;
}

const ALLOWED_COLLECTIONS = [
  "providers",
  "models",
  "pricing",
  "phases",
  "strategies",
  "platforms",
  "prompt_templates",
  "promptTemplates",
];

const stripId = <T extends Record<string, unknown>>(doc: T): Omit<T, "_id"> => {
  const { _id, ...rest } = doc;
  return rest;
};

export const catalogRoutes: FastifyPluginAsync<CatalogRouteOptions> = async (
  fastify,
  opts
) => {
  const { db } = opts;

  // GET /v1/catalog - full catalog snapshot with ETag
  fastify.get("/catalog", async (request, reply) => {
    if (!db) {
      return reply.status(503).send({ error: "Database not connected" });
    }

    try {
      const metaDoc = await db.collection("catalog_meta").findOne({});
      const version = metaDoc?.version ?? 1;
      const schemaVersion = metaDoc?.schemaVersion ?? "1.0";
      const publishedAt = metaDoc?.publishedAt ?? new Date().toISOString();

      const etag = generateETag(version, publishedAt);
      const ifNoneMatch = request.headers["if-none-match"];

      reply.header("ETag", etag);
      reply.header("Cache-Control", CACHE_CONTROL_HEADER);

      if (matchesETag(ifNoneMatch, etag)) {
        return reply.status(304).send();
      }

      const providers = (await db.collection("providers").find({}).toArray()).map(stripId);
      const models = (await db.collection("models").find({}).toArray()).map(stripId);
      const pricing = (await db.collection("pricing").find({}).toArray()).map(stripId);
      const phases = (await db.collection("phases").find({}).toArray()).map(stripId);

      // Principle VIII: Only return approved strategies
      const strategies = (
        await db.collection("strategies").find({ reviewStatus: "approved" }).toArray()
      ).map(stripId);

      const platforms = (await db.collection("platforms").find({}).toArray()).map(stripId);
      const promptTemplates = (
        await db.collection("prompt_templates").find({}).toArray()
      ).map(stripId);

      const rawSnapshot: CatalogSnapshot = {
        version,
        schemaVersion,
        publishedAt,
        providers: providers as unknown as CatalogSnapshot["providers"],
        models: models as unknown as CatalogSnapshot["models"],
        pricing: pricing as unknown as CatalogSnapshot["pricing"],
        phases: phases as unknown as CatalogSnapshot["phases"],
        strategies: strategies as unknown as CatalogSnapshot["strategies"],
        platforms: platforms as unknown as CatalogSnapshot["platforms"],
        promptTemplates: promptTemplates as unknown as CatalogSnapshot["promptTemplates"],
      };

      // Zod-validate response against CatalogSnapshotSchema
      const snapshot = CatalogSnapshotSchema.parse(rawSnapshot);
      return reply.status(200).send(snapshot);
    } catch (err) {
      request.log.error(err, "Failed to load catalog snapshot");
      return reply.status(503).send({ error: "Failed to assemble catalog snapshot" });
    }
  });

  // GET /v1/catalog/:collection - single collection
  fastify.get<{ Params: { collection: string } }>(
    "/catalog/:collection",
    async (request, reply) => {
      const { collection } = request.params;

      if (!ALLOWED_COLLECTIONS.includes(collection)) {
        return reply.status(404).send({
          error: "Not Found",
          message: `Unknown collection '${collection}'`,
        });
      }

      if (!db) {
        return reply.status(503).send({ error: "Database not connected" });
      }

      try {
        const metaDoc = await db.collection("catalog_meta").findOne({});
        const version = metaDoc?.version ?? 1;
        const publishedAt = metaDoc?.publishedAt ?? new Date().toISOString();

        const etag = generateETag(version, `${collection}:${publishedAt}`);
        const ifNoneMatch = request.headers["if-none-match"];

        reply.header("ETag", etag);
        reply.header("Cache-Control", CACHE_CONTROL_HEADER);

        if (matchesETag(ifNoneMatch, etag)) {
          return reply.status(304).send();
        }

        const mongoColName = collection === "promptTemplates" ? "prompt_templates" : collection;
        const filter = collection === "strategies" ? { reviewStatus: "approved" } : {};

        const rawDocs = await db.collection(mongoColName).find(filter).toArray();
        const items = rawDocs.map(stripId);

        // Validate items with corresponding Zod schemas
        if (collection === "providers") {
          items.forEach((item) => ProviderSchema.parse(item));
        } else if (collection === "models") {
          items.forEach((item) => ModelSchema.parse(item));
        } else if (collection === "pricing") {
          items.forEach((item) => PricingSchema.parse(item));
        } else if (collection === "phases") {
          items.forEach((item) => PhaseSchema.parse(item));
        } else if (collection === "strategies") {
          items.forEach((item) => StrategySchema.parse(item));
        } else if (collection === "platforms") {
          items.forEach((item) => PlatformSchema.parse(item));
        } else if (collection === "prompt_templates" || collection === "promptTemplates") {
          items.forEach((item) => PromptTemplateSchema.parse(item));
        }

        return reply.status(200).send({
          collection,
          version,
          items,
        });
      } catch (err) {
        request.log.error(err, `Failed to load collection '${collection}'`);
        return reply.status(500).send({ error: `Failed to load collection '${collection}'` });
      }
    }
  );
};
