import React, { useState } from "react";
import { FolderGit2, Bot, CheckCircle2, RotateCcw, AlertCircle } from "lucide-react";
import { vscodeBridge } from "../protocol/vscode";

interface ImplementViewProps {
  selectedStrategyIds: string[];
  profileVersion?: number;
  implementStatus?: "idle" | "running" | "completed" | "error";
  onStatusChange?: (status: "idle" | "running" | "completed" | "error") => void;
}

export const ImplementView: React.FC<ImplementViewProps> = ({
  selectedStrategyIds,
  profileVersion = 1,
  implementStatus = "idle",
  onStatusChange,
}) => {
  const [route, setRoute] = useState<"install" | "ide-agent">("install");
  const [localStatus, setLocalStatus] = useState<"idle" | "running" | "completed" | "error">(implementStatus);

  const effectiveStatus = implementStatus !== "idle" ? implementStatus : localStatus;

  const handleStartImplement = () => {
    setLocalStatus("running");
    if (onStatusChange) onStatusChange("running");

    vscodeBridge.postMessage({
      version: 1,
      type: "optimize/implement/start",
      payload: {
        route,
        selectedStrategyIds,
        profileVersion,
      },
    });
  };

  const handleReset = () => {
    setLocalStatus("idle");
    if (onStatusChange) onStatusChange("idle");
  };

  const handleKeyDown = (targetRoute: "install" | "ide-agent", e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      setRoute(targetRoute);
    }
  };

  return (
    <div className="space-y-6">
      {/* Route Chooser */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800">
        <h2 className="text-sm font-semibold text-slate-100 mb-1">Implementation Route</h2>
        <p className="text-xs text-slate-400 mb-4">
          All changes applied via a single, undoable WorkspaceEdit batch with checkpointing • Principle VI
        </p>

        <div
          role="radiogroup"
          aria-label="Implementation Route"
          className="grid grid-cols-2 gap-3"
        >
          <div
            role="radio"
            aria-checked={route === "install"}
            tabIndex={0}
            onClick={() => setRoute("install")}
            onKeyDown={(e) => handleKeyDown("install", e)}
            className={`p-4 rounded-xl border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
              route === "install"
                ? "border-indigo-500 bg-indigo-950/30"
                : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center gap-2 mb-2 text-indigo-400 font-semibold text-sm">
              <FolderGit2 className="w-4 h-4" />
              <span>Install Route</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generates `.ai-optimizer/` artifacts, platform instructions, and skill templates to workspace targets.
            </p>
          </div>

          <div
            role="radio"
            aria-checked={route === "ide-agent"}
            tabIndex={0}
            onClick={() => setRoute("ide-agent")}
            onKeyDown={(e) => handleKeyDown("ide-agent", e)}
            className={`p-4 rounded-xl border cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
              route === "ide-agent"
                ? "border-indigo-500 bg-indigo-950/30"
                : "border-slate-800 bg-slate-950/40 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center gap-2 mb-2 text-violet-400 font-semibold text-sm">
              <Bot className="w-4 h-4" />
              <span>IDE Agent Route</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Synthesizes an agent handoff prompt, checks redacted tokens, and executes instructions with review.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between pt-4 border-t border-slate-800/80">
          <div className="text-xs text-slate-400">
            Selected strategies: <span className="font-mono text-slate-200">{selectedStrategyIds.length}</span>
          </div>

          {effectiveStatus === "idle" && (
            <button
              onClick={handleStartImplement}
              disabled={selectedStrategyIds.length === 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors shadow-md"
            >
              Start Implementation
            </button>
          )}

          {effectiveStatus === "running" && (
            <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-950/60 px-3 py-1.5 rounded-lg border border-indigo-800/50">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
              <span>Synthesizing changes & creating checkpoint...</span>
            </div>
          )}

          {effectiveStatus === "completed" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-4 h-4" /> Changes Applied
              </span>
              <button
                onClick={handleReset}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Reset
              </button>
            </div>
          )}

          {effectiveStatus === "error" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-400 flex items-center gap-1 font-medium">
                <AlertCircle className="w-4 h-4" /> Implementation Failed
              </span>
              <button
                onClick={handleReset}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" /> Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
