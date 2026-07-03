# Tasks: Dashboard driven by a natural-language comment (Phase 2)

Reads `proposal.md` + `design.md` + specs (`dashboard-plan-generation`, `widget-sql-execution`, `widget-rendering`). Strict TDD is active for pure units; route handlers and DuckDB/Recharts integration are covered by manual/integration verification, not forced unit tests. Work units are ordered by dependency; each maps to one commit (see work-unit-commits skill). `[P]` marks tasks that can run in parallel with the task(s) immediately above once their shared dependency lands.

## Quick path

1. Work Unit 1-2: dependencies + shared plan/execution types.
2. Work Unit 3: `lib/charts/` pure decision table (tests-first).
3. Work Unit 4: `lib/duckdb/executePlan.ts` pure retry/classification core (tests-first).
4. Work Unit 5: `app/api/plan/route.ts` (model call, structured output, re-ask, rate limit).
5. Work Unit 6: `lib/duckdb/executePlan.ts` IO shell (real DuckDB execution + correction).
6. Work Unit 7: components (`WidgetGrid`, `ChartCard`, `KpiCard`, `CommentInput`).
7. Work Unit 8: store wiring (`generatePlan`, `executePlan` orchestration).
8. Work Unit 9: page wiring + env docs.

## Work Unit 1 — Add `recharts` dependency

Satisfies: proposal "Dependency" row; design §3, §4.

- [x] **1.1** Add `recharts` to `package.json` dependencies (pin to latest stable major compatible with React 19). File: `/Users/pablogastaldi/Desktop/Analix/package.json`.
  Acceptance: `recharts` appears in `dependencies`; `npm install` resolves with no peer-dep errors against React 19.

_No parallelization — everything below depends on this being installed for typecheck/build to pass once chart components import it._

## Work Unit 2 — Anthropic SDK dependency + shared plan/execution types

Satisfies: dashboard-plan-generation spec (Schema-Conformant Plan Output, Server-Side Key Isolation); design §1, §2 (`WidgetResult` type).

- [x] **2.1** Add `@anthropic-ai/sdk` to `package.json` dependencies (needed for `messages.parse()` + `zodOutputFormat` helper). File: `/Users/pablogastaldi/Desktop/Analix/package.json`.
  Acceptance: `@anthropic-ai/sdk` appears in `dependencies`; `npm install` succeeds.
- [x] **2.2** Define `WidgetResult` discriminated union (`ok` / `empty` / `unavailable`) and `PlanError` type in a shared location. File: `/Users/pablogastaldi/Desktop/Analix/lib/schemas/plan.ts` (extend, do not create a parallel schema file — `Widget`/`DashboardPlan` already live here).
  Acceptance: `WidgetResult` and `PlanError` types export from `lib/schemas/plan.ts` (or re-export via `lib/schemas/index.ts`); `tsc --noEmit` passes.

_No parallelization — Work Units 3 and 4 both import `WidgetResult`._

## Work Unit 3 — `lib/charts/` decision table + encoding mapping (tests-first)

Satisfies: widget-rendering spec (ChartType-Driven Rendering, Degraded Rendering State); design §3.

Strict TDD: each sub-item is test-then-implementation, in order. Do not write the implementation file before its failing test exists and fails for the right reason.

- [x] **3.1** Write failing tests for `chartComponentFor(chartType)` — the chartType → Recharts component decision table (7 types: kpi, line, bar, donut, scatter, histogram, table). File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/chartComponentFor.test.ts`.
  Acceptance: `npm run test` shows new failing tests referencing a not-yet-implemented `chartComponentFor`.
- [x] **3.2** Implement `chartComponentFor(chartType)` to make 3.1 pass. File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/chartComponentFor.ts`.
  Acceptance: `npm run test` green for `chartComponentFor.test.ts`.
- [x] **3.3** Write failing tests for `mapEncoding(rows, encoding)` — resolves `x`/`y`/`series` against actual result columns, with fallback (first string col = x, first numeric col = y) when `encoding` is missing or names an absent column. File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/mapEncoding.test.ts`.
  Acceptance: tests cover explicit encoding, missing encoding, and encoding naming an absent column; all fail before implementation exists.
- [x] **3.4** Implement `mapEncoding`. File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/mapEncoding.ts`.
  Acceptance: `npm run test` green for `mapEncoding.test.ts`.
- [x] **3.5** Write failing tests for `formatValue(value, valueFormat)` — `number | currency | percent`, `tabular-nums`-safe string output, null/`NaN` → `"—"`. File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/formatValue.test.ts`.
  Acceptance: tests cover all three formats plus null/NaN/undefined inputs; fail before implementation exists.
- [x] **3.6** Implement `formatValue`. File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/formatValue.ts`.
  Acceptance: `npm run test` green for `formatValue.test.ts`.
- [x] **3.7** Write failing tests for `classifyChartData(rows, chartType, encoding)` — `renderable | empty`, covering zero-row, single-value (per-chartType per spec: line/bar/donut/scatter/histogram vs kpi), and null-heavy (all mapped values null) cases from the widget-rendering spec scenarios. File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/classifyChartData.test.ts`.
  Acceptance: tests cover all 4 scenarios from the "Degraded Rendering State" spec section; fail before implementation exists.
- [x] **3.8** Implement `classifyChartData`. File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/classifyChartData.ts`.
  Acceptance: `npm run test` green for `classifyChartData.test.ts`; all Work Unit 3 tests pass together.
- [x] **3.9** Re-export the four pure functions + the chartType→component table from the barrel. File: `/Users/pablogastaldi/Desktop/Analix/lib/charts/index.ts` (replace the current TODO stub).
  Acceptance: `import { chartComponentFor, mapEncoding, formatValue, classifyChartData } from "@/lib/charts"` resolves; `tsc --noEmit` passes.

_Work Unit 3 can run in parallel `[P]` with Work Unit 4 — both depend only on Work Unit 2's `WidgetResult` type, not on each other._

## Work Unit 4 — Executor retry/classification reducer (tests-first) `[P]`

Satisfies: widget-sql-execution spec (Bounded SQL Correction Loop, Widget Retry Budget Independence); design §2.

- [x] **4.1** Write failing tests for the pure retry/classification reducer — given a sequence of mocked `runQuery`/`correct` outcomes, assert the state machine transitions `attempt → success | retry | give-up`, caps at 2 retries (3 total attempts), and never exceeds that budget. File: `/Users/pablogastaldi/Desktop/Analix/lib/duckdb/executePlan.test.ts`.
  Acceptance: tests cover "success on first attempt", "success on retry 1", "success on retry 2 (final attempt)", "exhausted → unavailable", using mocked `runQuery`/`correct` — no real DuckDB instance. All fail before implementation exists.
- [x] **4.2** Write failing tests for the empty/degenerate classifier used post-execution (zero rows → `empty`, otherwise → `ok`) as specified in design §2 "On success → classify result". Same file as 4.1 or a sibling `executePlan.classify.test.ts` — prefer same file for cohesion.
  Acceptance: tests cover zero-row and non-empty-row cases; fail before implementation exists.
- [x] **4.3** Implement the pure reducer core (`attemptWidget`, or equivalent pure function taking injected `runQuery`/`correct`) plus the empty/ok classifier, satisfying 4.1 and 4.2. File: `/Users/pablogastaldi/Desktop/Analix/lib/duckdb/executePlan.ts` (pure core only — no `AsyncDuckDB` import yet in this unit).
  Acceptance: `npm run test` green for `executePlan.test.ts`.

_Work Unit 4 can run in parallel `[P]` with Work Unit 3. Work Unit 6 (IO shell) depends on this unit's pure core._

## Work Unit 5 — Plan route (`app/api/plan/route.ts`)

Satisfies: dashboard-plan-generation spec (all requirements); design §1.

Route handlers and the Anthropic call are IO-heavy and hard to unit-test without excessive mocking; per Strict TDD guidance, the fallback decision reducer and payload builder are extracted as pure, tested units first, then wired into the thin route handler which is covered by manual/integration verification.

- [x] **5.1** Write failing tests for `buildPlanPayload(profile, comment)` — asserts the constructed model payload contains only `tableName`, `rowCount`, and per-column `{ name, rawType, semanticType, summarized stats, sampleValues }` plus `comment`, and asserts no row-shaped field ever appears (golden-rule / security-critical test per design §7). File: `/Users/pablogastaldi/Desktop/Analix/lib/ai/buildPlanPayload.test.ts`.
  Acceptance: tests include a case where the input `profile` maliciously carries an extra `rows`/`data`-like field, asserting it is not forwarded; fail before implementation exists.
- [x] **5.2** Implement `buildPlanPayload`. File: `/Users/pablogastaldi/Desktop/Analix/lib/ai/buildPlanPayload.ts`.
  Acceptance: `npm run test` green for `buildPlanPayload.test.ts`.
- [x] **5.3** Write failing tests for the fallback decision reducer (`parse → safeParse → re-ask → error`) as a pure state function fed mocked model responses (per design §1 "Fallback" row and §7). File: `/Users/pablogastaldi/Desktop/Analix/lib/ai/planFallback.test.ts`.
  Acceptance: tests cover "first response valid", "first invalid, re-ask valid", "first invalid, re-ask invalid → structured error", capping at exactly 1 re-ask (max 2 model calls); fail before implementation exists.
- [x] **5.4** Implement the fallback reducer + `buildSystemPrompt(profile, comment)`. Files: `/Users/pablogastaldi/Desktop/Analix/lib/ai/planFallback.ts`, `/Users/pablogastaldi/Desktop/Analix/lib/ai/buildSystemPrompt.ts`.
  Acceptance: `npm run test` green for `planFallback.test.ts`.
- [x] **5.5** Implement a simple in-memory per-IP rate limiter (fixed-window or token-bucket, `Map<ip, { count, resetAt }>`) as a small standalone module, with the prod caveat comment from design §1 documented inline. File: `/Users/pablogastaldi/Desktop/Analix/lib/ai/rateLimiter.ts`.
  Acceptance: manual/integration check — hitting the limiter function >N times within the window returns a rejection; unit test optional but encouraged since this is a small pure counter (not required by Strict TDD scope list, author's discretion).
- [x] **5.6** Wire `lib/ai/index.ts` barrel to export `buildPlanPayload`, `buildSystemPrompt`, the fallback reducer, and `rateLimiter` (replace the current TODO stub). File: `/Users/pablogastaldi/Desktop/Analix/lib/ai/index.ts`.
  Acceptance: `tsc --noEmit` passes; imports resolve from `@/lib/ai`.
- [x] **5.7** Implement `app/api/plan/route.ts`: `POST` handler validating `{ profile, comment }` with `tableProfileSchema` + a comment guard, calling `new Anthropic().messages.parse({ model: "claude-haiku-4-5", max_tokens: 4096, ...zodOutputFormat(dashboardPlanSchema) })`, wiring in the fallback reducer, rate limiter, and returning `{ ok: true, plan }` / `{ ok: false, error: PlanError }` per design §1 response table (200 for structured plan errors, 400 malformed request, 429 rate-limited, 500 unexpected). File: `/Users/pablogastaldi/Desktop/Analix/app/api/plan/route.ts`.
  Acceptance: manual/integration verification — `curl -X POST /api/plan` with a valid `{profile, comment}` body against a running dev server returns a schema-valid plan; a request with an extra `rows` field returns a plan built without that field (verified by inspecting `buildPlanPayload` call, already unit-tested); a malformed body returns 400; exceeding the rate limit returns 429. No `thinking`/`effort` params passed to `messages.parse`.
  Note: implementation compiles/typechecks/lints clean; live curl verification against a running dev server is DEFERRED — `ANTHROPIC_API_KEY` was not confirmed present/valid in this environment and was not invented per delivery constraints.

_Work Unit 5 depends on Work Unit 2 (types) and can proceed in parallel `[P]` with Work Units 3/4/6 once 2 lands, but should land before Work Unit 8 (store wiring) needs a real endpoint to call._

## Work Unit 6 — Executor IO shell (real DuckDB integration)

Satisfies: widget-sql-execution spec (Per-Widget SQL Execution, Bounded SQL Correction Loop); design §2.

- [x] **6.1** Extend `lib/duckdb/executePlan.ts` with the IO shell: `executePlan(db: AsyncDuckDB, plan: DashboardPlan, correct)` iterating widgets independently, calling the existing `runQuery` from `lib/duckdb/query.ts`, and driving the pure reducer/classifier built in Work Unit 4. Widgets resolve independently (streamed, not one atomic batch) per design §2. File: `/Users/pablogastaldi/Desktop/Analix/lib/duckdb/executePlan.ts` (same file as 4.3, adding the IO layer around the already-tested pure core).
  Acceptance: manual/integration verification — with a real (or WASM-mocked) `AsyncDuckDB` instance, a plan with one valid-SQL widget and one invalid-SQL widget resolves the valid one to `ok` without waiting on the invalid one's retries; the invalid one ends `unavailable` after exhausting 2 retries with no unhandled throw.
  Note: `executePlan(db, plan, correct)` added as a thin `Promise.all` shell around the already-tested `attemptWidget` core, calling the real `runQuery`. Compiles/typechecks clean. Live/WASM-mocked DuckDB integration run is DEFERRED (no browser/WASM runtime in this environment) — logic is identical to the already-tested pure core, only the `db`/`runQuery` wiring is new and IO-only.
- [x] **6.2** Implement a `correct(sql, error, profileSchema)` default: deterministic fixer first (identifier quoting, obvious column-name typos vs. profile column names), falling back to a correction request against the plan route (`mode: "correct"` branch or `app/api/plan/correct`) sending only `{ sql, error, profile }`. Extend `app/api/plan/route.ts` (or add `app/api/plan/correct/route.ts` — pick one, per design §2 "decided here", and note the choice in the PR description) plus a deterministic-fixer helper. Files: `/Users/pablogastaldi/Desktop/Analix/lib/duckdb/correctSql.ts` (deterministic fixer, unit-testable) + route wiring in `app/api/plan/route.ts` or a new `app/api/plan/correct/route.ts`.
  Acceptance: deterministic fixer has its own focused unit test (small, pure — e.g. unquoted identifier gets quoted) in `/Users/pablogastaldi/Desktop/Analix/lib/duckdb/correctSql.test.ts`; the network fallback path is manually/integration verified since it depends on the live model.
  Note: chose the `mode: "correct"` branch on the EXISTING `app/api/plan/route.ts` (per the pre-resolved design decision passed into this apply run) — no new route file. Deterministic fixer (`deterministicFix`) handles unquoted table identifiers and column-name typos (Levenshtein distance ≤2 against profile columns) with 6 focused unit tests, test-first RED→GREEN. Network fallback uses `client.messages.create` (plain-text completion, not `messages.parse`/structured output, since the response is a raw corrected-SQL string) with no `thinking`/`effort` params. Live network verification is DEFERRED — `ANTHROPIC_API_KEY` not confirmed present/valid in this environment, per delivery constraints.
- [x] **6.3** Wire `lib/duckdb/index.ts` barrel to export `executePlan` and `correctSql` (check current stub and extend, do not duplicate exports already there for `client`/`query`/`loadTable`). File: `/Users/pablogastaldi/Desktop/Analix/lib/duckdb/index.ts`.
  Acceptance: `tsc --noEmit` passes; `import { executePlan } from "@/lib/duckdb"` resolves.
  Note: barrel extended with `executePlan`, `attemptWidget`, `classifyRows`, `CorrectFn`, `RunQueryFn` (from `executePlan.ts`) and `correct`, `deterministicFix`, `CorrectionProfile` (from `correctSql.ts`); existing `client`/`query`/`loadTable` exports untouched. `tsc --noEmit` passes.

_Depends on Work Unit 4 (pure core) and Work Unit 5 (correction endpoint, if the endpoint-fallback path is chosen). Sequential after both._

## Work Unit 7 — Components (`components/dashboard/`)

Satisfies: widget-rendering spec (all requirements); design §4.

- [x] **7.1** Implement `KpiCard` — single value + label, `tabular-nums`, `formatValue` for display, `"—"` for null, delta color from `--positive`/`--negative` when applicable. File: `/Users/pablogastaldi/Desktop/Analix/components/dashboard/KpiCard.tsx`.
  Acceptance: manual render check — a `kpi` `WidgetResult` with a null value renders `"—"`, not blank or `NaN`; uses `font-mono`/`tabular-nums` classes present in `app/globals.css`.
  Note: `delta` is an optional prop (no `delta` field exists on `Widget`/`WidgetEncoding` in the schema yet); when provided its sign drives `--positive`/`--negative`. `tsc`/lint clean; no live browser render captured in this environment (see Work Unit 9 for end-to-end verification).
- [x] **7.2** Implement `ChartCard` — card shell (title + chart body) that picks the Recharts component via `chartComponentFor`, uses `classifyChartData` to decide renderable vs. empty state, wraps charts in `ResponsiveContainer`, respects `prefers-reduced-motion` (disable chart animation), and renders a quiet "unavailable" state for `status: "unavailable"` widgets (not an error banner). File: `/Users/pablogastaldi/Desktop/Analix/components/dashboard/ChartCard.tsx`.
  Acceptance: manual render check covering all four widget-rendering spec scenarios — zero-row, single-value (chart type), null-heavy, and `unavailable` — each renders its defined degraded state, not a crash or blank tile. Uses `--card`, `shadow-card`, `radius-card` tokens.
  Note: also handles the store-only `"pending"` status (added to `WidgetResult` for Work Unit 8) with a quiet "Calculando…" tile. `prefers-reduced-motion` read via `matchMedia` with a lazy `useState` initializer (avoids a synchronous `setState`-in-effect lint error) plus a change listener. Live/browser verification deferred to Work Unit 9.
- [x] **7.3** Implement `WidgetGrid` — maps `widgetResults: WidgetResult[]` to `ChartCard`/`KpiCard` per widget, responsive grid (kpi spans smaller, charts wider), and isolates any single widget's render throw to that widget's own tile (Grid-Level Fault Isolation requirement) — e.g. a small per-tile error boundary. File: `/Users/pablogastaldi/Desktop/Analix/components/dashboard/WidgetGrid.tsx`.
  Acceptance: manual render check — a `widgetResults` array where one entry has a malformed `encoding` that would throw during render still renders all other widgets normally, with only that one tile degraded.
  Note: `WidgetTileBoundary` is a small class-based error boundary (React requires a class for `getDerivedStateFromError`) wrapping each `ChartCard`; `kpi` widgets get `col-span-1`, everything else spans wider. Live/browser verification deferred to Work Unit 9.
- [x] **7.4** Implement `CommentInput` — textarea + generate button, calls `store.generatePlan()`, disabled while `planStatus === "planning"`, active-voice copy, visible focus ring, `radius-inner`. File: `/Users/pablogastaldi/Desktop/Analix/components/dashboard/CommentInput.tsx`.
  Acceptance: manual render check — button is disabled and shows a pending state while `planStatus === "planning"`; keyboard-focus ring visible.
  Note: button also disables/labels during `planStatus === "executing"` ("Calculando…") in addition to `"planning"` ("Generando…"), since both are pending states from the user's point of view. Spanish active-voice copy per project convention (`DataPreview.tsx`). Live/browser verification deferred to Work Unit 9.

_Depends on Work Unit 3 (`lib/charts`) for 7.1-7.3, and on Work Unit 8's store shape existing (or a typed stub) for 7.4's `store.generatePlan()` call — sequence 7.1-7.3 before 7.4, or stub the store call signature ahead of Work Unit 8 landing. `[P]` 7.1 and the start of 7.2 can be built concurrently since `KpiCard` and `ChartCard` are independent files, but 7.3 depends on both._

## Work Unit 8 — Store wiring (extend `lib/store.ts`)

Satisfies: design §5 (state), dashboard-plan-generation + widget-sql-execution specs (orchestration/budgets).

Strict TDD note: the pure reducers (`applyPlan`, `applyWidgetResult`, `deriveStatus`) are the testable unit here; the store itself (Zustand + fetch + DuckDB IO) is the thin orchestration shell.

- [x] **8.1** Write failing tests for the pure store reducers `applyPlan(state, plan)`, `applyWidgetResult(state, result)`, `deriveStatus(widgetResults)` — state transitions with no React/DuckDB/network involved. File: `/Users/pablogastaldi/Desktop/Analix/lib/store.reducers.test.ts`.
  Acceptance: tests cover plan received → `planStatus: "executing"` with pending placeholders; each widget result applied incrementally; all settled → `planStatus: "ready"`. Fail before implementation exists.
  TDD: RED confirmed (`Cannot find module './store.reducers'`) before implementation.
- [x] **8.2** Implement `applyPlan`, `applyWidgetResult`, `deriveStatus` as pure functions. File: `/Users/pablogastaldi/Desktop/Analix/lib/store.reducers.ts`.
  Acceptance: `npm run test` green for `store.reducers.test.ts`.
  TDD: GREEN — 8/8 tests pass. Added a store-only `"pending"` variant to the `WidgetResult` discriminated union (`lib/schemas/plan.ts`) so `applyPlan` can seed per-widget placeholders immediately after a plan is received, before `executePlan` resolves any of them (`executePlan` itself never produces `"pending"` — only `ok`/`empty`/`unavailable`). Also added `PlanStatus` type to `lib/schemas/plan.ts`.
- [x] **8.3** Extend `useDataStore` in `lib/store.ts` with the `PlanSlice` fields (`comment`, `plan`, `widgetResults`, `planStatus`, `planError`, `setComment`, `generatePlan`, and extend the existing `reset()` to also clear plan state) per design §5, wiring `generatePlan()` to POST `/api/plan`, then call `executePlan` from Work Unit 6, applying results via the Work Unit 8.2 reducers as each widget settles. File: `/Users/pablogastaldi/Desktop/Analix/lib/store.ts`.
  Acceptance: manual/integration verification — with a mocked `fetch` and mocked `executePlan`, calling `generatePlan()` transitions `planStatus` through `planning → executing → ready` and `widgetResults` fills incrementally, not atomically; a `{ok:false}` plan response sets `planStatus: "error"` with `planError` populated.
  Note: `correct` from `lib/duckdb/correctSql.ts` already returns `Promise<string>` (throws on failure, never returns `null`) — its signature `(sql, error, profile) => Promise<string>` already matches `CorrectFn` exactly once `profile` is closed over via `toCorrectionProfile(profile)`. No null-coalescing wrapper was needed (the anticipated `?? sql` fallback from the apply brief doesn't apply to the as-built WU6 code). `generatePlan()` calls `executePlan` once per widget (single-widget plan) inside `Promise.all` so each `WidgetResult` is applied via `applyWidgetResult` as soon as it settles, rather than waiting for the full plan to resolve atomically. Live/mocked-fetch integration run deferred — `tsc --noEmit` and full `npm run test` (79/79) are green; end-to-end browser verification is Work Unit 9.

_Depends on Work Unit 2 (types), Work Unit 5 (route to POST to), and Work Unit 6 (`executePlan`). Sequential after all three._

## Work Unit 9 — Page wiring + env documentation

Satisfies: proposal "User-facing outcome"; design Quick path steps 1-5.

- [x] **9.1** Wire `CommentInput` + `WidgetGrid` into the dashboard view shown after ingest, alongside the existing `DataPreview` flow, so the end-to-end path (comment → plan → execute → render) is reachable from `app/page.tsx`. File: `/Users/pablogastaldi/Desktop/Analix/app/page.tsx`.
  Done: `app/page.tsx` now renders, when `status === "ready"`, a `CommentInput` (with inline plan-error alert) + `WidgetGrid` (when `widgetResults` exist) above the existing `DataPreview`.
- [x] **9.2** Document `ANTHROPIC_API_KEY` setup without committing secrets. Note: writing a `.env*` template file is blocked by the environment's permission settings, so the setup is documented in `README.md` (Variables de entorno section) instead — server-only, never `NEXT_PUBLIC_`. `.gitignore` line 34 `.env*` confirmed to exclude `.env.local`; no secret value in any tracked file.
  Done: `README.md` documents the key; `.gitignore` excludes `.env.local`.

_Sequential, last — depends on Work Units 5 through 8 all landing._

## Cross-cutting acceptance gates (verify at the end of apply, not a separate task)

- [ ] Golden rule: no data rows ever leave the browser — verified by `buildPlanPayload` tests (5.1) plus a manual network-tab inspection of the `/api/plan` request body during 9.1's click-through.
- [ ] Two retry budgets stay independent: plan re-ask ≤1 (5.3 tests) and per-widget SQL correction ≤2 (4.1 tests) are never merged into a shared counter.
- [ ] `ANTHROPIC_API_KEY` never appears in the client bundle — spot-check with a production build (`npm run build`) and grep the `.next/static` output for the key name/value pattern.

## Review Workload Forecast

| Metric | Estimate |
|--------|----------|
| Changed files | ~24 (2 dependency bumps, 1 schema extension, 9 new `lib/charts` files, 4 `lib/duckdb`/`lib/ai` new files + 1 extended, 1 route file, 4 new components, 1 extended store + 1 new reducers file, 1 extended page, 1 new env template) |
| Estimated changed lines | ~950-1150 (route + Anthropic wiring ~150-200; executor pure+IO ~180-220 incl. tests; charts pure units ~220-280 incl. tests; components ~250-320; store + reducers ~120-160; wiring + env ~30-50) |
| Chained PRs recommended | Yes |
| 400-line budget risk | High |
| Decision needed before apply | Yes |

**Rationale.** This phase spans three independently reviewable capabilities (plan generation, SQL execution, rendering) plus store/page wiring — well above a single 400-line PR even accounting for test code. The work units above are already sequenced as chainable slices: Work Units 1-2 (setup), 3+4 (pure libs, parallelizable), 5 (route), 6 (executor IO), 7 (components), 8 (store), 9 (wiring) map cleanly onto 5-7 chained PRs along capability boundaries (plan generation | SQL execution | rendering | wiring), consistent with `delivery_strategy: ask-on-risk` — the orchestrator should confirm chained-PR slicing (and `chain_strategy`) with the user before `sdd-apply` begins, per the Review Workload Guard.

## Next step

Proceed to `sdd-apply`, honoring the delivery-strategy decision above before starting Work Unit 1.
