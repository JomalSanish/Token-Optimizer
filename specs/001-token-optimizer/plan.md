# Implementation Plan: Token Optimizer

**Branch**: `001-token-optimizer` | **Date**: 2026-10-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-token-optimizer/spec.md`

---

## Summary

Token Optimizer is a VS Code-family extension (installable on VS Code, Antigravity IDE,
Cursor, Windsurf, and compatible forks via Marketplace or Open VSX) that helps developers
describe an LLM-powered project, estimate its token cost across BUILD and RUNTIME phases,
select optimization strategies, and apply them. It is structured as a pnpm monorepo with
five packages: a pure TypeScript core library, a VS Code extension host, a React webview
UI, a read-only Catalog API, and catalog-tools scripts.

**Technical approach**: The estimation engine is a pure deterministic function in `core`.
All secrets live in VS Code SecretStorage, accessed only by a `KeyService` in `extension`.
The webview communicates with the extension host via a typed, Zod-validated, nonce-protected
message protocol. Catalog data is consumed from a read-only API with ETag caching and a
bundled offline fallback. The existing MongoDB database is extended with idempotent
migrations — no collections are dropped.

---

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode throughout); Node.js 20 LTS for the
extension host and catalog-api; Python 3.11 for any legacy catalog-tools scripts (migrated
to TS where new code is written).

**Primary Dependencies**:
- `packages/core`: zod, tiktoken (OpenAI/GPT tokenizer), js-tiktoken or gpt-tokenizer
  (browser-safe alternative), @anthropic-ai/sdk, openai, @google/generative-ai,
  @mistralai/client-ts (adapter libraries used without vscode import).
- `packages/extension`: @types/vscode (VS Code extension API); tree-sitter + tree-sitter-
  typescript + tree-sitter-python (for Apply now AST scanning); vscode-diff (built-in
  diff viewer via API).
- `packages/webview`: React 18, Vite, Tailwind CSS, @radix-ui primitives.
- `packages/catalog-api`: Fastify 4 (preferred; fall back to existing FastAPI if the
  backend is already deployed); mongoose or native mongodb driver; zod-to-json-schema for
  endpoint response validation.
- `packages/catalog-tools`: tsx (TypeScript scripts), commander, execa, Zod.

**Storage**:
- Extension: VS Code SecretStorage (keys), workspaceState (profile version history,
  baseline.json pointer), globalState (catalog cache + ETag).
- Catalog: MongoDB (existing Cluster0). No new databases.
- Workspace artefacts: `.ai-optimizer/` directory written to the open workspace folder.

**Testing**:
- `packages/core`: Vitest (unit + golden-file + property-based with fast-check).
- `packages/extension`: @vscode/test-electron (integration), mocha.
- `packages/webview`: Vitest + @testing-library/react.
- `packages/catalog-api`: Vitest (contract + integration against test MongoDB instance).
- End-to-end: custom fixture runner in `packages/fixtures/` exercising Enhance (mocked
  LLM) → Estimate → Optimize → Apply on `fixtures/` project snapshots.

**Target Platform**: VS Code extension host (Node.js); VSIX packaged for VS Code Marketplace
and Open VSX Registry. Webview runs in VS Code's built-in Chromium renderer.

**Project Type**: VS Code Extension (monorepo with supporting backend service).

**Performance Goals**:
- Estimation re-computation on phase-assumption edit: < 50 ms (pure function, no I/O).
- Catalog ETag check on startup: < 500 ms p95 (single HTTP HEAD/GET).
- Apply now scanner on a 500-file workspace: < 10 s (parallelised per-file, streaming).
- Webview initial render: < 1 s after extension activation.

**Constraints**:
- Extension bundle: < 5 MB (exclude tree-sitter WASM from the VSIX; load lazily from
  a CDN or include as a separate download step).
- Webview CSP: `default-src 'none'; script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'`.
- No `vscode` imports in `packages/core/`.
- No MongoDB connection strings or write credentials in any shipped artifact.
- All LLM calls originate from the extension host; the webview never calls a provider.

**Scale/Scope**: Single-user, local extension. The Catalog API serves all installed instances;
target throughput ≤ 500 req/min (Cloudflare or nginx rate limiter upstream).

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate Status | Notes |
|---|---|---|
| I — Keys never leave device | ✅ PASS | KeyService sole reader; adapters get getter fn; no key in webview messages |
| II — Extension host owns sensitive work | ✅ PASS | Webview is React UI only; all network/secrets/FS in extension host |
| III — No DB credentials; read-only catalog + fallback | ✅ PASS | Catalog API has no write endpoints; no credentials in VSIX; bundled snapshot |
| IV — Deterministic estimation | ✅ PASS | `estimate()` is pure fn in core; golden-file tests enforce it |
| V — Honest savings | ✅ PASS | Multiplicative stacking; min/max range; `basis` field required in strategy |
| VI — Nothing written without review | ✅ PASS | Diff view before any workspace write; single WorkspaceEdit; checkpoint first |
| VII — Data-driven catalog | ✅ PASS | Providers, models, phases, strategies, platforms all in catalog; no hardcoded data |
| VIII — Authoring gate | ✅ PASS | `reviewStatus` enum; only "approved" served by API; bot-commit CI check |
| IX — Privacy by default | ✅ PASS | FR-047/048/049; redact-by-default; preview-before-send; Copilot-only mode |
| X — Platform-agnostic core | ✅ PASS | No vscode import in core/; platform paths from catalog |
| XI — Spec-driven discipline | ✅ PASS | Constitution → Specify → Clarify → Plan (current) → Tasks → Implement |

**Complexity justification** (Principle XI — no unnecessary complexity):

| Decision | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| 5-package monorepo | core must be vscode-free; webview must be bundled separately; catalog-api and catalog-tools are separate deployment units | Single package would couple vscode to core and prevent Node-only unit tests |
| MongoDB (read-only via API) | Existing live data; 40 models, 11 providers, 10 phases | Replacing with flat JSON files would lose the existing DB and the migration path |
| React + Vite webview | Complex multi-tab UI with live estimation updates; reusing existing prototype visual language | VS Code's native TreeView/WebviewView cannot deliver the required interactive experience |
| tree-sitter for Apply now | Accurate AST-based detection of LLM call sites across TS/JS and Python | Regex-only detection produces too many false positives/negatives on real codebases |

---

## Project Structure

### Documentation (this feature)

```text
specs/001-token-optimizer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── catalog-api.yaml          # OpenAPI 3.1
│   ├── webview-messages.ts       # Discriminated union types
│   └── project-profile.schema.json
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
packages/
├── core/
│   ├── src/
│   │   ├── catalog/           # CatalogClient, ETag cache, fallback loader, Zod schemas
│   │   ├── providers/         # Adapter interfaces + Anthropic/OpenAI/Google/Mistral/Compat impls
│   │   ├── enhance/           # Enhance prompt runner, profile extractor, repair logic
│   │   ├── profile/           # ProjectProfile Zod schema, version history types
│   │   ├── phases/            # PhaseBuilder: deterministic profile → BUILD+RUNTIME phase lists
│   │   ├── estimation/        # estimate(), ExplainTree, per-phase formula, property tests
│   │   ├── strategies/        # ApplicabilityEvaluator, ConflictResolver, SavingsAggregator
│   │   ├── artifacts/         # ArtifactRenderer: template → .ai-optimizer/ + platform files
│   │   ├── apply/             # ApplyPlanner, EditProposal schema, AnchorValidator
│   │   └── index.ts
│   ├── fixtures/              # golden profiles, catalogs, estimate outputs
│   └── vitest.config.ts
│
├── extension/
│   ├── src/
│   │   ├── activation.ts      # extension activate/deactivate
│   │   ├── platform/          # PlatformDetector (appName + uriScheme + markerFiles)
│   │   ├── secrets/           # KeyService (sole SecretStorage reader/writer)
│   │   ├── webview/           # WebviewProvider, MessageRouter, nonce + CSP builder
│   │   ├── lm/                # CopilotAdapter (vscode.lm bridge)
│   │   ├── workspace/         # CheckpointService, WorkspaceEditApplier, DiffReviewer
│   │   ├── scanner/           # tree-sitter scanner wrapper, language loader
│   │   └── commands/          # VS Code command registrations
│   └── package.json           # extension manifest (contributes, engines.vscode)
│
├── webview/
│   ├── src/
│   │   ├── views/             # Login, Settings, Enhance, Estimate, Optimize (tabs)
│   │   ├── components/        # StrategyCard, PhaseRow, ModelTable, DiffPreview, etc.
│   │   ├── protocol/          # typed postMessage wrappers (mirrors extension/protocol/)
│   │   └── main.tsx
│   └── vite.config.ts
│
├── catalog-api/
│   ├── src/
│   │   ├── routes/            # GET /v1/catalog, /v1/catalog/:collection, /v1/health
│   │   ├── db/                # MongoDB connection, collection accessors, ETag generator
│   │   ├── schemas/           # Zod schemas matching catalog data model
│   │   └── server.ts
│   └── migrations/            # idempotent migration scripts (run once per deploy)
│
├── catalog-tools/
│   ├── src/
│   │   ├── inspect.ts         # dump collection contents
│   │   ├── migrate.ts         # run migrations
│   │   ├── seed.ts            # load reviewed JSON → providers/models/pricing
│   │   ├── validate.ts        # validate all docs against Zod schemas
│   │   ├── publish.ts         # bump catalog_meta.version, set publishedAt
│   │   ├── draft-strategies.ts # LLM-draft implementation for existing strategy names
│   │   └── review-report.ts   # generate human-review checklist for drafted strategies
│   └── tsconfig.json
│
└── fixtures/
    ├── projects/              # sample workspace snapshots (TS/JS, Python)
    ├── profiles/              # golden ProjectProfile JSON files
    ├── estimates/             # golden EstimationResult JSON files
    └── artifacts/             # golden .ai-optimizer/ directory snapshots
```
