import * as vscode from "vscode";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import {
  CatalogClient,
  BundledSnapshotLoader,
  type CatalogSnapshot,
  type CatalogStorage,
} from "@token-optimizer/core";
import type { MessageRouter } from "../webview/MessageRouter.js";

export interface CatalogServiceOptions {
  client?: CatalogClient;
  loader?: BundledSnapshotLoader;
  bundledSnapshotPath?: string;
  refreshIntervalMs?: number;
}

export class CatalogService implements vscode.Disposable {
  private currentSnapshot: CatalogSnapshot | null = null;
  private offline = false;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private client: CatalogClient;
  private loader: BundledSnapshotLoader;
  private bundledSnapshotPath: string;
  private refreshIntervalMs: number;
  private listeners: Array<(snapshot: CatalogSnapshot, isOffline: boolean) => void> = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly router?: MessageRouter,
    options: CatalogServiceOptions = {}
  ) {
    const globalStateStorage: CatalogStorage = {
      get: async <T>(key: string) => this.context.globalState.get<T>(key),
      set: async <T>(key: string, val: T) => {
        await this.context.globalState.update(key, val);
      },
    };

    const baseUrl =
      (typeof vscode !== "undefined" &&
        vscode.workspace?.getConfiguration?.("tokenOptimizer")?.get<string>("catalogUrl")) ||
      "https://catalog.token-optimizer.dev/v1";

    this.client =
      options.client ??
      new CatalogClient({
        baseUrl,
        storage: globalStateStorage,
      });

    this.loader =
      options.loader ??
      new BundledSnapshotLoader(async (filePath: string) => {
        return await fs.readFile(filePath, "utf-8");
      });

    const extPath =
      this.context.extensionPath ||
      this.context.extensionUri?.fsPath ||
      process.cwd();

    this.bundledSnapshotPath =
      options.bundledSnapshotPath ??
      path.join(extPath, "resources", "catalog-snapshot.json");

    // Default 24 hours
    this.refreshIntervalMs = options.refreshIntervalMs ?? 24 * 60 * 60 * 1000;
  }

  public async initialize(): Promise<CatalogSnapshot> {
    try {
      const res = await this.client.getCatalogSnapshot();
      this.currentSnapshot = res.snapshot;
      this.offline = res.isOffline;
    } catch (err) {
      console.warn(
        "[CatalogService] Failed to fetch catalog from remote/cache; falling back to bundled snapshot:",
        err
      );
      try {
        this.currentSnapshot = await this.loader.load(this.bundledSnapshotPath);
        this.offline = true;
      } catch (loadErr) {
        console.error(
          "[CatalogService] Critical: Failed to load bundled catalog snapshot:",
          loadErr
        );
        throw loadErr;
      }
    }

    await this.notifyCatalogUpdated();
    this.scheduleRefresh();
    return this.currentSnapshot;
  }

  public getCatalogSnapshot(): CatalogSnapshot | null {
    return this.currentSnapshot;
  }

  public isOffline(): boolean {
    return this.offline;
  }

  public onDidUpdateCatalog(
    listener: (snapshot: CatalogSnapshot, isOffline: boolean) => void
  ): vscode.Disposable {
    this.listeners.push(listener);
    return {
      dispose: () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      },
    };
  }

  public async notifyCatalogUpdated(): Promise<void> {
    if (!this.currentSnapshot) return;

    for (const listener of this.listeners) {
      try {
        listener(this.currentSnapshot, this.offline);
      } catch (err) {
        console.error("[CatalogService] Listener threw error:", err);
      }
    }

    if (this.router) {
      await this.router.send({
        type: "catalog/updated",
        version: 1,
        payload: {
          version: this.currentSnapshot.version,
          schemaVersion: this.currentSnapshot.schemaVersion,
          providers: this.currentSnapshot.providers,
          models: this.currentSnapshot.models,
          pricing: this.currentSnapshot.pricing,
          phases: this.currentSnapshot.phases,
          strategies: this.currentSnapshot.strategies,
          platforms: this.currentSnapshot.platforms,
          promptTemplates: this.currentSnapshot.promptTemplates,
          isOffline: this.offline,
        },
      });
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    this.refreshTimer = setInterval(async () => {
      try {
        const res = await this.client.getCatalogSnapshot();
        if (
          !this.currentSnapshot ||
          res.snapshot.version !== this.currentSnapshot.version ||
          res.isOffline !== this.offline
        ) {
          this.currentSnapshot = res.snapshot;
          this.offline = res.isOffline;
          await this.notifyCatalogUpdated();
        }
      } catch (err) {
        console.debug("[CatalogService] Background 24h refresh failed:", err);
      }
    }, this.refreshIntervalMs);
  }

  public dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.listeners = [];
  }
}
