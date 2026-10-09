import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnv(): void {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(currentDir, "../../../.env"),
    path.resolve(currentDir, "../../.env"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        process.loadEnvFile?.(p);
        break;
      } catch {
        // ignore
      }
    }
  }
}
