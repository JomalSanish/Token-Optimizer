import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Calculator,
  Sliders,
  FolderGit2,
  Settings,
  Wifi,
  WifiOff,
  AlertCircle,
  X,
} from "lucide-react";
import { vscodeBridge } from "./protocol/vscode";
import { EnhanceView } from "./views/EnhanceView";
import { EstimateView } from "./views/EstimateView";
import { OptimizeView } from "./views/OptimizeView";
import { ImplementView } from "./views/ImplementView";
import { SettingsView } from "./views/SettingsView";
import type {
  HostToWebviewMsg,
  ProjectProfile,
  EstimationResult,
  Strategy,
  Provider,
  Model,
  SavingsRange,
  Phase as CatalogPhase,
  Pricing,
} from "@token-optimizer/core";

type TabId = "enhance" | "estimate" | "optimize" | "implement" | "settings";

interface PersistedUiState {
  activeTab?: TabId;
  narrative?: string;
  enhanceCostUsd?: number;
  profile?: ProjectProfile | null;
  selectedStrategyIds?: string[];
}

export const App: React.FC = () => {
  const initialSavedState = vscodeBridge.getState<PersistedUiState>() || {};

  const [activeTab, setActiveTab] = useState<TabId>(initialSavedState.activeTab || "enhance");
  const [isOffline, setIsOffline] = useState(false);
  const [catalogPublishedAt, setCatalogPublishedAt] = useState<string | null>(null);
  const [platform, setPlatform] = useState("vscode");
  const [catalogPhases, setCatalogPhases] = useState<CatalogPhase[]>([]);
  const [pricing, setPricing] = useState<Pricing[]>([]);

  // Enhance state
  const [profile, setProfile] = useState<ProjectProfile | null>(initialSavedState.profile || null);
  const [narrative, setNarrative] = useState(initialSavedState.narrative || "");
  const [isEnhanceStreaming, setIsEnhanceStreaming] = useState(false);
  const [enhanceCostUsd, setEnhanceCostUsd] = useState(initialSavedState.enhanceCostUsd || 0);

  // Estimate state
  const [estimation, setEstimation] = useState<EstimationResult | null>(null);
  const [isEstimating, setIsEstimating] = useState(false);

  // Strategy / Optimize state
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategyIds, setSelectedStrategyIds] = useState<string[]>(
    initialSavedState.selectedStrategyIds || []
  );
  const [savings, setSavings] = useState<{
    build: SavingsRange;
    runtime: SavingsRange;
  } | null>(null);

  // Auth / Settings state
  const [providers, setProviders] = useState<Provider[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [configuredKeys, setConfiguredKeys] = useState<
    Array<{
      providerId: string;
      keySlot: number;
      maskedKey: string;
      enabledModels: string[];
    }>
  >([]);
  const [copilotAvailable, setCopilotAvailable] = useState(true);
  const [enhanceModel, setEnhanceModel] = useState<
    { providerId: string; modelId: string; keySlot?: number } | undefined
  >(undefined);

  // Implement state
  const [implementStatus, setImplementStatus] = useState<
    "idle" | "running" | "completed" | "error"
  >("idle");

  // Error banners (Finding 12)
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Persist state to VS Code webview state (Finding 13)
  useEffect(() => {
    vscodeBridge.setState<PersistedUiState>({
      activeTab,
      narrative,
      enhanceCostUsd,
      profile,
      selectedStrategyIds,
    });
  }, [activeTab, narrative, enhanceCostUsd, profile, selectedStrategyIds]);

  // Initial handshake: send webview/ready to trigger host state push (Finding 12)
  useEffect(() => {
    vscodeBridge.postMessage({
      version: 1,
      type: "webview/ready",
      payload: {},
    });
  }, []);

  // H11: Auto-trigger estimation when switching to estimate tab with finalized profile
  useEffect(() => {
    if (activeTab === "estimate" && profile?.finalizedAt) {
      if (!estimation || estimation.profileVersion !== profile.profileVersion) {
        setIsEstimating(true);
        vscodeBridge.postMessage({
          version: 1,
          type: "estimate/request",
          payload: {
            profileVersion: profile.profileVersion,
          },
        });
      }
    }
  }, [activeTab, profile?.finalizedAt, profile?.profileVersion, estimation]);

  useEffect(() => {
    const unsubscribe = vscodeBridge.onMessage((msg: HostToWebviewMsg) => {
      switch (msg.type) {
        case "catalog/updated":
          setStrategies(msg.payload.strategies);
          setProviders(msg.payload.providers);
          setModels(msg.payload.models);
          setPricing(msg.payload.pricing || []);
          setCatalogPhases(msg.payload.phases || []);
          setIsOffline(msg.payload.isOffline);
          if (msg.payload.publishedAt) {
            setCatalogPublishedAt(msg.payload.publishedAt);
          }
          break;

        case "auth/state":
          setPlatform(msg.payload.platform);
          setConfiguredKeys(msg.payload.configuredKeys);
          setCopilotAvailable(msg.payload.copilotAvailable);
          if (msg.payload.enhanceModel) {
            setEnhanceModel(msg.payload.enhanceModel);
          }
          break;

        case "auth/keySaved":
          setErrorBanner(null);
          setConfiguredKeys((prev) => [
            ...prev.filter(
              (k) =>
                !(
                  k.providerId === msg.payload.providerId &&
                  k.keySlot === msg.payload.keySlot
                )
            ),
            {
              providerId: msg.payload.providerId,
              keySlot: msg.payload.keySlot,
              maskedKey: msg.payload.maskedKey,
              enabledModels: [],
            },
          ]);
          break;

        case "auth/keyRemoved":
          setConfiguredKeys((prev) =>
            prev.filter(
              (k) =>
                !(
                  k.providerId === msg.payload.providerId &&
                  k.keySlot === msg.payload.keySlot
                )
            )
          );
          break;

        case "auth/keyError":
          setErrorBanner(
            `Key validation failed for ${msg.payload.providerId} [slot ${msg.payload.keySlot}]: ${msg.payload.message}`
          );
          break;

        case "enhance/stream":
          setIsEnhanceStreaming(true);
          setNarrative((prev) => prev + msg.payload.delta);
          break;

        case "enhance/result":
          setIsEnhanceStreaming(false);
          setNarrative(msg.payload.narrative);
          setProfile(msg.payload.profile);
          setEnhanceCostUsd(msg.payload.costUsd);
          break;

        case "enhance/phasesUpdated":
          setProfile((prev) =>
            prev
              ? {
                  ...prev,
                  profileVersion: msg.payload.profileVersion,
                  phases: msg.payload.phases,
                }
              : null
          );
          if (msg.payload.problems && msg.payload.problems.length > 0) {
            setErrorBanner(
              `Phase validation issue: ${msg.payload.problems.map((p) => `${p.phaseId} (${p.problem})`).join(", ")}`
            );
          }
          break;

        case "enhance/profileFinalized":
          setProfile((prev) =>
            prev
              ? {
                  ...prev,
                  profileVersion: msg.payload.profileVersion,
                  finalizedAt: new Date().toISOString(),
                }
              : null
          );
          break;

        case "enhance/versionLoaded":
          setProfile(msg.payload.entry.profile);
          if (msg.payload.entry.narrative) {
            setNarrative(msg.payload.entry.narrative);
          }
          break;

        case "enhance/error":
          setIsEnhanceStreaming(false);
          setErrorBanner(`Enhance stage failed: ${msg.payload.message}`);
          break;

        case "estimate/result":
          setIsEstimating(false);
          setEstimation(msg.payload.result);
          break;

        case "estimate/error":
          setIsEstimating(false);
          setErrorBanner(`Estimation error: ${msg.payload.message}`);
          break;

        case "strategy/selection":
          setSelectedStrategyIds(msg.payload.selected.map((s) => s.strategyId));
          break;

        case "strategy/savingsUpdate":
          setSavings({
            build: msg.payload.build,
            runtime: msg.payload.runtime,
          });
          break;

        case "optimize/implement/plan":
        case "optimize/apply/progress":
          setImplementStatus("running");
          break;

        case "optimize/apply/complete":
        case "optimize/handoff/result":
          setImplementStatus("completed");
          break;

        default:
          break;
      }
    });

    return unsubscribe;
  }, []);

  const navItems = [
    { id: "enhance" as TabId, label: "Enhance", icon: Sparkles },
    { id: "estimate" as TabId, label: "Estimate", icon: Calculator },
    { id: "optimize" as TabId, label: "Optimize", icon: Sliders },
    { id: "implement" as TabId, label: "Implement", icon: FolderGit2 },
    { id: "settings" as TabId, label: "Settings", icon: Settings },
  ];

  const currentProfileVersion = profile ? profile.profileVersion : 1;

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-indigo-500 to-violet-500 flex items-center justify-center text-white font-bold text-xs shadow-md shadow-indigo-500/20">
            TO
          </div>
          <span className="font-semibold text-xs tracking-tight text-slate-100">
            Token Optimizer
          </span>
          <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            {platform}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isOffline ? (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/40 px-2 py-0.5 rounded-full">
              <WifiOff className="w-3 h-3" />
              <span>
                {catalogPublishedAt
                  ? `Snapshot from ${new Date(catalogPublishedAt).toISOString().split("T")[0]}`
                  : "Offline Fallback"}
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
              <Wifi className="w-3 h-3" /> Catalog Connected
            </span>
          )}
        </div>
      </header>

      {/* Global Error Notification Banner */}
      {errorBanner && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 px-4 py-2 text-xs text-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-400 hover:text-rose-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tabs Navigation */}
      <nav className="border-b border-slate-800/80 bg-slate-900/40 px-4 py-1.5 flex gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? "bg-slate-800 text-slate-100 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              {item.id === "estimate" && profile?.finalizedAt && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Profile Finalized" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-4xl mx-auto w-full">
        {activeTab === "enhance" && (
          <EnhanceView
            profile={profile}
            narrative={narrative}
            isStreaming={isEnhanceStreaming}
            costUsd={enhanceCostUsd}
            enhanceModel={enhanceModel}
            catalogPhases={catalogPhases}
            onProfileSelect={setProfile}
          />
        )}

        {activeTab === "estimate" && (
          <EstimateView
            estimation={estimation}
            isLoading={isEstimating}
            profileVersion={currentProfileVersion}
            profile={profile}
            catalogPhases={catalogPhases}
            models={models}
            pricing={pricing}
          />
        )}

        {activeTab === "optimize" && (
          <OptimizeView
            strategies={strategies}
            selectedStrategyIds={selectedStrategyIds}
            savings={savings}
            profileVersion={currentProfileVersion}
          />
        )}

        {activeTab === "implement" && (
          <ImplementView
            selectedStrategyIds={selectedStrategyIds}
            profileVersion={currentProfileVersion}
            implementStatus={implementStatus}
            onStatusChange={setImplementStatus}
          />
        )}

        {activeTab === "settings" && (
          <SettingsView
            platform={platform}
            configuredKeys={configuredKeys}
            copilotAvailable={copilotAvailable}
            providers={providers}
            models={models}
          />
        )}
      </main>
    </div>
  );
};
