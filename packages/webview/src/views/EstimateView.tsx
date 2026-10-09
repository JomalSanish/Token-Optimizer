import React, { useState } from "react";
import { Calculator, RefreshCw, BarChart3, HelpCircle } from "lucide-react";
import { vscodeBridge } from "../protocol/vscode";
import { formatCost } from "../utils/format";
import type { EstimationResult, CostRange } from "@token-optimizer/core";

interface EstimateViewProps {
  estimation: EstimationResult | null;
  isLoading: boolean;
  profileVersion?: number;
}

export const EstimateView: React.FC<EstimateViewProps> = ({
  estimation,
  isLoading,
  profileVersion = 1,
}) => {
  const [activeTrack, setActiveTrack] = useState<"build" | "runtime">("runtime");
  const [explainOpen, setExplainOpen] = useState(false);

  const currentVersion = estimation?.profileVersion ?? profileVersion;

  const handleRecompute = () => {
    vscodeBridge.postMessage({
      version: 1,
      type: "estimate/request",
      payload: {
        profileVersion: currentVersion,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Track Selector */}
      <div className="flex items-center justify-between glass-panel p-4 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-indigo-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Deterministic Estimation</h2>
            <p className="text-xs text-slate-400">Pure formula estimation • Principle IV</p>
          </div>
        </div>

        <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTrack("runtime")}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              activeTrack === "runtime"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Runtime Track
          </button>
          <button
            onClick={() => setActiveTrack("build")}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              activeTrack === "build"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Build Track
          </button>
        </div>
      </div>

      {/* Main Estimation Metrics */}
      {estimation ? (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="glass-panel p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Total Expected Cost</span>
              <div className="text-xl font-bold text-indigo-400">
                {formatCost(estimation.totalExpectedCost)}
              </div>
              <span className="text-[10px] text-slate-500">Per monthly active period</span>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Currency & Standard</span>
              <div className="text-xl font-bold text-slate-200">{estimation.currency}</div>
              <span className="text-[10px] text-slate-500">Dual-track estimation</span>
            </div>

            <div className="glass-panel p-4 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-slate-400 block mb-1">Profile Version</span>
                <div className="text-xl font-bold text-slate-200">v{estimation.profileVersion}</div>
                <span className="text-[10px] text-slate-500">
                  {new Date(estimation.generatedAt).toLocaleTimeString()}
                </span>
              </div>
              <button
                onClick={handleRecompute}
                disabled={isLoading}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Recompute Estimate"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Model Breakdown Table */}
          <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Cost by Model ({activeTrack} track)</span>
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 font-medium">Low USD</th>
                    <th className="pb-2 font-medium">Expected USD</th>
                    <th className="pb-2 font-medium">High USD</th>
                    <th className="pb-2 font-medium text-right">Explain</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {Object.entries(estimation[activeTrack].totalByModel).map(([modelId, cost]) => {
                    const typedCost = cost as CostRange;
                    return (
                      <tr key={modelId} className="hover:bg-slate-900/40">
                        <td className="py-2.5 font-sans font-medium text-slate-200">{modelId}</td>
                        <td className="py-2.5 text-slate-400">{formatCost(typedCost.low)}</td>
                        <td className="py-2.5 text-indigo-300 font-semibold">{formatCost(typedCost.expected)}</td>
                        <td className="py-2.5 text-slate-400">{formatCost(typedCost.high)}</td>
                        <td className="py-2.5 text-right font-sans">
                          <button
                            onClick={() => setExplainOpen(true)}
                            className="text-[11px] text-slate-400 hover:text-indigo-400 underline"
                          >
                            view
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {Object.keys(estimation[activeTrack].totalByModel).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                        No model estimates available for this track.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Explain Formula Modal Placeholder */}
          {explainOpen && (
            <div className="glass-panel p-4 rounded-xl border border-indigo-500/40 bg-indigo-950/20 text-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-indigo-300 flex items-center gap-1">
                  <HelpCircle className="w-3.5 h-3.5" /> Explainability Tree
                </span>
                <button
                  onClick={() => setExplainOpen(false)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  Close
                </button>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Tokens and costs are calculated strictly via verified formulas from catalog pricing.
                No remote model calls or stochastic inference are used during estimation.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="glass-panel p-12 rounded-xl border border-slate-800 text-center space-y-3">
          <Calculator className="w-8 h-8 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-300">No Estimation Computed Yet</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Run enhance to discover pipeline phases and profile, then request a deterministic estimation.
          </p>
          <button
            onClick={handleRecompute}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            Compute Initial Estimate
          </button>
        </div>
      )}
    </div>
  );
};
