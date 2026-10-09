import * as vscode from "vscode";
import { WebviewProvider } from "./webview/WebviewProvider.js";

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
}

export function deactivate(): void {
  // Cleanup
}
