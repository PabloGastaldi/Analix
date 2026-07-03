# Tasks — Multi-file with confirmed joins

Ordered, dependency-grouped work units for Phase 6. **Slice 1 ships and is verified before any Slice 2 task starts** — this is a hard boundary, not a suggestion (see design "Slice boundary (shippable)"). Strict TDD is active: for every pure unit, the failing-test task precedes the implementation task. Route handlers, DuckDB execution, and React UI are IO/integration — verified manually, not forced into unit tests.

Each work unit maps to one commit (work-unit-commits skill): one clear purpose, tests/docs included, reviewable and revertible in isolation.

---

## Slice 1 — Multi-table base (degradation-safe, no joins)

Ships a fully usable multi-file experience with zero join code. Must be shippable and pass Phase 0–5 regression before Slice 2 begins.

### WU1.1 — `uniqueTableName` (test first, then implement)

Pure sanitizer/deduper for DuckDB table identifiers derived from file names. No dependencies — first task.

- [x] **Task 1.1.1 (test):** `lib/duckdb/tableName.test.ts` — cases: unsafe characters (`"Sales Report (final).csv"` → valid identifier), leading digit/underscore gets a `t_` prefix, repeated separators collapse, length cap, deterministic given the same `(fileName, existingNames)`, and collision suffixing (`_2`, `_3`, …) against a provided `existingNames` list.
  - **Acceptance:** `npm run test -- tableName` fails (function does not exist yet).
- [x] **Task 1.1.2 (impl):** `lib/duckdb/tableName.ts` — implement `uniqueTableName(fileName: string, existingNames: string[]): string` per design §1 rules (lowercase, `[a-z0-9_]` only, collision suffixing).
  - **Acceptance:** `npm run test -- tableName` passes.

### WU1.2 — Table-registry store reducers (test first, then implement)

Pure reducers extracted the same way `applyPlan`/`applyWidgetResult` already are in `lib/store.reducers.ts`. Depends on WU1.1 only for the `DataTable`/`uniqueTableName` shape reference (no runtime dependency between the two).

- [x] **Task 1.2.1 (test):** `lib/store.reducers.test.ts` (extend, same file as existing `applyPlan`/`applyWidgetResult` tests) — add cases for `addTable` (appends without disturbing existing entries; sets `activeTableName` only when previously null), `setActiveTable` (switches `activeTableName`; clears `plan`, `widgetResults`, `summary`, `chatMessages`, `comment`; preserves `tables`), `updateActiveColumnType` (mutates only the active table's column; other tables' profiles untouched), `removeTable` (drops the entry; re-activates the first remaining table or sets `null` if none remain; also drops any `kind: "join"` entry whose `tableName` depended on the removed table).
  - **Acceptance:** `npm run test -- store.reducers` fails on the four new reducers (not yet exported).
- [x] **Task 1.2.2 (impl):** `lib/store.reducers.ts` — add `DataTable` type (`tableName`, `fileName`, `profile`, `previewRows`, `kind: "file" | "join"`, optional `dependsOn?: string[]` for join-view cleanup) and implement `addTable`, `setActiveTable`, `updateActiveColumnType`, `removeTable` per design §1.
  - **Acceptance:** `npm run test -- store.reducers` passes; existing `applyPlan`/`applyWidgetResult` tests unaffected.

### WU1.3 — Store refactor: single table → `tables[]` + `activeTableName`

Wires WU1.1 + WU1.2 into `lib/store.ts`. This is the highest-regression-risk task in Slice 1 — it touches every consumer of `profile`/`tableName`/`fileName`.

- [x] **Task 1.3.1 (impl):** `lib/store.ts` — replace `fileName`/`tableName`/`profile`/`previewRows` top-level fields with `tables: DataTable[]`, `activeTableName: string | null`, and an `activeTable()` derived getter. Update `ingestFile` to call `uniqueTableName(file.name, tables.map(t => t.tableName))`, append via `addTable` instead of `set({ tableName, profile, previewRows })`, and set active only if none was set. Update `updateColumnType` to call `updateActiveColumnType`. Add `setActiveTable(tableName)` action wired to the new reducer. Update `reset()` to clear `tables`/`activeTableName`. Add `removeTable(tableName)` action that also runs `DROP TABLE/VIEW IF EXISTS` against DuckDB before calling the reducer.
  - **Acceptance:** every existing call site (`generatePlan`, `generateSummary`, `sendChatMessage`, `toCorrectionProfile`) reads `get().activeTable()?.profile` instead of `get().profile`; `npm run build` (or `tsc --noEmit`) has zero type errors.
- [x] **Task 1.3.2 (manual verify, IO):** Run the app locally, ingest `sample-ventas.csv`, confirm plan/summary/chat behave identically to pre-refactor (Phase 0–5 regression). Ingest a second file, confirm the first table's plan/summary/chat state is untouched.
  - **Acceptance:** manual pass against `multi-table-workspace` spec scenarios "Second file does not lose the first" and "One file only." — **owed to the orchestrator** (browser regression, not run by this apply pass).

### WU1.4 — `TableSwitcher` UI + multi-file ingest wiring

Depends on WU1.3 (needs `tables[]` on the store).

- [x] **Task 1.4.1 (impl):** `components/data/TableSwitcher.tsx` — compact list of `tables` (file name, row count, column count), active entry highlighted with `--brand`; click calls `setActiveTable`; per-entry inspect affordance (reuses existing `DataPreview`/profile display) and a remove control calling `removeTable`. Independent per-table loading/error state (one failed ingest never blocks others).
  - **Acceptance:** matches `multi-table-workspace` spec scenarios "Table inspection" and "Switching tables changes the flow's target."
- [x] **Task 1.4.2 (impl):** wire multi-file upload — extend the dropzone/upload flow (`components/landing/Dropzone.tsx` or the dashboard ingest entry point) to call `ingestFile` per selected file instead of assuming one file, and mount `TableSwitcher` wherever the dashboard shell renders (design component map, Slice 1).
  - **Acceptance:** uploading 2+ files at once produces N entries in `TableSwitcher`, all independently selectable; matches spec scenario "Colliding table names are deduped."

**Slice 1 checkpoint (must pass before Slice 2 starts):** `npm run test` green; manual regression against all `multi-table-workspace` spec scenarios; `git diff --stat` reviewed as one coherent, shippable unit. — automated portion (tests/tsc/lint/build) is green; **manual browser regression is owed to the orchestrator** before Slice 2 starts.

---

## Slice 2 — Confirmed joins (additive on top of Slice 1)

Do not start until the Slice 1 checkpoint above is met.

### WU2.1 — `rankCandidates` (test first, then implement)

Pure ranking/threshold logic — no DuckDB, no I/O. No dependency on any other Slice 2 task; can start immediately after the Slice 1 checkpoint.

- [x] **Task 2.1.1 (test):** `lib/joins/rankCandidates.test.ts` — cases: applies `MIN_OVERLAP = 0.5` (drops sub-threshold pairs), derives `coverageLeftToRight`/`coverageRightToLeft`/`overlap` correctly from `{distinctLeft, distinctRight, shared}`, derives `cardinality` (`one-to-one` when both coverages ≈ 1.0, else `one-to-many`/`many-to-one` toward the lower-coverage side), flags nothing as `estimated` here (that flag is set by the caller in `detectKeys`), sorts by `overlap` desc then `distinct` desc.
  - **Acceptance:** `npm run test -- rankCandidates` fails (module does not exist).
- [x] **Task 2.1.2 (impl):** `lib/joins/rankCandidates.ts` — implement `rankCandidates(rawStats): CandidateKey[]` per design §2 (the `CandidateKey` interface as specified).
  - **Acceptance:** `npm run test -- rankCandidates` passes; matches `join-key-detection` spec scenarios "High overlap qualifies as a candidate" and "Low or zero overlap yields no candidate" at the unit level.

### WU2.2 — `detectKeys` (name/type gate + DuckDB overlap)

Depends on WU2.1 (`rankCandidates` is the pure core it calls). DuckDB-facing — manual/integration verification, not forced unit tests.

- [x] **Task 2.2.1 (impl):** `lib/joins/detectKeys.ts` — Stage A: pure name+type compatibility gate (normalized name matching, `semanticType` restricted to `id`/`categorical_low`/`categorical_high`, `rawType` must match on both sides). Stage B: for each Stage-A candidate pair, run the DuckDB overlap query from design §2 (`distinctA`, `distinctB`, `shared` via `INTERSECT`), applying `SAMPLE_ROW_THRESHOLD = 100_000` / `SAMPLE_SIZE = 50_000` via `USING SAMPLE` and setting `estimated: true` when sampled. Feed raw stats into `rankCandidates` for the final ranked/thresholded output. Runs after ingest settles, never on the ingest critical path (design §"Data flow" step 4).
  - **Acceptance:** matches `join-key-detection` spec scenarios "Compatible id-shaped columns are paired," "Free-text columns are excluded," "Small tables use exact overlap," "Large tables use sampled overlap," "Unrelated tables produce zero candidates."
- [x] **Task 2.2.2 (manual verify, IO):** run `detectKeys` against `orders`-shaped + `customers`-shaped sample tables (reuse/extend `sample-ventas.csv` or add a second fixture file), confirm candidate output matches expected overlap/cardinality by hand-checking the source data.
  - **Acceptance:** manual pass; no row data appears anywhere in the returned candidate objects (spec: "Candidate metadata contains no row data").

### WU2.3 — `joinPlanSchema` + `buildJoinsPayload` (test first for the payload builder)

Depends on nothing but `lib/schemas/plan.ts`/`lib/schemas/profile.ts` (existing) for shape parity. Can run in parallel with WU2.1/WU2.2.

- [x] **Task 2.3.1 (impl, schema — no test forced):** `lib/schemas/joins.ts` — `joinTypeSchema` (`inner`/`left`), `joinRelationshipSchema`, `joinPlanSchema` (`relationships` array, `max(1)`, empty array valid) per design §3. Export `JoinPlan`/`JoinRelationship` types.
  - **Acceptance:** `tsc --noEmit` passes; schema shape matches design §3 exactly (Zod schemas are declarative — no dedicated unit test required, consistent with `dashboardPlanSchema`'s existing pattern).
- [x] **Task 2.3.2 (test):** `lib/ai/buildJoinsPayload.test.ts` — cases: never leaks a row/data field even if the input `TableProfile` accidentally carries one, drops any undocumented input field (only reads `tableName`/`rowCount`/`columns` projection + candidate `overlap`/`cardinality`/`estimated`), carries `comment` through (including empty string).
  - **Acceptance:** `npm run test -- buildJoinsPayload` fails (module does not exist).
- [x] **Task 2.3.3 (impl):** `lib/ai/buildJoinsPayload.ts` — implement `buildJoinsPayload(profiles, candidateKeys, comment): JoinsPayload` per design §4, reusing the exact `Pick<ColumnProfile, "name" | "rawType" | "semanticType" | "stats">` projection pattern from `lib/ai/buildPlanPayload.ts`.
  - **Acceptance:** `npm run test -- buildJoinsPayload` passes; matches `join-inference` spec scenario "Valid metadata-only request."

### WU2.4 — `resolveJoins` fallback (test first, then implement)

Depends on WU2.3 (needs `joinPlanSchema` + candidate shape to validate against). Mirrors `lib/ai/planFallback.ts`'s existing pattern.

- [x] **Task 2.4.1 (test):** `lib/ai/joinsFallback.test.ts` — cases (mock `askModel`, same harness pattern as `lib/ai/planFallback.test.ts`): valid proposal on first attempt passes through; invalid Zod shape triggers exactly one re-ask, then degrades if still invalid; a proposal referencing a `(table, column)` pair not present in the supplied candidate set is rejected as if invalid (re-ask once, then degrade) — this is the "model may only choose among candidates" gate; empty `relationships: []` is a valid degrade (no re-ask); `confidence < 0.5` degrades without re-ask.
  - **Acceptance:** `npm run test -- joinsFallback` fails (module does not exist).
- [x] **Task 2.4.2 (impl):** `lib/ai/joinsFallback.ts` — implement `resolveJoins(askModel, candidateKeys)` per design §3–4 (re-ask-once + candidate-gate + confidence floor + degrade), mirroring `resolvePlan`'s control flow.
  - **Acceptance:** `npm run test -- joinsFallback` passes; matches `join-inference` spec scenarios "Model invents a non-candidate column," "Validation fails twice," "Low-confidence proposal degrades."

### WU2.5 — `app/api/joins/route.ts` + system prompt

Depends on WU2.3 + WU2.4 (payload builder + fallback resolver must exist). Route handler — manual/integration verification, not a forced unit test, consistent with `app/api/plan/route.ts` having no dedicated route test today.

- [x] **Task 2.5.1 (impl):** `lib/ai/buildJoinsSystemPrompt.ts` — system prompt listing the exact candidate `(leftTable.leftColumn ↔ rightTable.rightColumn)` pairs and instructing the model to choose only among them or return `relationships: []`, mirroring `lib/ai/buildSystemPrompt.ts`'s structure.
  - **Acceptance:** prompt includes every candidate pair from the payload and the "or return empty" instruction (manual read-through).
- [x] **Task 2.5.2 (impl):** `app/api/joins/route.ts` — structural copy of `app/api/plan/route.ts`: `MODEL = "claude-sonnet-5"`, `THINKING = { type: "disabled" }`, own `joinsRateLimiter` instance (new `createRateLimiter(...)` call in `lib/ai/rateLimiter.ts` usage, same pattern as `planRateLimiter`), `messages.parse` + `zodOutputFormat(joinPlanSchema)`, request body validated against `{ profiles: tableProfileSchema[], candidates: ..., comment?: string }`, structured errors at HTTP 200 for degradation, 429 for rate limit.
  - **Acceptance:** matches `join-inference` spec scenarios "Valid proposal on first attempt," "Requests exceeding budget are rejected"; manual `curl`/Postman smoke test against a local dev server with a mocked candidate payload. — **owed to the orchestrator** (manual smoke test not run by this apply pass).

### WU2.6 — `buildJoinSelectList` + `buildJoinView` (test first for the pure helper)

Depends on nothing from WU2.1–2.5 at the type level, but is only meaningful once a confirmed join exists — sequence after WU2.5 so the confirm step (WU2.7) has both the view builder and the route ready.

- [x] **Task 2.6.1 (test):** `lib/joins/buildJoinView.test.ts` — cases for the pure `buildJoinSelectList(leftColumns, rightColumns, keys)`: no-collision case keeps both sides' column names as-is; a right column name colliding with a left column name is aliased `"<rightTable>_<name>"`; the right-side join key column is dropped from the select list by default; deterministic output ordering (left columns first, then right).
  - **Acceptance:** `npm run test -- buildJoinView` fails (module does not exist).
- [x] **Task 2.6.2 (impl):** `lib/joins/buildJoinView.ts` — implement `buildJoinSelectList` per design §5, then `buildJoinView(db, { leftTable, leftColumn, rightTable, rightColumn, joinType })` that runs `uniqueTableName("join_<left>_<right>", existingNames)`, executes `CREATE VIEW "<name>" AS SELECT <list> FROM "<left>" AS l <INNER|LEFT> JOIN "<right>" AS r ON l."<key>" = r."<key>"`, then calls `profileTable(db, viewName)` and returns a `DataTable` with `kind: "join"` and `dependsOn: [leftTable, rightTable]`.
  - **Acceptance:** `npm run test -- buildJoinView` passes for the pure helper; matches `joined-view-integration` spec scenarios "View created on confirmation" and "Joined view usable like any table" via manual verification (Task 2.6.3).
- [x] **Task 2.6.3 (manual verify, IO):** in the running app, confirm a join between two sample tables, verify the resulting view's `TableProfile` drives plan/summary/chat with no special-casing, and verify `CREATE VIEW` failure (e.g. a bad key column injected manually) surfaces a clear error without crashing the dashboard.
  - **Acceptance:** matches `joined-view-integration` spec scenarios "Golden rule holds over joined data" and "View creation fails."

### WU2.7 — `JoinPanel` UI + wiring + fan-out warning

Depends on WU2.2 (candidates), WU2.5 (route), WU2.6 (view builder) — the integration point that ties Slice 2 together.

- [x] **Task 2.7.1 (impl):** `components/data/JoinPanel.tsx` — renders only when `detectKeys` found ≥1 candidate; shows the inferred join in plain language (Spanish copy) with overlap evidence and an "approximate" note when `estimated`; controls for confirm / correct (swap key columns among candidates, toggle inner/left) / reject; never auto-applies.
  - **Acceptance:** matches `join-inference` spec scenarios "User confirms the inferred join," "User corrects the proposal," "User rejects the proposal."
- [x] **Task 2.7.2 (impl):** wire `JoinPanel` into `lib/store.ts` (new actions: `detectAndProposeJoin()` calling `detectKeys` + `POST /api/joins` + `resolveJoins`; `confirmJoin(relationship)` calling `buildJoinView` then `addTable` with `kind: "join"`) and into the dashboard shell alongside `TableSwitcher`.
  - **Acceptance:** end-to-end manual flow: upload `orders.csv` + `customers.csv` → panel appears → confirm → joined table appears in `TableSwitcher` → comment "revenue by customer region" produces a correct dashboard. — **owed to the orchestrator** (browser flow not run by this apply pass).
- [x] **Task 2.7.3 (impl):** fan-out warning — surface `fanOutWarning?: string` on the `DataTable` when `cardinality` is `one-to-many`/`many-to-one`, rendered in `JoinPanel` and wherever the joined table is selected/active.
  - **Acceptance:** matches `joined-view-integration` spec scenarios "Fan-out join warns the user" and "One-to-one join has no fan-out warning."
- [x] **Task 2.7.4 (manual verify, IO):** full regression — Slice 1 flows still work with Slice 2 code present; zero candidates → no panel shown, per-table experience continues uninterrupted (spec: "No candidates found," "Unrelated tables produce zero candidates").
  - **Acceptance:** manual pass against all four `openspec/changes/multi-file-joins/specs/*` documents.

**Slice 2 checkpoint:** `npm run test` green (all pure units above); manual pass against all scenarios in `join-key-detection`, `join-inference`, and `joined-view-integration` specs; `git diff --stat` reviewed per work unit before any PR is opened.

---

## Review Workload Forecast

| Work unit | Files touched | Est. changed lines |
|---|---|---|
| WU1.1 `uniqueTableName` | 2 (new) | ~90 |
| WU1.2 store reducers | 1 (extend) | ~130 |
| WU1.3 store refactor | 1 (rewrite core) | ~180 |
| WU1.4 `TableSwitcher` + wiring | 2–3 | ~200 |
| **Slice 1 subtotal** | | **~600** |
| WU2.1 `rankCandidates` | 2 (new) | ~140 |
| WU2.2 `detectKeys` | 1 (new) + fixture | ~160 |
| WU2.3 schema + payload builder | 3 (new) | ~180 |
| WU2.4 `resolveJoins` | 2 (new) | ~140 |
| WU2.5 route + prompt | 2 (new) | ~180 |
| WU2.6 `buildJoinView` | 2 (new) | ~160 |
| WU2.7 `JoinPanel` + wiring | 2–3 | ~220 |
| **Slice 2 subtotal** | | **~1180** |
| **Total (both slices)** | | **~1780** |

- **400-line budget risk: High.** Both slices individually and combined exceed the 400-changed-line PR budget by a wide margin.
- **Chained PRs recommended: Yes.** Natural chain points already exist at each work unit boundary (WU1.1 → WU1.2 → WU1.3 → WU1.4, then WU2.1/WU2.2 in parallel → WU2.3 → WU2.4 → WU2.5 → WU2.6 → WU2.7). Recommended grouping: one PR per WU inside Slice 1 (4 PRs, ~90–200 lines each), one PR per WU inside Slice 2 (7 PRs, ~140–220 lines each) — every one lands comfortably under budget individually. The Slice 1 checkpoint is a natural chain-tracker boundary (e.g. a tracker branch per the `feature-branch-chain` strategy) before Slice 2 work starts.
- **Decision needed before apply: Yes.** `delivery_strategy = ask-on-risk` — `sdd-apply` must stop and confirm the chain strategy (stacked-to-main vs feature-branch-chain) before implementation begins, given the High budget risk on both slices.

---

## Status legend

- [ ] Not started
- [x] Done (mark during `sdd-apply`)
