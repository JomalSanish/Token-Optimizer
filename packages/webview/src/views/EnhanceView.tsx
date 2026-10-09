import React, { useState } from "react";
import { Sparkles, Terminal, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { vscodeBridge } from "../protocol/vscode";
import { formatCost } from "../utils/format";
import type { ProjectProfile, ConfirmedPhase } from "@token-optimizer/core";

interface EnhanceViewProps {
  profile: ProjectProfile | null;
  narrative: string;
  isStreaming: boolean;
  costUsd: number;
  enhanceModel?: {
    providerId: string;
    modelId: string;
    keySlot?: number;
  };
}

export const EnhanceView: React.FC<EnhanceViewProps> = ({
  profile,
  narrative,
  isStreaming,
  costUsd,
  enhanceModel,
}) => {
  const [description, setDescription] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRunEnhance();
    }
  };

  const handleRunEnhance = () => {
    if (!description.trim() || isStreaming) return;
    const providerId = enhanceModel?.providerId || "anthropic";
    const modelId = enhanceModel?.modelId || "claude-3-5-sonnet";

    vscodeBridge.postMessage({
      version: 1,
      type: "enhance/run",
      payload: {
        description: description.trim(),
        providerId,
        modelId,
        keySlot: enhanceModel?.keySlot,
        previousProfileVersion: profile?.profileVersion,
      },
    });
  };

  const handleFinalize = () => {
    if (!profile) return;
    vscodeBridge.postMessage({
      version: 1,
      type: "enhance/finalize",
      payload: {
        profileVersion: profile.profileVersion,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Input section */}
      <div className="glass-panel rounded-xl p-5 border border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">Describe Your AI Feature</h2>
          </div>
          <span className="text-xs text-slate-400 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
            Ctrl+Enter to Run • Enter for newline
          </span>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. A multi-turn RAG chatbot for customer support with document retrieval, embedding generation, reranking, and agentic fallback..."
          rows={4}
          className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
        />
        <div className="mt-3 flex justify-between items-center">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            {costUsd > 0 && (
              <span className="bg-emerald-950/60 text-emerald-400 border border-emerald-800/50 px-2 py-0.5 rounded">
                Est. prompt cost: {formatCost(costUsd)}
              </span>
            )}
            {enhanceModel && (
              <span className="text-slate-400 text-xs">
                Model: {enhanceModel.providerId} / {enhanceModel.modelId}
              </span>
            )}
          </div>
          <button
            onClick={handleRunEnhance}
            disabled={!description.trim() || isStreaming}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-indigo-900/20"
          >
            {isStreaming ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Enhancing...</span>
              </>
            ) : (
              <>
                <span>Enhance Profile</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Narrative Stream Panel */}
      {(narrative || isStreaming) && (
        <div className="glass-panel rounded-xl p-5 border border-slate-800">
          <div className="flex items-center gap-2 mb-3 text-slate-300 font-semibold text-sm">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <span>Architecture Narrative</span>
          </div>
          <div className="bg-slate-950/90 border border-slate-800/80 rounded-lg p-4 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
            {narrative}
            {isStreaming && (
              <span className="inline-block w-2 h-4 bg-indigo-400 ml-1 animate-pulse align-middle" />
            )}
          </div>
        </div>
      )}

      {/* Extracted Profile Preview */}
      {profile && (
        <div className="glass-panel rounded-xl p-5 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-semibold text-slate-100">
                  Extracted Profile v{profile.profileVersion}
                </h3>
                <p className="text-xs text-slate-400">
                  Phases confirmed: {profile.phases.length} • Requests: {profile.scale.requestsPerDay} req/day
                </p>
              </div>
            </div>
            {!profile.finalizedAt && (
              <button
                onClick={handleFinalize}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Finalize Profile
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-1">Tech Stack</span>
              <div className="flex flex-wrap gap-1">
                {profile.techStack.map((t, idx) => (
                  <span
                    key={`${t.language}-${idx}`}
                    className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px]"
                  >
                    {t.language} {t.framework ? `(${t.framework})` : ""}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              <span className="text-slate-400 block mb-1">Components</span>
              <div className="flex flex-wrap gap-1">
                {profile.components.map((c) => (
                  <span
                    key={c.name}
                    className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px]"
                  >
                    {c.name} {c.llmRole ? `(${c.llmRole})` : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-3">
            <span className="text-xs text-slate-400 font-medium block mb-2">Confirmed Pipeline Phases</span>
            <div className="space-y-1.5">
              {profile.phases.map((p: ConfirmedPhase) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs bg-slate-900/40 px-3 py-2 rounded border border-slate-800/60"
                >
                  <span className="font-medium text-slate-200">{p.name}</span>
                  <span className="text-slate-400 text-[11px] font-mono">{p.track} track</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
