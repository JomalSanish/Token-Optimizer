import * as vscode from "vscode";
import * as crypto from "node:crypto";
import { MessageRouter } from "./MessageRouter.js";
import { buildWebviewHtml } from "./htmlBuilder.js";

export class WebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "tokenOptimizer";
  private view?: vscode.WebviewView;
  private router: MessageRouter;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    router?: MessageRouter
  ) {
    this.router = router || new MessageRouter();
  }

  public getRouter(): MessageRouter {
    return this.router;
  }

  public async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this.view = webviewView;
    const webview = webviewView.webview;

    this.router.setTarget(webview);

    const distWebviewUri = vscode.Uri.joinPath(
      this.extensionUri,
      "dist",
      "webview"
    );

    // Restrict local resource roots strictly to packaged webview dist (Principle II & Finding 1)
    webview.options = {
      enableScripts: true,
      localResourceRoots: [distWebviewUri],
    };

    const htmlUri = vscode.Uri.joinPath(distWebviewUri, "index.html");
    let template: string | undefined;

    try {
      const bytes = await vscode.workspace.fs.readFile(htmlUri);
      template = new TextDecoder().decode(bytes);
    } catch (err) {
      console.error(
        "[WebviewProvider] Webview build artifacts missing or unreadable at dist/webview/index.html:",
        err
      );
    }

    const nonce = crypto.randomBytes(16).toString("base64");
    webview.html = buildWebviewHtml({
      nonce,
      cspSource: webview.cspSource,
      template,
      toAssetUri: (assetRelativePath) =>
        webview
          .asWebviewUri(vscode.Uri.joinPath(distWebviewUri, assetRelativePath))
          .toString(),
    });

    const messageSubscription = webview.onDidReceiveMessage(async (message) => {
      await this.router.handleInbound(message);
    });
    this.disposables.push(messageSubscription);

    webviewView.onDidDispose(() => {
      this.dispose();
    });
  }

  public dispose(): void {
    this.router.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
