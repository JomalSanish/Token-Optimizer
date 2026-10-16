/**
 * Rule-based model router, behaviourally identical to Python `ai_optimizer.router.route`
 * (parity enforced by packages/fixtures/router/*.json). Pure and deterministic.
 * Rules: advanced keyword (case-insensitive, ASCII whole word) -> "advanced"; else length (Unicode
 * code points of the contents joined with "\n") <= maxCharsForEconomy and no tools -> "economy";
 * else defaultTier; needsTools raises to at least needsToolsMinTier. The model is the first
 * candidate of the tier; an empty tier falls back upward (economy -> standard -> advanced), then
 * downward.
 *
 * Exports: RouterInput, ROUTER_TIERS, routerInputText, findAdvancedKeyword, routeTier, routePrompt,
 *   presetToRouterConfig, TierRouter
 * Feature: model router
 */
import type {
  PromptMessage,
  RouteDecision,
  RouterConfig,
  RouterPreset,
  RouterTier,
} from "../protocol/types.js";

/** Plain text, or chat messages (only `content` is measured). */
export type RouterInput = string | ReadonlyArray<Pick<PromptMessage, "content">>;

export const ROUTER_TIERS: readonly RouterTier[] = ["economy", "standard", "advanced"];

const rank = (t: RouterTier): number => ROUTER_TIERS.indexOf(t);

/** The routed text: the input string, or message contents joined with "\n". */
export function routerInputText(input: RouterInput): string {
  return typeof input === "string" ? input : input.map((m) => m.content).join("\n");
}

const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());
const isAsciiWord = (c: string | undefined): boolean => !!c && /[A-Za-z0-9_]/.test(c);

/** First keyword (in list order) found case-insensitively on ASCII word boundaries, else null. */
export function findAdvancedKeyword(text: string, keywords: readonly string[]): string | null {
  const hay = asciiLower(text);
  for (const kw of keywords) {
    const needle = asciiLower(kw);
    if (!needle) continue;
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      if (!isAsciiWord(hay[at - 1]) && !isAsciiWord(hay[at + needle.length])) return kw;
      from = at + 1;
    }
  }
  return null;
}

/** Tier + human-readable reason for a text under `config.rules`. */
export function routeTier(
  text: string,
  config: RouterConfig,
  needsTools = false
): { tier: RouterTier; reason: string } {
  const { rules } = config;
  const length = [...text].length;
  let tier: RouterTier;
  let reason: string;
  const keyword = findAdvancedKeyword(text, rules.advancedKeywords);
  if (keyword !== null) {
    tier = "advanced";
    reason = `advanced keyword "${keyword}"`;
  } else if (length <= rules.maxCharsForEconomy && !needsTools) {
    tier = "economy";
    reason = `short prompt (${length} <= ${rules.maxCharsForEconomy} chars)`;
  } else {
    tier = rules.defaultTier;
    reason =
      length > rules.maxCharsForEconomy
        ? `long prompt (${length} > ${rules.maxCharsForEconomy} chars) -> default tier`
        : "needs tools -> default tier";
  }
  if (needsTools && rank(tier) < rank(rules.needsToolsMinTier)) {
    tier = rules.needsToolsMinTier;
    reason += `; needs tools -> at least ${rules.needsToolsMinTier}`;
  }
  return { tier, reason };
}

/** Tier search order for an empty tier: itself, then upward, then downward. */
function fallbackOrder(tier: RouterTier): RouterTier[] {
  const i = rank(tier);
  return [tier, ...ROUTER_TIERS.slice(i + 1), ...ROUTER_TIERS.slice(0, i).reverse()];
}

/** Full routing decision. Throws when every tier is empty. */
export function routePrompt(
  input: RouterInput,
  config: RouterConfig,
  needsTools = false
): RouteDecision {
  const { tier, reason } = routeTier(routerInputText(input), config, needsTools);
  for (const t of fallbackOrder(tier)) {
    const candidate = config.tiers[t][0];
    if (candidate) {
      return {
        model: candidate.modelId,
        provider: candidate.providerId,
        tier: t,
        reason: (t === tier ? reason : `${reason}; tier ${tier} is empty -> ${t}`).slice(0, 500),
      };
    }
  }
  throw new Error("Router config has no candidate models in any tier");
}

/** RouterConfig (the exported `router_config.json` shape) from a catalog preset. */
export function presetToRouterConfig(preset: RouterPreset): RouterConfig {
  return {
    presetId: preset.id,
    tiers: {
      economy: preset.tiers.economy.map((c) => ({ ...c })),
      standard: preset.tiers.standard.map((c) => ({ ...c })),
      advanced: preset.tiers.advanced.map((c) => ({ ...c })),
    },
    rules: { ...preset.rules, advancedKeywords: [...preset.rules.advancedKeywords] },
  };
}

/** Object wrapper over a fixed config (convenience for hosts). */
export class TierRouter {
  constructor(readonly config: RouterConfig) {}

  route(input: RouterInput, needsTools = false): RouteDecision {
    return routePrompt(input, this.config, needsTools);
  }
}
