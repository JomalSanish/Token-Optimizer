import React, { useState } from "react";
import { KeyRound, ShieldCheck, Trash2, Cpu, EyeOff } from "lucide-react";
import { vscodeBridge } from "../protocol/vscode";
import type { Provider } from "@token-optimizer/core";

interface ConfiguredKey {
  providerId: string;
  keySlot: number;
  maskedKey: string;
  enabledModels: string[];
}

interface SettingsViewProps {
  platform: string;
  configuredKeys: ConfiguredKey[];
  copilotAvailable: boolean;
  providers?: Provider[];
  initialCopilotOnly?: boolean;
}

const DEFAULT_PROVIDERS = [
  { id: "anthropic", label: "Anthropic Claude", keyFormatHint: "sk-ant-..." },
  { id: "openai", label: "OpenAI GPT", keyFormatHint: "sk-proj-..." },
  { id: "google", label: "Google Gemini", keyFormatHint: "AIzaSy..." },
  { id: "mistral", label: "Mistral AI", keyFormatHint: "mistral-..." },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  platform,
  configuredKeys,
  copilotAvailable,
  providers,
  initialCopilotOnly = false,
}) => {
  const activeProviders = providers && providers.length > 0 ? providers : DEFAULT_PROVIDERS;
  const [selectedProvider, setSelectedProvider] = useState(activeProviders[0]?.id || "anthropic");
  const [keyInput, setKeyInput] = useState("");
  const [copilotOnly, setCopilotOnly] = useState(initialCopilotOnly);

  const handleSaveKey = () => {
    if (!keyInput.trim()) return;

    // Calculate next available keySlot for this provider (Finding 13)
    const existingSlots = configuredKeys
      .filter((k) => k.providerId === selectedProvider)
      .map((k) => k.keySlot);
    const nextSlot = existingSlots.length > 0 ? Math.max(...existingSlots) + 1 : 0;

    // Dispatch key to host process. Clear from component memory immediately!
    vscodeBridge.postMessage({
      version: 1,
      type: "auth/saveKey",
      payload: {
        providerId: selectedProvider,
        keySlot: nextSlot,
        key: keyInput.trim(),
      },
    });

    setKeyInput("");
  };

  const handleRemoveKey = (providerId: string, keySlot: number) => {
    vscodeBridge.postMessage({
      version: 1,
      type: "auth/removeKey",
      payload: {
        providerId,
        keySlot,
      },
    });
  };

  const handleToggleCopilotOnly = (checked: boolean) => {
    setCopilotOnly(checked);
    vscodeBridge.postMessage({
      version: 1,
      type: "auth/setCopilotOnly",
      payload: {
        copilotOnly: checked,
      },
    });
  };

  const currentProviderHint = activeProviders.find((p) => p.id === selectedProvider)?.keyFormatHint;

  return (
    <div className="space-y-6">
      {/* Security Architecture Notice */}
      <div className="glass-panel p-4 rounded-xl border border-indigo-500/30 bg-indigo-950/20 text-xs text-indigo-300 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block text-indigo-200">
            Constitution Principle I Enforced
          </span>
          API keys are write-only in the webview. Once submitted, raw keys are stored exclusively
          in the OS Keychain via extension host Keytar and never returned to the webview or logged.
        </div>
      </div>

      {/* Add New Key Form */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
          <span>Add Provider API Key</span>
        </h3>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Target Provider</label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              {activeProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Detected Platform</label>
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 text-slate-300 font-mono">
              {platform || "vscode"}
            </div>
          </div>
        </div>

        <div>
          <label className="text-slate-400 block mb-1 text-xs">
            API Secret Key ({currentProviderHint || "write-only"})
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Paste key here (write-only)..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
            />
            <button
              onClick={handleSaveKey}
              disabled={!keyInput.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              Save Key
            </button>
          </div>
        </div>
      </div>

      {/* Configured Keys List */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Configured Provider Keys
        </h3>

        {configuredKeys.length > 0 ? (
          <div className="divide-y divide-slate-800/80">
            {configuredKeys.map((k) => (
              <div
                key={`${k.providerId}-${k.keySlot}`}
                className="py-3 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-semibold text-slate-200 uppercase">
                    {k.providerId} [slot {k.keySlot}]
                  </span>
                  <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[11px] mt-0.5">
                    <EyeOff className="w-3 h-3 text-slate-500" />
                    <span>{k.maskedKey}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleRemoveKey(k.providerId, k.keySlot)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 rounded transition-colors"
                  title="Remove Key from Keychain"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-slate-500">
            No API keys configured. Using local or platform defaults.
          </div>
        )}
      </div>

      {/* Copilot Fallback Setting */}
      <div className="glass-panel p-5 rounded-xl border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <div>
            <span className="text-xs font-semibold text-slate-200 block">
              VS Code Copilot Only Mode
            </span>
            <p className="text-[11px] text-slate-400">
              Only use built-in Language Model API (no external API keys required).
            </p>
          </div>
        </div>

        <input
          type="checkbox"
          checked={copilotOnly}
          onChange={(e) => handleToggleCopilotOnly(e.target.checked)}
          disabled={!copilotAvailable}
          className="rounded border-slate-700 text-indigo-600 focus:ring-0 bg-slate-950 w-4 h-4 cursor-pointer"
        />
      </div>
    </div>
  );
};
