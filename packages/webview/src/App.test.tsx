import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { App } from "./App";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Webview Shell (T004, T015, Finding 4, Principle I & II)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders webview shell and handles tab switching across all 5 views", async () => {
    render(<App />);

    // Brand and header render
    expect(screen.getByText("Token Optimizer")).toBeDefined();
    expect(screen.getByText("vscode")).toBeDefined();

    // Verify initial Enhance tab renders
    expect(screen.getByText("Describe Your AI Feature")).toBeDefined();
    expect(
      screen.getByPlaceholderText(
        /A multi-turn RAG chatbot for customer support/
      )
    ).toBeDefined();

    // Switch to Estimate tab
    fireEvent.click(screen.getByRole("button", { name: /Estimate/ }));
    expect(screen.getByText("Deterministic Estimation")).toBeDefined();
    expect(screen.getByText("No Estimation Computed Yet")).toBeDefined();

    // Switch to Optimize tab
    fireEvent.click(screen.getByRole("button", { name: /Optimize/ }));
    expect(screen.getByText("Strategy Selection")).toBeDefined();
    expect(
      screen.getByText(/No strategies discovered yet. Connect catalog/)
    ).toBeDefined();

    // Switch to Implement tab
    fireEvent.click(screen.getByRole("button", { name: /Implement/ }));
    expect(screen.getByText("Implementation Route")).toBeDefined();
    expect(screen.getByText("Install Route")).toBeDefined();
    expect(screen.getByText("IDE Agent Route")).toBeDefined();

    // Switch to Settings tab
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    expect(screen.getByText("Add Provider API Key")).toBeDefined();
    expect(screen.getByText("Constitution Principle I Enforced")).toBeDefined();
    expect(
      screen.getByPlaceholderText("Paste key here (write-only)...")
    ).toBeDefined();
  });

  it("asserts webview source and templates contain no hardcoded secrets or database URLs", () => {
    const webviewSrcDir = path.resolve(__dirname, "..");
    const filesToScan: string[] = [];

    function collectFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules" && entry.name !== "dist") {
            collectFiles(fullPath);
          }
        } else if (
          entry.name.endsWith(".ts") ||
          entry.name.endsWith(".tsx") ||
          entry.name.endsWith(".html")
        ) {
          filesToScan.push(fullPath);
        }
      }
    }

    collectFiles(webviewSrcDir);

    expect(filesToScan.length).toBeGreaterThan(5);

    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, "utf-8");

      // No MongoDB connection strings
      expect(content).not.toMatch(/mongodb(\+srv)?:\/\//);

      // No hardcoded real API keys
      expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(content).not.toMatch(/AIza[0-9A-Za-z-_]{35}/);

      // No unexpected external tracking URLs (only standard XML/React namespaces allowed)
      const urlMatches = content.match(/https?:\/\/[^\s"'`<>]+/g) || [];
      for (const url of urlMatches) {
        const isAllowed =
          url.includes("w3.org") ||
          url.includes("reactjs.org") ||
          url.includes("github.com") ||
          url.includes("mock.webview.test");
        expect(
          isAllowed,
          `Unexpected external URL found in ${filePath}: ${url}`
        ).toBe(true);
      }
    }
  });

  it("safely handles malformed host messages via Zod validation without crashing", async () => {
    render(<App />);

    // Dispatch malformed message directly to window
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "unknown/maliciousMsg",
            payload: { injection: true },
          },
        })
      );
    });

    // App continues to render normally
    expect(screen.getByText("Token Optimizer")).toBeDefined();
  });
});
