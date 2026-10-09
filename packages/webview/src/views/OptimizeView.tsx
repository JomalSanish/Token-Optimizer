import React, { useState, useEffect } from "react";
import { Sliders, Percent } from "lucide-react";
import { vscodeBridge } from "../protocol/vscode";
import type { Strategy, SavingsRange } from "@token-optimizer/core";

interface OptimizeViewProps {
  strategies: Strategy[];
  selectedStrategyIds: string[];
  savings: {
    build: SavingsRange;
    runtime: SavingsRange;
  } | null;
  profileVersion?: number;
}

export const OptimizeView: React.FC<OptimizeViewProps> = ({
  strategies,
  selectedStrategyIds,
  savings,
  profileVersion = 1,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(selectedStrategyIds);

  // Sync state when props arrive or update from host (Finding 13)
  useEffect(() => {
    setSelectedIds(selectedStrategyIds);
  }, [selectedStrategyIds]);

  const toggleStrategy = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((s) => s !== id)
      : [...selectedIds, id];

    setSelectedIds(next);
    vscodeBridge.postMessage({
      version: 1,
      type: "strategy/set",
      payload: {
        selectedIds: next,
      },
    });
  };

  const handleGenerate = () => {
    vscodeBridge.postMessage({
      version: 1,
      type: "optimize/generate",
      payload: {
        selectedStrategyIds: selectedIds,
        profileVersion,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header and Savings Overview */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Strategy Selection</h2>
              <p className="text-xs text-slate-400">Conservative compounded savings • Principle V</p>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={selectedIds.length === 0}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all shadow-md"
          >
            Generate Optimizations
          </button>
        </div>

        {savings ? (
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Runtime Savings</span>
              <div className="text-lg font-bold text-emerald-400">
                {savings.runtime.minPercent}% – {savings.runtime.maxPercent}%
              </div>
              <span className="text-[10px] text-slate-500">Compounded across phases</span>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Build / Iteration Savings</span>
              <div className="text-lg font-bold text-indigo-300">
                {savings.build.minPercent}% – {savings.build.maxPercent}%
              </div>
              <span className="text-[10px] text-slate-500">Compounded across development</span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500 pt-2 border-t border-slate-800 flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5" /> Select strategies below to compute compounded savings.
          </div>
        )}
      </div>

      {/* Strategies List */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Available Optimization Strategies ({strategies.length})
        </h3>

        {strategies.length > 0 ? (
          <div className="space-y-2">
            {strategies.map((strategy) => {
              const isSelected = selectedIds.includes(strategy.id);
              return (
                <div
                  key={strategy.id}
                  onClick={() => toggleStrategy(strategy.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? "border-indigo-500/60 bg-indigo-950/20"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // handled by parent onClick
                        className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-200">
                            {strategy.name}
                          </span>
                          <span className="text-[10px] font-mono uppercase bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            {strategy.group}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {strategy.summary}
                        </p>
                      </div>
                    </div>

                    <div className="text-right pl-4">
                      <span className="text-xs font-semibold text-emerald-400">
                        {strategy.savings.minPercent}–{strategy.savings.maxPercent}%
                      </span>
                      <span className="text-[10px] text-slate-500 block">estimated</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="glass-panel p-8 rounded-xl border border-slate-800 text-center text-xs text-slate-500">
            No strategies discovered yet. Connect catalog or run enhance stage.
          </div>
        )}
      </div>
    </div>
  );
};
