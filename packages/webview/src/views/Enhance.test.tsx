import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Enhance } from "./Enhance";
import { vscodeBridge } from "../protocol/vscode";
import type { ProjectProfile } from "@token-optimizer/core";

function createMockProfile(version = 1, phasesConfirmed = true): ProjectProfile {
  return {
    schemaVersion: "1.0",
    projectType: "rag-chatbot",
    overview: "Production ready conversational RAG assistant for developer docs.",
    techStack: [{ language: "TypeScript", framework: "Next.js" }],
    llm: {
      providers: ["anthropic"],
      usesRag: true,
      usesAgents: false,
      avgPromptTokens: 800,
      avgOutputTokens: 300,
    },
    components: [{ name: "Retriever", description: "Semantic vector retrieval" }],
    dataFlow: "Query -> Embedding -> Pinecone -> Claude 3.5",
    phases: [
      {
        id: "phase-1",
        phaseTypeId: "architecture",
        track: "build",
        name: "Architecture & Scaffolding",
        source: "llm",
        confirmed: phasesConfirmed,
      },
    ],
    scale: { requestsPerDay: 5000, peakMultiplier: 2.0 },
    buildAssumptions: { teamSize: 3, sprintWeeks: 2, iterationsPerFeature: 2 },
    constraints: [],
    profileVersion: version,
    createdAt: "2026-10-09T00:00:00.000Z",
  };
}

describe("Enhance View Component (T063, T133, FR-009, FR-012, FR-015, Principle IX)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles keyboard events: Enter inserts newline and does not submit; Ctrl+Enter submits enhance/run", () => {
    const postSpy = vi.spyOn(vscodeBridge, "postMessage");
    render(
      <Enhance
        profile={null}
        narrative=""
        isStreaming={false}
        costUsd={0}
        enhanceModel={{ providerId: "anthropic", modelId: "claude-3-5-sonnet" }}
      />
    );

    const textarea = screen.getByPlaceholderText(/A multi-turn RAG chatbot for customer support/);

    // Type description
    fireEvent.change(textarea, {
      target: { value: "Build a customer support AI chatbot" },
    });

    // Press Enter alone -> should NOT call postMessage
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: false, metaKey: false });
    expect(postSpy).not.toHaveBeenCalled();

    // Press Ctrl+Enter -> triggers enhance/run
    fireEvent.keyDown(textarea, { key: "Enter", ctrlKey: true, metaKey: false });
    expect(postSpy).toHaveBeenCalledWith({
      version: 1,
      type: "enhance/run",
      payload: {
        description: "Build a customer support AI chatbot",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
        previousProfileVersion: undefined,
        keySlot: undefined,
      },
    });
  });

  it("renders editable phase table and edits phases with enhance/editPhases without LLM calls", () => {
    const postSpy = vi.spyOn(vscodeBridge, "postMessage");
    const mockProfile = createMockProfile(1, true);

    render(
      <Enhance
        profile={mockProfile}
        narrative="Synthesized architecture narrative."
        isStreaming={false}
        costUsd={0.015}
        catalogPhases={[
          {
            id: "architecture",
            name: "Architecture & Scaffolding",
            track: "build",
            sortOrder: 1,
            description: "Initial scoping",
            archetypes: ["general"],
            defaultParams: {
              callsLow: 1,
              callsExpected: 2,
              callsHigh: 5,
              tokensPerCallLow: 100,
              tokensPerCallExpected: 500,
              tokensPerCallHigh: 1000,
              retriesLow: 0,
              retriesExpected: 0,
              retriesHigh: 1,
            },
            cacheablePrefix: false,
          },
        ]}
      />
    );

    // Verify Cost Badge renders
    expect(screen.getByText(/Est. prompt cost:/)).toBeDefined();

    // Verify Phase input renders
    const phaseInput = screen.getByDisplayValue("Architecture & Scaffolding");
    expect(phaseInput).toBeDefined();

    // Rename phase
    fireEvent.change(phaseInput, { target: { value: "Updated Scaffolding Phase" } });
    expect(postSpy).toHaveBeenCalledWith({
      version: 1,
      type: "enhance/editPhases",
      payload: {
        profileVersion: 1,
        phases: [
          expect.objectContaining({
            name: "Updated Scaffolding Phase",
          }),
        ],
      },
    });
  });

  it("disables Finalize Profile button when unconfirmed phases exist", () => {
    const unconfirmedProfile = createMockProfile(1, false);

    render(
      <Enhance
        profile={unconfirmedProfile}
        narrative=""
        isStreaming={false}
        costUsd={0}
      />
    );

    const finalizeBtn = screen.getByRole("button", { name: /Finalize Profile/ }) as HTMLButtonElement;
    expect(finalizeBtn).toBeDefined();
    expect(finalizeBtn.disabled).toBe(true);
  });

  it("enables Finalize Profile button when all phases are confirmed and submits enhance/finalize", () => {
    const postSpy = vi.spyOn(vscodeBridge, "postMessage");
    const confirmedProfile = createMockProfile(1, true);

    render(
      <Enhance
        profile={confirmedProfile}
        narrative=""
        isStreaming={false}
        costUsd={0}
      />
    );

    const finalizeBtn = screen.getByRole("button", { name: /Finalize Profile/ }) as HTMLButtonElement;
    expect(finalizeBtn.disabled).toBe(false);

    fireEvent.click(finalizeBtn);
    expect(postSpy).toHaveBeenCalledWith({
      version: 1,
      type: "enhance/finalize",
      payload: {
        profileVersion: 1,
      },
    });
  });
});
