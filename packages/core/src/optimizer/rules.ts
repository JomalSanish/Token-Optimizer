/**
 * Deterministic rule techniques of the prompt optimizer, as pure functions over a text or over a
 * request ({messages, params}). Semantics are pinned by packages/fixtures/optimizer/README.md and
 * must stay byte-identical to the Python runtime (`ai_optimizer.techniques`).
 *
 * Exports: RuleParams, OptimizerRequest, RuleTechnique, RULE_TECHNIQUES, isRuleTechnique,
 *   whitespaceNormalizeText, fillerRemovalText, dedupeSentencesLines, cavemanText
 * Feature: prompt optimizer
 */
import type { PromptMessage, PromptParams } from "../protocol/types.js";

export type RuleParams = Record<string, unknown>;

export interface OptimizerRequest {
  messages: PromptMessage[];
  params: PromptParams;
}

export interface RuleTechnique {
  text(text: string, params: RuleParams): string;
  request(req: OptimizerRequest, params: RuleParams): OptimizerRequest;
}

// ─── whitespace-normalize ───────────────────────────────────────────────────

const RULE_LINE = /^(?:-{3,}|\*{3,}|_{3,})$/;

/** `\r\n`→`\n`, drop rule lines, collapse inner space runs, strip trailing ws, ≤1 blank line, trim. */
export function whitespaceNormalizeText(text: string): string {
  const out: string[] = [];
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    if (RULE_LINE.test(raw.trim())) continue;
    const indent = /^[ \t]*/.exec(raw)![0];
    const line = (indent + raw.slice(indent.length).replace(/[ \t]+/g, " ")).replace(/\s+$/, "");
    if (line === "" && out.length > 0 && out[out.length - 1] === "") continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

// ─── filler-removal ─────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseList(params: RuleParams): string[] {
  const raw = Array.isArray(params.phrases) ? params.phrases : [];
  const phrases = raw.filter((p): p is string => typeof p === "string" && p.length > 0);
  // Longest first; Array.prototype.sort is stable, so ties keep list order.
  return phrases.map((p, i) => ({ p, i })).sort((a, b) => b.p.length - a.p.length || a.i - b.i).map((x) => x.p);
}

function cleanFillerLine(original: string, line: string): string {
  let s = line.replace(/[ \t]+/g, " ");
  s = s.replace(/ +(?=[,.;:!?])/g, "");
  s = s.replace(/^, ?/, "");
  s = s.trim();
  // First non-whitespace character of the original line (pinned by c-filler-removal-text).
  const first = original.trimStart().charAt(0);
  const now = s.charAt(0);
  if (/^\p{Lu}$/u.test(first) && /^\p{Ll}$/u.test(now)) {
    s = now.toUpperCase() + s.slice(1);
  }
  return s;
}

/** Removes catalog filler phrases (word-bounded, case-insensitive), then tidies touched lines. */
export function fillerRemovalText(text: string, params: RuleParams): string {
  const patterns = phraseList(params).map(
    (p) => new RegExp(`(?<![A-Za-z0-9])${escapeRegex(p)}(?![A-Za-z0-9])`, "gi")
  );
  if (patterns.length === 0) return text;
  return text
    .split("\n")
    .map((original) => {
      let line = original;
      for (const re of patterns) line = line.replace(re, "");
      return line === original ? original : cleanFillerLine(original, line);
    })
    .join("\n");
}

// ─── dedupe-sentences ───────────────────────────────────────────────────────

function sentenceKey(sentence: string): string {
  return sentence.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "").trim();
}

/**
 * Drops sentences whose key was already seen in `seen` (shared across a whole request).
 * Returns the kept text; a line that lost all its sentences is removed.
 */
export function dedupeSentencesLines(text: string, seen: Set<string>): string {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    const sentences = line.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter((s) => {
      const key = sentenceKey(s);
      if (key === "") return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (kept.length === 0) continue;
    lines.push(kept.join(" "));
  }
  return lines.join("\n");
}

// ─── caveman-output ─────────────────────────────────────────────────────────

function instructionOf(params: RuleParams): string {
  return typeof params.instruction === "string" ? params.instruction : "";
}

export function cavemanText(text: string, params: RuleParams): string {
  const instruction = instructionOf(params);
  return instruction ? `${text}\n\n${instruction}` : text;
}

// ─── registry ───────────────────────────────────────────────────────────────

const mapContents = (
  req: OptimizerRequest,
  fn: (m: PromptMessage) => string
): OptimizerRequest => ({
  messages: req.messages.map((m) => ({ role: m.role, content: fn(m) })),
  params: { ...req.params },
});

export const RULE_TECHNIQUES: Record<string, RuleTechnique> = {
  "whitespace-normalize": {
    text: (t) => whitespaceNormalizeText(t),
    request: (req) => mapContents(req, (m) => whitespaceNormalizeText(m.content)),
  },
  "filler-removal": {
    text: (t, p) => fillerRemovalText(t, p),
    request: (req, p) =>
      mapContents(req, (m) => (m.role === "assistant" ? m.content : fillerRemovalText(m.content, p))),
  },
  "dedupe-sentences": {
    text: (t) => dedupeSentencesLines(t, new Set()),
    request: (req) => {
      const seen = new Set<string>();
      return mapContents(req, (m) => dedupeSentencesLines(m.content, seen));
    },
  },
  "cache-prefix-ordering": {
    text: (t) => t,
    request: (req) => ({
      messages: [
        ...req.messages.filter((m) => m.role === "system"),
        ...req.messages.filter((m) => m.role !== "system"),
      ].map((m) => ({ ...m })),
      params: { ...req.params },
    }),
  },
  "caveman-output": {
    text: (t, p) => cavemanText(t, p),
    request: (req, p) => {
      const instruction = instructionOf(p);
      const messages = req.messages.map((m) => ({ ...m }));
      if (instruction) {
        const sys = messages.find((m) => m.role === "system");
        if (sys) sys.content = `${sys.content}\n\n${instruction}`;
        else messages.unshift({ role: "system", content: instruction });
      }
      return { messages, params: { ...req.params } };
    },
  },
  "max-output-cap": {
    text: (t) => t,
    request: (req, p) => {
      const cap = typeof p.maxTokens === "number" && p.maxTokens > 0 ? Math.floor(p.maxTokens) : undefined;
      const params = { ...req.params };
      if (cap !== undefined) params.max_tokens = Math.min(params.max_tokens ?? cap, cap);
      return { messages: req.messages.map((m) => ({ ...m })), params };
    },
  },
};

export function isRuleTechnique(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(RULE_TECHNIQUES, id);
}
