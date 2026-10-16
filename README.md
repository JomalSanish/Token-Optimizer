# Token Optimizer

A VS Code extension that estimates what an LLM feature will cost, recommends token-saving
techniques, optimizes prompts, and writes those optimizations (and a rule-based model router)
into Python + LangChain code, one reviewed block at a time.

## The four features

| Tab | What it does |
|---|---|
| **Enhance → Estimate** | Turns a plain-English description (or a workspace scan) into a project profile via your LLM, then estimates monthly build/runtime cost for every catalog model with an Explain view of each number |
| **Optimize** | Pre-selects catalog techniques that apply to the profile, with reasons; savings are computed per channel (input techniques on input cost, output techniques on output cost) and shown in the Estimate tab as "w/ selected techniques" |
| **Prompt Optimizer** | Paste a prompt, pick techniques (6 local rule techniques + 1 LLM technique), see the optimized prompt, a per-step token table and $ per 1k calls |
| **Implement** | Exports the `ai_optimizer` Python package into your workspace, scans `.py` files for LangChain call sites, and offers each block with Apply / Skip / Open diff (undoable, stale-checked) |
| **Router** | Rule-based tiers (economy / standard / advanced) from the catalog; preview which model a prompt routes to, edit and save rules, export them to `ai_optimizer/router_config.json` |

Live provider: **Groq** (verified). OpenAI and Anthropic adapters are covered by mocked tests and
`pnpm smoke:live` checks them once their keys are set. Target code: **Python + LangChain v1**.

## Quick start

```bash
npx -y pnpm@12.10.1 install --frozen-lockfile
```

```bash
npx -y pnpm@12.10.1 -r build
```

```bash
npx -y pnpm@12.10.1 catalog:dev --no-snapshot
```

Then press F5 in VS Code (**Run Extension (demo workspace)** after `npx -y pnpm@12.10.1 demo:workspace`),
or install the VSIX from `npx -y pnpm@12.10.1 package:vsix`. Full steps:
[docs/getting-started.md](docs/getting-started.md). A 10-minute presenter walkthrough:
[docs/demo-script.md](docs/demo-script.md).

## Repository layout

| Path | Contents |
|---|---|
| `packages/core` | Pure TS: protocol schemas, estimation engine, StrategyEngine + savings, prompt-optimizer techniques, RouterRules, Implement planner |
| `packages/extension` | VS Code host: handlers per feature, catalog service, provider adapters, SecretStorage keys |
| `packages/webview` | React UI (the tabs above) |
| `packages/catalog-api`, `packages/catalog-tools` | Catalog API (Fastify + MongoDB), migrations, seed, review, publish (+ bundled offline snapshot) |
| `packages/python-runtime` | `ai_optimizer` (techniques, router, LangChain middleware); bundled into the extension at build |
| `packages/fixtures` | Golden fixtures shared by Vitest and pytest (TS ↔ Python parity) |
| `examples/demo-langchain-app` | Demo target app (agent, invoke and stream call sites) |
| `tools/harness` | Host harness: `pnpm harness:check <scenario>` runs scripted end-to-end checks against the built extension |

## Checks

```bash
npx -y pnpm@12.10.1 lint
```

```bash
npx -y pnpm@12.10.1 -r test
```

```bash
npx -y pnpm@12.10.1 harness:check demo-e2e
```

Python: `pytest packages/python-runtime` and `ruff check packages/python-runtime examples` (install
`packages/python-runtime/requirements-dev.txt` and `requirements.txt`). Project plan and gate
reports: [docs/completion-plan.md](docs/completion-plan.md), [docs/gates/](docs/gates/).

## License

See [LICENSE](LICENSE).
