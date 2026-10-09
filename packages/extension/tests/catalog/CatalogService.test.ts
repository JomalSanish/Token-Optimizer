import { describe, it, expect, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";

vi.mock("vscode", () => ({
  workspace: {
    getConfiguration: () => ({
      get: () => undefined,
    }),
  },
  Uri: {
    file: (f: string) => ({ fsPath: f }),
  },
}));

import { CatalogService } from "../../src/catalog/CatalogService.js";
import { MessageRouter } from "../../src/webview/MessageRouter.js";
import {
  CatalogClient,
  BundledSnapshotLoader,
} from "@token-optimizer/core";

describe("CatalogService Extension Tests (T034, FR-043-FR-046)", () => {
  it("falls back to bundled snapshot and posts catalog/updated with isOffline=true on network failure", async () => {
    const postedMessages: unknown[] = [];
    const mockPostTarget = {
      postMessage: async (msg: unknown) => {
        postedMessages.push(msg);
        return true;
      },
    };

    const router = new MessageRouter(mockPostTarget);

    const mockGlobalState = new Map<string, unknown>();
    const mockContext = {
      globalState: {
        get: (key: string) => mockGlobalState.get(key),
        update: async (key: string, val: unknown) => {
          mockGlobalState.set(key, val);
        },
      },
      extensionPath: path.resolve(__dirname, "../.."),
      subscriptions: [],
    } as unknown as import("vscode").ExtensionContext;

    // Mock client that fails with network error
    const mockClient = {
      getCatalogSnapshot: vi.fn().mockRejectedValue(new Error("Network connection refused")),
    } as unknown as CatalogClient;

    const bundledPath = path.resolve(
      __dirname,
      "../../resources/catalog-snapshot.json"
    );

    const loader = new BundledSnapshotLoader(async (p: string) => {
      return await fs.readFile(p, "utf-8");
    });

    const service = new CatalogService(mockContext, router, {
      client: mockClient,
      loader,
      bundledSnapshotPath: bundledPath,
    });

    const snapshot = await service.initialize();

    expect(snapshot).toBeDefined();
    expect(snapshot.version).toBeGreaterThanOrEqual(1);
    expect(service.isOffline()).toBe(true);

    // Assert message posted to webview
    expect(postedMessages.length).toBe(1);
    const sentMsg = postedMessages[0] as {
      type: string;
      version: number;
      payload: { isOffline: boolean; version: number };
    };

    expect(sentMsg.type).toBe("catalog/updated");
    expect(sentMsg.version).toBe(1);
    expect(sentMsg.payload.isOffline).toBe(true);
    expect(sentMsg.payload.version).toBe(snapshot.version);

    service.dispose();
  });
});
