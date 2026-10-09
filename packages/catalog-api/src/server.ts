import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";

/**
 * Builds the Fastify server for the read-only Catalog API.
 * CORS Policy: Permissive for read-only GET endpoints (public catalog data),
 * allowing VS Code webviews and local developer tooling access.
 */
export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  // Public read-only catalog allows cross-origin requests from webviews and browser extensions
  app.register(cors, {
    origin: true,
    methods: ["GET"],
  });

  app.get("/v1/health", async () => {
    return { status: "ok" };
  });

  return app;
}
