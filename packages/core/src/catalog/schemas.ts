import { z } from "zod";
import {
  ISO8601Schema,
  ProviderSchema,
  ModelSchema,
  PricingSchema,
  PhaseSchema,
  StrategySchema,
  PlatformSchema,
  PromptTemplateSchema,
} from "../protocol/schemas.js";

export {
  ProviderSchema,
  ModelSchema,
  PricingSchema,
  PhaseSchema,
  StrategySchema,
  PlatformSchema,
  PromptTemplateSchema,
};

export const CatalogMetaSchema = z
  .object({
    version: z.number().int().positive(),
    publishedAt: ISO8601Schema,
    schemaVersion: z.string().min(1).max(20),
  })
  .strict();

export const CatalogSnapshotSchema = z
  .object({
    version: z.number().int().positive(),
    schemaVersion: z.string().min(1).max(20),
    publishedAt: ISO8601Schema,
    providers: z.array(ProviderSchema),
    models: z.array(ModelSchema),
    pricing: z.array(PricingSchema),
    phases: z.array(PhaseSchema),
    strategies: z.array(StrategySchema),
    platforms: z.array(PlatformSchema),
    promptTemplates: z.array(PromptTemplateSchema),
  })
  .strict();

export type CatalogMeta = z.infer<typeof CatalogMetaSchema>;
export type CatalogSnapshot = z.infer<typeof CatalogSnapshotSchema>;
