const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

async function build() {
  const extensionDir = path.resolve(__dirname, "..");
  const webviewDistDir = path.resolve(extensionDir, "..", "webview", "dist");
  const targetWebviewDir = path.resolve(extensionDir, "dist", "webview");

  console.log("[build] Bundling extension with esbuild...");
  await esbuild.build({
    entryPoints: [path.resolve(extensionDir, "src", "extension.ts")],
    bundle: true,
    outfile: path.resolve(extensionDir, "dist", "extension.js"),
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    target: "node20",
    sourcemap: true,
    minify: process.argv.includes("--minify"),
  });
  console.log("[build] Extension bundled to dist/extension.js");

  // Copy webview/dist assets into dist/webview
  if (fs.existsSync(webviewDistDir)) {
    console.log(`[build] Copying webview assets from ${webviewDistDir} to ${targetWebviewDir}...`);
    fs.mkdirSync(targetWebviewDir, { recursive: true });
    fs.cpSync(webviewDistDir, targetWebviewDir, { recursive: true });
    console.log("[build] Webview assets copied successfully.");
  } else {
    console.warn(
      `[build] Warning: webview dist not found at ${webviewDistDir}. Build webview before packaging.`
    );
  }

  // Ensure LICENSE is present in packages/extension
  const rootLicense = path.resolve(extensionDir, "..", "..", "LICENSE");
  const extLicense = path.resolve(extensionDir, "LICENSE");
  if (!fs.existsSync(extLicense) && fs.existsSync(rootLicense)) {
    fs.copyFileSync(rootLicense, extLicense);
    console.log("[build] Copied LICENSE from repo root.");
  }
}

build().catch((err) => {
  console.error("[build] Failed:", err);
  process.exit(1);
});
