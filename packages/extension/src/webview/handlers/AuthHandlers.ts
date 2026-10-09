import * as vscode from "vscode";
import type { CatalogSnapshot } from "@token-optimizer/core";
import { KeyService } from "../../secrets/KeyService.js";
import { KeyValidationService } from "../../secrets/KeyValidationService.js";
import { PlatformDetector } from "../../platform/PlatformDetector.js";
import { HostLmAdapter } from "../../lm/HostLmAdapter.js";
import type { MessageRouter } from "../MessageRouter.js";

export interface AuthHandlersOptions {
  context: vscode.ExtensionContext;
  router: MessageRouter;
  keyService: KeyService;
  validationService: KeyValidationService;
  getCatalogSnapshot: () => CatalogSnapshot | null;
  hostLmAdapter?: HostLmAdapter;
}

export class AuthHandlers {
  private context: vscode.ExtensionContext;
  private router: MessageRouter;
  private keyService: KeyService;
  private validationService: KeyValidationService;
  private getCatalogSnapshot: () => CatalogSnapshot | null;
  private hostLmAdapter?: HostLmAdapter;

  constructor(options: AuthHandlersOptions) {
    this.context = options.context;
    this.router = options.router;
    this.keyService = options.keyService;
    this.validationService = options.validationService;
    this.getCatalogSnapshot = options.getCatalogSnapshot;
    this.hostLmAdapter = options.hostLmAdapter;
  }

  public register(): void {
    // 1. auth/saveKey
    this.router.register("auth/saveKey", async (msg) => {
      let rawKey = String(msg.payload.key);
      const providerId = msg.payload.providerId;
      const keySlot = msg.payload.keySlot ?? 0;

      try {
        const success = await this.validationService.validateAndSaveKey(
          providerId,
          keySlot,
          rawKey
        );
        if (success) {
          await this.postAuthState();
        }
      } finally {
        // Principle I: Immediately clear raw key variable
        rawKey = "";
      }
    });

    // 2. auth/removeKey
    this.router.register("auth/removeKey", async (msg) => {
      const providerId = msg.payload.providerId;
      const keySlot = msg.payload.keySlot ?? 0;

      await this.keyService.deleteKey(providerId, keySlot);

      await this.router.send({
        version: 1,
        type: "auth/keyRemoved",
        payload: {
          providerId,
          keySlot,
        },
      });

      await this.postAuthState();
    });

    // 3. auth/setEnabledModels
    this.router.register("auth/setEnabledModels", async (msg) => {
      const { providerId, enabledModels } = msg.payload;
      await this.context.globalState.update(
        `enabledModels:${providerId}`,
        enabledModels
      );
      await this.postAuthState();
    });

    // 4. auth/setPlatform
    this.router.register("auth/setPlatform", async (msg) => {
      const { platformId } = msg.payload;
      await this.context.workspaceState.update("overridePlatform", platformId);
      await this.postAuthState();
    });

    // 5. auth/setEnhanceModel
    this.router.register("auth/setEnhanceModel", async (msg) => {
      await this.context.workspaceState.update("enhanceModel", msg.payload);
      await this.postAuthState();
    });

    // 6. auth/setCopilotOnly
    this.router.register("auth/setCopilotOnly", async (msg) => {
      await this.context.workspaceState.update("copilotOnly", msg.payload.copilotOnly);
      await this.postAuthState();
    });

    // 7. On webview/ready, post initial auth/state
    this.router.register("webview/ready", async () => {
      await this.postAuthState();
    });
  }

  /**
   * Posts current auth/state envelope to the webview.
   * NEVER contains raw keys (Principle I & II).
   */
  public async postAuthState(): Promise<void> {
    const catalog = this.getCatalogSnapshot();
    const providers = catalog?.providers || [];

    // 1. Determine platform
    const overriddenPlatform = this.context.workspaceState.get<string>("overridePlatform");
    let detectedPlatformId = "vscode";
    if (catalog) {
      try {
        const detected = PlatformDetector.detect(catalog, {
          appName: typeof vscode !== "undefined" ? vscode.env?.appName : undefined,
          uriScheme: typeof vscode !== "undefined" ? vscode.env?.uriScheme : undefined,
          workspaceRoot:
            typeof vscode !== "undefined" && vscode.workspace?.workspaceFolders?.[0]
              ? vscode.workspace.workspaceFolders[0].uri.fsPath
              : undefined,
        });
        detectedPlatformId = detected.id;
      } catch {
        // Fall back to first platform if detection failed
        detectedPlatformId = catalog.platforms[0]?.id || "vscode";
      }
    }
    const currentPlatform = overriddenPlatform || detectedPlatformId;

    // 2. Determine configured keys (masked only)
    const configuredKeysRaw = await this.keyService.listConfigured(providers);
    const configuredKeys = configuredKeysRaw.map((k) => {
      const enabled =
        this.context.globalState.get<string[]>(`enabledModels:${k.providerId}`) || [];
      return {
        providerId: k.providerId,
        keySlot: k.keySlot,
        maskedKey: k.maskedKey,
        enabledModels: enabled,
      };
    });

    // 3. Copilot availability
    let copilotAvailable = false;
    if (this.hostLmAdapter) {
      copilotAvailable = await this.hostLmAdapter.isAvailable();
    }
    const copilotOnly = this.context.workspaceState.get<boolean>("copilotOnly") ?? false;

    // 4. Enhance model preference
    const enhanceModel = this.context.workspaceState.get<{
      providerId: string;
      modelId: string;
      keySlot?: number;
    }>("enhanceModel");

    await this.router.send({
      version: 1,
      type: "auth/state",
      payload: {
        platform: currentPlatform,
        configuredKeys,
        copilotAvailable,
        copilotOnly,
        platformOverridden: Boolean(overriddenPlatform),
        enhanceModel,
      },
    });
  }
}
