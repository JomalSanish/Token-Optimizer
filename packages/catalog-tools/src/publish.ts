import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, type Db } from "mongodb";
import { loadEnv } from "./env.js";
import {
  CatalogSnapshotSchema,
  type CatalogSnapshot,
} from "@token-optimizer/core";

export interface PublishOptions {
  snapshotPath?: string;
  writeBundled?: boolean;
}

export async function publishCatalog(
  db: Db,
  options: PublishOptions = {}
): Promise<{ version: number; snapshot: CatalogSnapshot }> {
  const metaCol = db.collection("catalog_meta");
  const metaDoc = await metaCol.findOne({});

  let newVersion = 1;
  const now = new Date().toISOString();

  if (metaDoc) {
    newVersion = (metaDoc.version || 0) + 1;
    await metaCol.updateOne(
      { _id: metaDoc._id },
      {
        $set: {
          version: newVersion,
          publishedAt: now,
          schemaVersion: metaDoc.schemaVersion || "1.0",
        },
      }
    );
  } else {
    await metaCol.insertOne({
      version: newVersion,
      publishedAt: now,
      schemaVersion: "1.0",
    });
  }

  // Fetch collections and clean _id
  const stripId = <T extends Record<string, unknown>>(doc: T): Omit<T, "_id"> => {
    const { _id, ...rest } = doc;
    return rest;
  };

  const providers = (await db.collection("providers").find({}).toArray()).map(stripId);
  const models = (await db.collection("models").find({}).toArray()).map(stripId);
  const pricing = (await db.collection("pricing").find({}).toArray()).map(stripId);
  const phases = (await db.collection("phases").find({}).toArray()).map(stripId);
  // Principle VIII: Only serve approved strategies
  const strategies = (
    await db.collection("strategies").find({ reviewStatus: "approved" }).toArray()
  ).map(stripId);
  const platforms = (await db.collection("platforms").find({}).toArray()).map(stripId);
  const promptTemplates = (
    await db.collection("prompt_templates").find({}).toArray()
  ).map(stripId);

  const rawSnapshot = {
    version: newVersion,
    schemaVersion: "1.0",
    publishedAt: now,
    providers,
    models,
    pricing,
    phases,
    strategies,
    platforms,
    promptTemplates,
  };

  const snapshot = CatalogSnapshotSchema.parse(rawSnapshot);

  if (options.snapshotPath || options.writeBundled) {
    const targets = options.snapshotPath
      ? [options.snapshotPath]
      : [
          path.resolve(process.cwd(), "packages/extension/resources/catalog-snapshot.json"),
          path.resolve(process.cwd(), "packages/core/resources/catalog-snapshot.json"),
        ];

    for (const target of targets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(snapshot, null, 2), "utf-8");
      console.log(`Snapshot written to ${target}`);
    }
  }

  return { version: newVersion, snapshot };
}

// CLI entry point
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  let shouldSnapshot = false;
  let customSnapshotPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--snapshot") {
      shouldSnapshot = true;
      if (args[i + 1] && !args[i + 1].startsWith("--")) {
        customSnapshotPath = args[i + 1];
        i++;
      }
    }
  }

  loadEnv();
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("Error: MONGODB_URI environment variable is required.");
    process.exit(1);
  }

  const client = new MongoClient(mongoUri);
  client
    .connect()
    .then(async () => {
      const db = client.db();
      console.log("Publishing catalog...");
      const res = await publishCatalog(db, {
        snapshotPath: customSnapshotPath,
        writeBundled: shouldSnapshot,
      });
      console.log(`Catalog published successfully: version ${res.version}`);
    })
    .then(() => client.close())
    .catch((err) => {
      console.error("Publishing failed:", err);
      client.close().finally(() => process.exit(1));
    });
}
