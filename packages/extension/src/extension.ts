import * as vscode from "vscode";
import { WebviewProvider } from "./webview/WebviewProvider.js";
import { CatalogService } from "./catalog/CatalogService.js";

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

  const catalogService = new CatalogService(context, provider.getRouter());
  context.subscriptions.push(catalogService);

  // Initialize catalog in background on activation
  catalogService.initialize().catch((err) => {
    console.error("[TokenOptimizer] Failed to initialize CatalogService:", err);
  });
}

export function deactivate(): void {
  // Cleanup
}
