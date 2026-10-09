import * as vscode from "vscode";
import { WebviewProvider } from "./webview/WebviewProvider.js";
import { CatalogService } from "./catalog/CatalogService.js";
import { KeyService } from "./secrets/KeyService.js";
import { KeyValidationService } from "./secrets/KeyValidationService.js";
import { AuthHandlers } from "./webview/handlers/AuthHandlers.js";
import { EnhanceHandlers } from "./webview/handlers/EnhanceHandlers.js";
import { EnhanceService } from "./enhance/EnhanceService.js";
import { ProfileHistoryStore } from "./enhance/ProfileHistoryStore.js";
import {
  AnthropicAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  MistralAdapter,
  type ProviderAdapter,
} from "@token-optimizer/core";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new WebviewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      WebviewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  const openCommand = vscode.commands.registerCommand(
    "tokenOptimizer.openPanel",
    () => {
      vscode.commands.executeCommand(
        "workbench.view.extension.token-optimizer-sidebar"
      );
    }
  );

  context.subscriptions.push(openCommand);

  const router = provider.getRouter();
  const catalogService = new CatalogService(context, router);
  context.subscriptions.push(catalogService);

  // Initialize adapters and auth services (Slice 2, Principle I, II, VII)
  const keyService = new KeyService(context.secrets);
  const adapters = new Map<string, ProviderAdapter>([
    ["anthropic", new AnthropicAdapter()],
    ["openai", new OpenAIAdapter()],
    ["google", new GoogleAdapter()],
    ["mistral", new MistralAdapter()],
  ]);

  const validationService = new KeyValidationService({
    keyService,
    adapters,
    router,
  });

  const authHandlers = new AuthHandlers({
    context,
    router,
    keyService,
    validationService,
    getCatalogSnapshot: () => catalogService.getCatalogSnapshot(),
  });
  authHandlers.register();

  // Initialize enhance services and handlers (Slice 3, Principle I, II, IV, IX)
  const historyStore = new ProfileHistoryStore(context.workspaceState);
  const enhanceService = new EnhanceService({
    keyService,
    adapters,
    getCatalogSnapshot: () => catalogService.getCatalogSnapshot(),
    postMessage: async (msg) => {
      await router.send(msg);
    },
    historyStore,
  });

  const enhanceHandlers = new EnhanceHandlers({
    context,
    router,
    enhanceService,
    historyStore,
    getCatalogSnapshot: () => catalogService.getCatalogSnapshot(),
  });
  enhanceHandlers.register();

  // Initialize catalog in background on activation
  catalogService.initialize().catch((err) => {
    console.error("[TokenOptimizer] Failed to initialize CatalogService:", err);
  });
}

export function deactivate(): void {
  // Cleanup
}
