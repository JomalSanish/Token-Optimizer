# Feature Specification: Token Optimizer

**Feature Branch**: `001-token-optimizer`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Build Token Optimizer — a VS Code-family extension that lets a developer describe a project, get a structured project description, estimate token usage and cost across BUILD and RUNTIME phases for every model, choose optimization strategies, and apply those strategies."

---

## Clarifications

### Session 2026-10-07

- Q: How are BUILD and RUNTIME phases derived from the Project Profile? → A: A deterministic algorithm maps profile attributes (project type, detected LLM integrations, scale flags) to phases from a catalog-defined phase taxonomy; the user can add, remove, or rename phases before estimation runs; no LLM call is involved in phase generation.
- Q: Which parameters are user-editable per phase, and where do the low/expected/high defaults come from? → A: The user-editable parameters per phase are calls per phase, tokens per call, retries, and volume/scale; the low/expected/high default values for each parameter are stored in the catalog per phase type and applied on first load.
- Q: Which languages are in scope for Apply now detection in v1? → A: TypeScript/JavaScript and Python only in v1.
- Q: How are tokenizer counts produced and how is approximation communicated? → A: Exact counts are produced by a local tokenizer library or a provider count endpoint where one exists for the model family; all other models show counts labelled "approximate" with an explicit ± error margin stated in the UI.
- Q: What is redacted by default, and what are the privacy defaults? → A: Obvious secrets (API keys, tokens, passwords, connection strings matching common patterns) are redacted from prompt content by default before display and before transmission; the user always sees exactly what will be sent before each LLM call; a Copilot-only mode routes all LLM calls through the VS Code Language Model API with no external provider.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Provider Setup & Onboarding (Priority: P1)

A developer opens the extension for the first time (or after clearing credentials).
The onboarding screen detects the current host IDE, pre-selects it in a platform
selector, and shows a list of LLM providers from the catalog. For each provider the
developer wants to use, they enter an API key. The key is validated with a lightweight
authenticated call and stored securely. The developer selects which models they have
access to, then proceeds to the main workspace. On VS Code-family hosts that expose
the Language Model API, GitHub Copilot appears as a keyless pseudo-provider.

**Why this priority**: Without valid credentials or a Copilot route, none of the AI
features in subsequent stories are reachable. This is the entry gate for all users.

**Independent Test**: Can be fully tested by launching the extension in a fresh
environment and confirming a provider + model is configured, then verifying the
next screen is accessible — delivering the core value of "credentials are set up
safely."

**Acceptance Scenarios**:

1. **Given** no keys are stored, **When** the user opens the extension, **Then** the
   onboarding screen appears with the host platform auto-detected and pre-selected.
2. **Given** the user enters a valid API key for a provider, **When** they save,
   **Then** the key is validated, stored in secure storage, and shown masked (last
   4 characters only); the plaintext key is never displayed again.
3. **Given** the user enters an invalid API key, **When** they save, **Then** a clear
   error message is shown and no key is stored.
4. **Given** the key-validation endpoint is unreachable, **When** the user saves,
   **Then** a specific "validation unavailable" warning is shown and the user can
   choose to store the key anyway or cancel.
5. **Given** the catalog is unavailable at first launch, **When** the onboarding
   screen loads, **Then** the bundled fallback snapshot is used and a "working
   offline" notice is shown.
6. **Given** a VS Code Language Model API is available, **When** the onboarding
   screen loads, **Then** a GitHub Copilot pseudo-provider appears in the list with
   no key field.
7. **Given** a key has been stored, **When** the user navigates to Settings,
   **Then** they can add, replace or remove any key; removing a key deletes it from
   secure storage entirely.

---

### User Story 2 — Project Description & Enhancement (Priority: P1)

A developer opens a workspace and navigates to the Enhance step. They type a rough
project description (or accept a pre-filled draft scanned from the workspace's
package manifests, framework imports, and README). They press Enhance and the
extension calls the chosen LLM, returning a readable detailed description and a
validated structured Project Profile. The developer can refine the text and run
Enhance again to iteratively improve the profile. A version history with diff lets
them step back. When satisfied, they mark a version as final to unlock the next step.

**Why this priority**: The Project Profile is the single source of truth for all
downstream estimation and strategy work. Without an accurate profile, everything else
produces misleading output.

**Independent Test**: Can be tested end-to-end in isolation by providing a short
description, running Enhance, and confirming a non-empty, schema-valid Project Profile
is produced and stored — delivering the core value of "a rough idea becomes a
structured, reusable profile."

**Acceptance Scenarios**:

1. **Given** a workspace with package manifests or a README, **When** the user opens
   the Enhance screen, **Then** a pre-filled description draft is shown, clearly
   labelled as auto-scanned and editable.
2. **Given** the user presses Enhance, **When** the LLM responds, **Then** a readable
   detailed description and a schema-validated Project Profile are displayed; the cost
   of the call is shown.
3. **Given** the user presses Enhance a second time on the refined text, **When** the
   LLM responds, **Then** the new output refines the previous version without nesting
   or duplicating any section.
4. **Given** the LLM returns malformed JSON for the Project Profile, **When** this
   occurs, **Then** one automatic repair attempt is made; if it fails, a clear error
   is shown and the previous version is preserved.
5. **Given** multiple enhance runs have been performed, **When** the user opens version
   history, **Then** they can view a diff between any two versions and restore any
   earlier version.
6. **Given** the user marks a version as final, **When** they do so, **Then** the
   Estimate step becomes accessible using that profile version.
7. **Given** Ctrl/Cmd+Enter is pressed in the description field, **When** this
   occurs, **Then** Enhance is triggered; pressing Enter alone inserts a newline.

---

### User Story 3 — Phase-Wise Token & Cost Estimation (Priority: P1)

From the final Project Profile, the extension derives two tracks of phases — BUILD
(AI-assisted development work) and RUNTIME (the application's own LLM usage). The
developer sees token counts (input, output, cached-input where supported), a
low/expected/high range, and cost per enabled model using live catalog pricing. They
can edit any phase's volume assumptions and watch numbers update immediately. A
model-comparison table lets them compare total cost across models for each track.

**Why this priority**: Cost estimation is the primary value proposition for tech leads
and developers deciding which models to use and how to size their LLM budget.

**Independent Test**: Can be tested by loading a known Project Profile with a pinned
catalog version and asserting that the displayed numbers match the expected golden
values — delivering "reliable cost visibility before committing to a model."

**Acceptance Scenarios**:

1. **Given** a finalised Project Profile and a catalog, **When** the Estimate screen
   loads, **Then** BUILD and RUNTIME tracks are shown, each broken into project-specific
   phases derived from the catalog's phase taxonomy via a deterministic mapping from
   profile attributes; the user can add, remove, or rename phases before estimation begins.
2. **Given** a phase is displayed, **When** the user inspects it, **Then** they see
   input tokens, output tokens, cached-input tokens (when the model supports it), and
   a low/expected/high cost range per enabled model.
3. **Given** the same profile and catalog version are used twice, **When** estimation
   runs, **Then** the results are numerically identical both times.
4. **Given** the user edits a phase's assumptions (call volume, tokens per call,
   retries), **When** they change a value, **Then** all affected numbers update
   without requiring a manual refresh.
5. **Given** a RUNTIME phase is selected, **When** viewed, **Then** costs are shown
   per-request, per-user-day, and per-month, derived from scale assumptions in the
   profile.
6. **Given** the user clicks "Explain" on any number, **When** the popover opens,
   **Then** the formula and all input values used to produce that number are visible.
7. **Given** a model has an established tokenizer, **When** token counts are shown,
   **Then** the count is produced by that tokenizer and labelled exact; for other
   models the count is labelled "approximate."

---

### User Story 4 — Strategy Selection (Priority: P1)

The developer navigates to the Strategy screen. Applicable strategies (loaded from the
catalog, approved only) are pre-selected based on the Project Profile. Strategies are
grouped by category (prompt efficiency, caching, model strategy, build-time practices,
etc.). The developer can select or deselect any strategy; conflicting strategies cannot
both be checked and the UI explains why. A live panel shows the combined estimated
savings per track as a conservative range.

**Why this priority**: Strategy selection connects the diagnostic (estimation) to the
action (optimisation) and is the core decision-making step for cost reduction.

**Independent Test**: Can be tested by loading a known profile and asserting that the
correct strategies are pre-selected and that deselecting a conflicting pair resolves
the conflict indicator — delivering "actionable, conflict-free strategy choices."

**Acceptance Scenarios**:

1. **Given** a finalised Project Profile, **When** the Strategy screen loads, **Then**
   only strategies with `reviewStatus = "approved"` from the catalog are shown.
2. **Given** the profile properties, **When** strategies are evaluated, **Then**
   applicable strategies are pre-selected and each shows a human-readable reason.
3. **Given** two conflicting strategies are both selected, **When** this state occurs,
   **Then** the UI prevents it and displays a plain-language explanation of the
   conflict.
4. **Given** strategies are selected, **When** the live savings panel updates, **Then**
   the combined saving is computed multiplicatively and shown as a
   `[min%, max%]` range with the empirical or theoretical basis stated.
5. **Given** the user deselects a strategy, **When** this occurs, **Then** the savings
   panel updates immediately without a page reload.

---

### User Story 5 — Strategy Detail & Try-It Panel (Priority: P2)

Each strategy card has an information button. Clicking it opens a detail panel showing
what the strategy does, its preconditions, savings basis, and known risks. A try-it
area lets the developer paste a real prompt, response, or schema sample to see a
before/after preview with real tokenizer counts. For strategies that require a model
to transform the content, a "Run with LLM" button is available; the expected cost is
shown before the call is made.

**Why this priority**: Seeing a concrete before/after on the developer's own content
dramatically increases trust and strategy adoption, but is not required to proceed with
the core flow.

**Independent Test**: Can be tested by opening a strategy detail panel for any
approved strategy, pasting sample text, and confirming before/after token counts are
displayed — delivering "hands-on evidence that a strategy works on my content."

**Acceptance Scenarios**:

1. **Given** a strategy card is shown, **When** the user clicks the information button,
   **Then** a detail panel opens with description, preconditions, savings basis, and risks.
2. **Given** the try-it area is open, **When** the user pastes content and requests a
   preview, **Then** before and after token counts are shown using real tokenizer counts.
3. **Given** a strategy requires a model to transform content, **When** the user clicks
   "Run with LLM", **Then** the estimated cost is displayed first; the call is only made
   after the user confirms.

---

### User Story 6 — Generate Optimiser Files (Priority: P1)

The developer chooses "Generate files" on the Optimise screen. The extension writes a
structured workspace into the project under `.ai-optimizer/`: a configuration file,
human-readable architecture and requirements documents, per-strategy guidance files,
and platform-native command/prompt files rendered into the locations the catalog
defines for the detected host. The developer can then trigger these commands from the
host's AI chat. Existing files are never silently overwritten — a diff view with
confirm is shown for each conflict.

**Why this priority**: For developers who prefer gradual adoption or work in teams,
having the optimizer's knowledge expressed as persistent, version-controllable files
is more practical than always-live AI inference.

**Independent Test**: Can be tested by running Generate files on a fresh workspace and
confirming all expected files are created in correct locations with non-empty,
schema-valid content — delivering "a persistent, auditable optimization artefact."

**Acceptance Scenarios**:

1. **Given** strategies are selected and "Generate files" is chosen, **When** generation
   runs, **Then** `.ai-optimizer/optimizer.yaml`, project documents, strategy files, and
   platform-native command files are created.
2. **Given** a file from a previous run already exists and has been user-edited, **When**
   generation runs, **Then** a diff view is shown and the user must confirm before the
   file is updated.
3. **Given** the detected host platform has catalog-defined artifact locations, **When**
   command files are generated, **Then** they are written to those catalog-defined paths,
   not to hard-coded paths.
4. **Given** a git repository is present, **When** generation is about to write,
   **Then** a checkpoint commit is created first; otherwise backup copies are written
   to `.ai-optimizer/backups/<timestamp>/`.

---

### User Story 7 — Apply Strategies Directly (Priority: P1)

The developer chooses "Apply now" on the Optimise screen. The extension scans the
workspace for LLM call sites and prompt locations matching each selected strategy's
detection rules. For each candidate, a model is asked to produce structured edit
proposals. The developer reviews every proposed change in a native diff view with
per-hunk accept/reject. Accepted changes are applied atomically (one undo reverts
all) after a checkpoint. An optional audit step compares before/after token counts.

**Why this priority**: Direct application is the highest-leverage action — it closes
the loop from insight to code change. Without it, developers must manually implement
strategies.

**Independent Test**: Can be tested by scanning a workspace with known LLM call sites
and confirming that proposed edits are displayed in a diff view, that accepting and
undoing them leaves the workspace unchanged — delivering "strategy application with
full control and safety."

**Acceptance Scenarios**:

1. **Given** strategies are selected and "Apply now" is chosen, **When** scanning
   completes, **Then** all candidate locations across the workspace are identified
   using each strategy's detection rules.
2. **Given** a candidate location is found, **When** the model produces an edit
   proposal, **Then** the proposal is structured (file path, anchor, original snippet,
   replacement, rationale) and not free-form text.
3. **Given** the anchor of a stale proposal no longer matches the file content,
   **When** applying, **Then** the stale hunk is skipped with an explanatory message;
   it is never applied blindly.
4. **Given** proposals are displayed, **When** the user accepts a subset of hunks,
   **Then** only accepted hunks are applied in a single atomic operation that can be
   fully reversed with one undo.
5. **Given** the user cancels at any point before applying, **When** they cancel,
   **Then** the workspace is left completely unchanged.
6. **Given** application is complete, **When** the user runs the audit, **Then** a
   report shows before/after token counts compared against the stored baseline.

---

### User Story 8 — Catalog Freshness (Priority: P2)

The extension fetches the latest provider, model, pricing, strategy, platform, and
prompt template data from the Catalog API at startup and every 24 hours, using ETag
revalidation to avoid redundant downloads. The current catalog version and "last
updated" timestamp are visible in the UI. When offline, the extension falls back to
the most recently cached catalog or, if no cache exists, the bundled snapshot.

**Why this priority**: Keeping the catalog current ensures pricing and strategy data
stay accurate without requiring an extension release, but the fallback ensures the
extension always works.

**Independent Test**: Can be tested by simulating an offline environment and confirming
the bundled snapshot is used and the UI reflects the offline status — delivering
"catalog data is always available even without internet."

**Acceptance Scenarios**:

1. **Given** the extension starts with internet access, **When** the catalog API
   responds with a new ETag, **Then** the new catalog data is downloaded, validated,
   and stored in the local cache.
2. **Given** the extension starts with internet access, **When** the catalog API
   responds with `304 Not Modified`, **Then** the local cache is used without
   re-parsing the full payload.
3. **Given** the extension is offline at startup, **When** no local cache exists,
   **Then** the bundled fallback snapshot is loaded and a "working offline" notice
   is shown.
4. **Given** the catalog response has a schema version newer than the extension
   supports, **When** this occurs, **Then** the extension falls back to its cached
   version and shows an "extension update available" notice; it does not crash.

---

### Edge Cases

- **Multi-root workspaces**: When multiple root folders are open, the user can select
  which root(s) to scan for the workspace pre-fill and for Apply now detection.
- **No workspace open**: All screens except the catalog browser are unavailable; a
  clear prompt to open a folder is shown.
- **Monorepos with multiple languages**: Detection rules are applied per-file based on
  language; in v1, detection covers TypeScript/JavaScript and Python files only; files
  in other languages are skipped with a user-visible notice listing the skipped paths.
- **Very large files**: Files exceeding a configurable size threshold are skipped during
  detection with a user-visible warning listing the skipped paths.
- **Provider rate limits and retries**: When a provider returns a rate-limit error, the
  extension waits with exponential backoff (up to 3 retries) and shows a countdown
  to the user; after 3 failures the operation is aborted with a clear error.
- **Key validation endpoint unavailable**: The user is informed and offered the choice
  to store the key without validation or cancel.
- **Model missing from catalog**: A manual entry UI allows adding a model with
  user-supplied context length and pricing; these entries are flagged as "unverified."
- **Pricing without cached-input rate**: Cost estimates for that model omit the
  cached-input column and show a "no cached pricing data" label.
- **User edits files while diff is open**: Before applying hunks, the extension
  re-validates anchors against the current file state; stale hunks are flagged and
  require re-review.
- **Copilot unavailable or user declines consent**: The Copilot pseudo-provider is
  hidden or disabled; the user is prompted to configure an alternative provider.
- **Catalog schema version newer than extension**: The extension falls back to cache
  and displays an update notice; it does not attempt to parse an unrecognised schema.

---

## Requirements *(mandatory)*

### Functional Requirements

**Onboarding & Credentials**
- **FR-001**: The extension MUST detect the current host IDE at startup and pre-select
  it in the platform selector; the user MUST be able to override the selection.
- **FR-002**: The extension MUST display all providers from the catalog on the
  onboarding screen; providers added to the catalog later MUST appear without an
  extension release.
- **FR-003**: The extension MUST validate an API key with a lightweight authenticated
  call before storing it; an explicit "validation unavailable" path MUST exist.
- **FR-004**: The extension MUST store API keys exclusively in the host's secure secret
  storage; keys MUST NEVER be written to settings, logs, telemetry, or the UI layer.
- **FR-005**: After saving, an API key MUST be displayed only as a masked value showing
  the last 4 characters; the plaintext key MUST NOT be retrievable through the UI.
- **FR-006**: Removing a key from settings MUST delete it from secure storage.
- **FR-007**: On VS Code-family hosts exposing the Language Model API, a GitHub Copilot
  pseudo-provider MUST appear with no key field required.
- **FR-008**: The extension MUST start and be usable when offline, using the cached
  catalog or bundled snapshot.

**Project Description & Enhancement**
- **FR-009**: The Enhance screen MUST attempt to pre-fill the description field by
  scanning workspace package manifests, framework imports, and README files; the
  user MUST be able to edit or clear this draft.
- **FR-010**: Pressing Enhance MUST call the chosen provider/model with a versioned
  system prompt and return both a readable description and a schema-validated Project
  Profile.
- **FR-011**: Re-running Enhance on edited text MUST refine the previous version; it
  MUST NOT nest, duplicate, or wrap existing sections.
- **FR-012**: The cost of each Enhance call MUST be shown to the user before and after
  the call.
- **FR-013**: If the LLM returns malformed JSON for the Project Profile, the extension
  MUST make exactly one automatic repair attempt; if that fails, a clear error MUST be
  shown and the previous version MUST be preserved.
- **FR-014**: The extension MUST maintain a version history of Project Profiles with
  diff between any two versions and restore capability.
- **FR-015**: The user MUST be able to mark a Profile version as "final" to unlock the
  Estimate step.
- **FR-016**: Ctrl/Cmd+Enter in the description field MUST trigger Enhance; Enter alone
  MUST insert a newline.

**Estimation**
- **FR-017**: The Estimate screen MUST derive BUILD and RUNTIME phase sets from the
  Project Profile using a deterministic algorithm that maps profile attributes (project
  type, detected LLM integrations, scale flags) to phases from a catalog-defined phase
  taxonomy; the user MUST be able to add, remove, and rename phases before estimation
  runs; no LLM call is involved in phase generation.
- **FR-018**: For each phase, the extension MUST show input tokens, output tokens,
  cached-input tokens (when the model supports it), and a low/expected/high cost
  range per enabled model using catalog pricing; default low/expected/high values for
  each phase parameter (calls per phase, tokens per call, retries, volume/scale) MUST
  be loaded from the catalog per phase type and applied on first load.
- **FR-019**: Identical profile and catalog version inputs MUST always produce identical
  numeric outputs (deterministic estimation).
- **FR-020**: The user MUST be able to edit any phase's four assumptions — calls per
  phase, tokens per call, retries, and volume/scale — and see all affected numbers
  update immediately without a manual refresh.
- **FR-021**: RUNTIME costs MUST be shown per-request, per-user-day, and per-month
  using scale assumptions from the profile.
- **FR-022**: An "Explain" control MUST be available for every displayed number; it
  MUST show the formula and all input values used.
- **FR-023**: Token counts MUST be produced by a local tokenizer library or a provider
  count endpoint when one exists for the model family, and labelled "exact"; for all
  other models the extension MUST use a character-based approximation labelled
  "approximate" with an explicit ± error margin displayed alongside the count.
- **FR-024**: A model-comparison table MUST show total cost per model for each track.

**Strategy Selection**
- **FR-025**: The Strategy screen MUST load and display only catalog strategies with
  `reviewStatus = "approved"`.
- **FR-026**: Applicable strategies MUST be pre-selected using declarative applicability
  predicates evaluated against the Project Profile; no hard-coded regex rules MUST
  exist in extension source.
- **FR-027**: Each pre-selected strategy MUST show a human-readable reason for
  pre-selection.
- **FR-028**: Conflicting strategies MUST be mutually exclusive in the UI; a
  plain-language explanation of each conflict MUST be shown.
- **FR-029**: The combined savings panel MUST compute savings multiplicatively and
  display a conservative `[min%, max%]` range with stated basis; unqualified
  percentage claims MUST NOT appear.

**Strategy Detail & Try-It**
- **FR-030**: Each strategy card MUST offer an information action that opens a detail
  view showing description, preconditions, savings basis, and risks.
- **FR-031**: The detail view MUST include a try-it area where the user can paste
  content and see before/after token counts using real tokenizer counts.
- **FR-032**: For strategies that require a model to transform content, the expected
  cost MUST be shown before the "Run with LLM" call is made; the call MUST NOT
  proceed without user confirmation.

**Generate Files**
- **FR-033**: The "Generate files" action MUST create the `.ai-optimizer/` workspace
  with `optimizer.yaml`, project documents, and per-strategy guidance files.
- **FR-034**: Platform-native command/prompt files MUST be written to the paths defined
  in the catalog's `platforms` collection for the detected host; paths MUST NOT be
  hard-coded in extension source.
- **FR-035**: Existing user-edited files MUST NEVER be silently overwritten; a diff
  view with per-file confirm MUST be shown for each conflict.
- **FR-036**: Before any write, the extension MUST create a checkpoint (git commit/stash
  if a repo exists; backup copies otherwise).

**Apply Now**
- **FR-037**: The "Apply now" action MUST scan the workspace for LLM call sites and
  prompt locations using each selected strategy's language-specific detection rules;
  v1 MUST support TypeScript/JavaScript and Python files; support for additional
  languages is deferred to future releases.
- **FR-038**: Edit proposals from the model MUST be structured JSON (file path, anchor,
  original snippet, replacement, rationale); free-form code blocks MUST NOT be accepted.
- **FR-039**: Before applying, the extension MUST validate that each proposal's anchor
  still matches the current file content; stale hunks MUST be skipped with an
  explanatory message, never applied blindly.
- **FR-040**: All accepted edits MUST be applied in a single atomic operation that can
  be fully reversed with one standard undo action.
- **FR-041**: Cancelling at any point before the apply step MUST leave the workspace
  completely unchanged.
- **FR-042**: After application, the user MUST be offered an audit action that compares
  current token counts against the stored baseline and produces a savings report.

**Catalog Freshness**
- **FR-043**: The extension MUST fetch catalog data at startup and every 24 hours using
  ETag revalidation; a `304 Not Modified` response MUST use the local cache without
  re-parsing.
- **FR-044**: The current catalog version and last-updated timestamp MUST be visible
  in the UI.
- **FR-045**: When offline, the extension MUST use the local cache if available or the
  bundled snapshot if not; a "working offline" notice MUST be shown.
- **FR-046**: If the catalog schema version is newer than the extension supports, the
  extension MUST fall back to the cached version and display an "extension update
  available" notice; it MUST NOT crash.

**Privacy**
- **FR-047**: Before each LLM call, the extension MUST display exactly what will be
  sent — the project description, any code snippets included, and the prompt template
  in use — and the user MUST be able to review and cancel before the request is
  dispatched.
- **FR-048**: Obvious secrets (API keys, tokens, passwords, and connection strings
  matching common patterns) MUST be redacted from prompt content by default before
  display and before transmission; the user MUST be able to disable per-session
  redaction via an explicit toggle.
- **FR-049**: The extension MUST support a "Copilot only / no external keys" mode in
  which all LLM features route exclusively through the VS Code Language Model API;
  in this mode no requests are made to any external provider endpoint.

### Key Entities

- **Project Profile**: Structured JSON document encoding project type, tech stack,
  AI/LLM integrations, components, scale assumptions, and constraints; schema-validated.
- **Catalog**: Read-only collection of providers, models (with pricing and tokenizer
  references), strategies (with preconditions, savings ranges, conflicts), platforms
  (with artifact paths), and prompt templates.
- **Strategy**: Catalog entry with identity, category, preconditions, savings range,
  conflict list, applicability predicate, detection rules (per language), and
  implementation guidance.
- **Phase**: A named stage in either the BUILD or RUNTIME track, with token and volume
  assumptions derived from the Project Profile.
- **Estimation Result**: Deterministic, versioned output of the estimation engine for a
  given profile + catalog snapshot pair.
- **Edit Proposal**: Structured record of a proposed code change: file path, anchor
  hash, original snippet, replacement snippet, and rationale string.
- **Checkpoint**: A Git commit/stash or backup copy set created immediately before any
  workspace write, enabling full rollback.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can complete first-time onboarding (provider setup + model
  selection) in under 3 minutes on a fresh install.
- **SC-002**: The Enhance step produces a schema-valid Project Profile for 95% of
  well-formed natural-language project descriptions on the first or second attempt.
- **SC-003**: Estimation results for a given profile and catalog version are identical
  across repeated runs, different machines, and different host IDEs.
- **SC-004**: Any proposed workspace edit can be fully undone with a single standard
  undo action; no partial state is ever left behind.
- **SC-005**: The extension starts and all catalog-dependent screens load within 5
  seconds when offline, using the fallback snapshot.
- **SC-006**: 100% of displayed cost estimates are traceable to an explicit formula
  and inputs via the "Explain" popover; no number appears without a derivation path.
- **SC-007**: Removing a provider API key removes it from secure storage within one
  user action and renders it unrecoverable through any UI path.
- **SC-008**: All catalog-defined strategy guidance files and platform command files
  are generated to catalog-declared paths without any hard-coded path strings in
  extension source code.
- **SC-009**: The "Apply now" flow leaves the workspace unchanged if the user cancels
  at any stage before the final apply confirmation; verified by automated test.
- **SC-010**: A developer can see a before/after token count preview for any approved
  strategy on their own pasted content without triggering an LLM call (for
  non-transform strategies).

---

## Assumptions

- Users have a VS Code-family IDE (VS Code, Antigravity IDE, Cursor, Windsurf, or an
  installable fork) capable of running extensions from the Marketplace or Open VSX.
- The extension targets single-tenant, local-machine use; no server-side storage or
  cross-device sync is in scope for v1.
- The Catalog API is a read-only HTTPS endpoint maintained separately from the extension
  release cycle; it follows a versioned JSON schema.
- The GitHub Copilot Language Model API path is available only when the user already
  has an active Copilot subscription and has granted consent; no consent is implied
  by the extension.
- Workspace scanning for pre-fill and Apply now detection operates only on files within
  the open workspace folders; it does not traverse above the workspace root.
- The audit command uses the same estimation formulas and catalog version as the
  original baseline; it does not re-call an LLM to produce numbers.
- Mobile, web, or remote-only IDE deployments are out of scope for v1; the extension
  requires a local extension host.
- Automatic model price scraping, billing integration, and cloud account management
  are explicitly out of scope for v1 (as stated in non-goals).
- Apply now detection covers TypeScript/JavaScript and Python files in v1; support for
  additional languages (Go, Java, C#, Rust, etc.) is a post-v1 addition and requires
  no architectural changes to the detection pipeline.
