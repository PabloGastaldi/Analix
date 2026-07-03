# Design: Comment-driven dashboard (Phase 2)

How Phase 2 turns a validated `TableProfile` plus one natural-language comment into 4–8 rendered widgets whose numbers come from DuckDB-WASM, never from the model. This design fits the existing Phase 1 code: `lib/schemas/{plan,profile}.ts` (contracts), `lib/duckdb/` (client engine), `lib/store.ts` (Zustand), and the chart tokens in `app/globals.css`. Scope is Phase 2 only.

## Quick path (the end-to-end flow)

1. User types a comment in `CommentInput` → store action `generatePlan()`.
2. Store POSTs `{ profile, comment }` to `app/api/plan/route.ts` (metadata only — the golden rule is enforced at this payload construction step).
3. Route calls `claude-haiku-4-5` via `messages.parse()` + `zodOutputFormat(dashboardPlanSchema)`; on failure, one bounded re-ask; returns a validated `DashboardPlan` or a structured error.
4. Store receives the plan, then runs `executePlan()` (client): each widget's SQL runs in DuckDB-WASM, with a per-widget correction loop (≤2 retries), producing `WidgetResult[]`.
5. `WidgetGrid` renders each result through a `chartType → component` decision table; degenerate/failed widgets render an explicit empty/unavailable state — never a crash.

```
CommentInput ──▶ store.generatePlan()
                     │  POST { profile, comment }   (no rows leave the browser)
                     ▼
             app/api/plan/route.ts ──▶ claude-haiku-4-5
                     │  messages.parse() + zodOutputFormat        (re-ask ≤1)
                     ▼
             DashboardPlan (validated)
                     │
                     ▼
             store.executePlan()  ──▶ lib/duckdb/executePlan.ts
                     │  per widget: runQuery → correction loop ≤2 → WidgetResult
                     ▼
             WidgetGrid ──▶ lib/charts (chartType → Recharts) / KpiCard / empty state
```

## Architecture approach

Layered handoff across the server/client boundary. Server owns the model call and validation only (planning). Client owns the engine, execution, correction, and rendering. Two independent bounded retry budgets — never merged:

| Budget | Where | Limit | On exhaustion |
|--------|-------|-------|---------------|
| Plan re-ask | server route | 1 re-ask | structured `PlanError` returned to client |
| Per-widget SQL correction | client executor | 2 retries per widget | that widget marked `unavailable` |

The design keeps pure, deterministic units (chart decision table, encoding mapping, plan/result reducers) separate from IO (route handler, DuckDB, Recharts) so they are unit-testable first (Strict TDD, Vitest).

## Details

### 1. Plan route — `app/api/plan/route.ts`

| Concern | Decision |
|---------|----------|
| Runtime | Node route handler (`export async function POST`). Server-side only. Never `NEXT_PUBLIC_`. |
| Client | `new Anthropic()` — reads `ANTHROPIC_API_KEY` from env inside the handler. Instantiated per request (or module-scope singleton); no key ever crosses to the browser. |
| Request | `{ profile: TableProfile, comment: string }`. Validate with `tableProfileSchema` + a `comment` string guard. **Reject/ignore anything resembling data rows** — the handler only reads `profile` fields. |
| Model call | `client.messages.parse({ model: "claude-haiku-4-5", max_tokens: 4096, messages, ...zodOutputFormat(dashboardPlanSchema) })`. No `thinking`/`effort` (Haiku 4.5 rejects them). Non-streaming. |
| Structured output | `zodOutputFormat(dashboardPlanSchema)` from `@anthropic-ai/sdk/helpers/zod`. Note: JSON Schema from structured outputs drops `min/minItems/etc.` and needs `additionalProperties:false`; the SDK strips unsupported keywords and re-validates client-side, so our `.min(1)` on `widgets` is fine (stripped from the wire schema, enforced on parse). |
| Fallback | If `.parse()` throws or returns a refusal, `dashboardPlanSchema.safeParse()` the raw text. If that fails, **re-ask once** with an explicit "return ONLY JSON matching this schema" instruction plus the validation error. If the re-ask also fails → return `PlanError`. |
| Response | Success: `{ ok: true, plan: DashboardPlan }`. Failure: `{ ok: false, error: PlanError }` with a user-safe message. HTTP 200 for structured plan errors the UI must surface gracefully; 400 for malformed request; 429 when rate-limited; 500 only for unexpected faults. |
| Rate limiting | Simple per-IP fixed-window / token-bucket in module scope (`Map<ip, { count, resetAt }>` or a lightweight lib such as a local limiter). Key on `x-forwarded-for` / request IP. **Prod caveat documented**: in-memory limiter is per-instance and resets on cold start / does not span serverless replicas — acceptable for the single-file demo; a shared store (Upstash/Redis) is the production upgrade path (out of scope). |

**System-prompt strategy** (ship ONLY metadata):
- Payload = `tableName`, `rowCount`, and per column `{ name, rawType, semanticType, summarized stats, 3–5 sampleValues }`, plus the user comment. No rows.
- Instruct: emit **valid DuckDB SQL** against the known table name (from `profile.tableName`, currently `"dataset"`), quoting identifiers with double quotes.
- Instruct: plan **4–8 widgets**, choosing `chartType` from `semanticType` (`temporal`→line, `categorical_low`→bar/donut, `measure_continuous`→histogram, single aggregate→kpi, `id`/`text`→do not chart). Provide `encoding` (`x`/`y`/`series`/`valueFormat`) naming the SQL result columns.
- Reinforce the golden rule in the prompt: the model writes SQL, it never states a number.

**Testable pure units (server):** `buildPlanPayload(profile, comment)` (metadata projection — assert no row-like fields leak), `buildSystemPrompt(...)`, and the fallback decision reducer (`parse → safeParse → re-ask → error`) as a pure state function fed mocked responses.

### 2. SQL executor + correction loop — `lib/duckdb/executePlan.ts` (client)

`WidgetResult` type (drives rendering; discriminated on `status`):

```ts
type WidgetResult =
  | { widget: Widget; status: "ok"; rows: Row[]; sql: string }        // sql = final (possibly corrected) query
  | { widget: Widget; status: "empty" }                              // ran fine, zero usable rows
  | { widget: Widget; status: "unavailable"; reason: string };       // retries exhausted
```

Execution contract:
- `executePlan(db, plan, correct)` iterates widgets **independently** and resolves each to a `WidgetResult`. One bad widget never throws past its boundary.
- Per widget: `runQuery(db, widget.sql)`. On throw → correction loop, **max 2 retries**. Each retry obtains a corrected SQL string from `correct(sql, errorMessage, profileSchema)`.
- `correct` is injected (dependency inversion) so the executor stays pure-ish and testable. Two viable implementations, decided here:
  - **Deterministic fixer first** for cheap/common errors (identifier quoting, obvious column typos vs. profile names) — no network, no cost.
  - **Correction endpoint fallback** (`app/api/plan/correct` or a `mode:"correct"` branch of the plan route) for semantic errors, sending only `{ sql, error, profile }` (still metadata-only). Bounded by the same 2-retry budget; counts against the widget budget, not the plan re-ask budget.
- On success → classify result: zero rows → `empty`; otherwise `ok`.
- On final failure (retries exhausted) → `unavailable` with the last error as `reason`.
- Widgets run so **partial success renders as it resolves** (results streamed into the store per widget, not one atomic batch).

**Testable pure units:** the retry/classification reducer (`attempt → success | retry | give-up`) with a mocked `runQuery`/`correct`; the empty/degenerate classifier.

### 3. `lib/charts/` — chartType → Recharts + encoding mapping

Decision table (single source of truth, pure):

| chartType | Recharts component | Encoding usage | Empty/degenerate handling |
|-----------|--------------------|----------------|---------------------------|
| `kpi` | `KpiCard` (no Recharts) | first row, `y` (or first numeric col); `valueFormat` | zero rows / null → render `—` |
| `line` | `LineChart` + `Line` | `x`=axis, `y`=value, optional `series` = multiple lines | <2 points → empty state |
| `bar` | `BarChart` + `Bar` | `x`=category, `y`=value, optional `series` | zero rows → empty state |
| `donut` | `PieChart` + `Pie` (innerRadius) | `x`=name, `y`=value | zero rows → empty state |
| `scatter` | `ScatterChart` + `Scatter` | `x`, `y` numeric | <1 point → empty state |
| `histogram` | `BarChart` (pre-binned by SQL) | `x`=bin label, `y`=count | zero rows → empty state |
| `table` | plain table (`tabular-nums`) | all columns; `valueFormat` per numeric | zero rows → empty state |

- `chartComponentFor(chartType)` and `mapEncoding(rows, encoding)` are **pure functions**. `mapEncoding` resolves `x/y/series` against actual result columns and falls back sensibly (first string col = x, first numeric col = y) when `encoding` is missing or names an absent column.
- `formatValue(value, valueFormat)` handles `number | currency | percent` with `tabular-nums`; null/`NaN` → `—`.
- Colors come exclusively from `--chart-1..5` (read via CSS var names, cycled by series index). No hardcoded hex.
- **Degenerate guard is centralized**: `classifyChartData(rows, chartType, encoding)` returns `renderable | empty` so every component shares one empty-state decision — no per-component crashes on null-heavy/single-value/zero-row inputs.

**Testable pure units (highest value):** the decision table, `mapEncoding`, `formatValue`, `classifyChartData`.

### 4. Components — `components/dashboard/`

| Component | Responsibility | Tokens / a11y |
|-----------|----------------|---------------|
| `CommentInput` | Textarea + generate button; calls `store.generatePlan()`; disabled while `planStatus==="planning"`. | Active-voice Spanish copy; visible focus ring; `radius-inner`. |
| `WidgetGrid` | Maps `widgetResults` → cards; responsive grid; `kpi` spans smaller, charts wider. | `shadow-card`, `radius-card`; responsive to mobile. |
| `ChartCard` | Card shell (title + chart body); picks component via decision table; renders empty/unavailable state. | `--card`, `shadow-card`, `radius-card`. |
| `KpiCard` | Single value + label; `tabular-nums`; delta color from `--positive`/`--negative` when applicable. | `font-mono` numerals, `tabular-nums`. |

Charts wrap in Recharts `ResponsiveContainer`. `prefers-reduced-motion` respected (disable chart animation). Unavailable widget = quiet muted card with a short message, not an error banner.

### 5. State — extend `lib/store.ts`

Add a plan slice to the existing Zustand store (extend `DataState` or add a parallel `usePlanStore`; **extend the existing store** so `profile`/`tableName` are directly available):

```ts
type PlanStatus = "idle" | "planning" | "executing" | "ready" | "error";

interface PlanSlice {
  comment: string;
  plan: DashboardPlan | null;
  widgetResults: WidgetResult[];
  planStatus: PlanStatus;
  planError: string | null;
  setComment: (c: string) => void;
  generatePlan: () => Promise<void>;   // POST /api/plan → set plan → executePlan
  reset: () => void;                    // also cleared by data reset()
}
```

Orchestration inside `generatePlan()`:
1. Guard: require `profile` + non-empty `comment`; set `planStatus="planning"`.
2. POST `{ profile, comment }`. On `{ok:false}` → `planStatus="error"`, `planError` set.
3. On `{ok:true}` → store `plan`, set `planStatus="executing"`, initialize `widgetResults` as pending placeholders.
4. Call `executePlan(db, plan, correct)`; update each `WidgetResult` as it resolves (per-widget, so the grid fills incrementally).
5. When all settle → `planStatus="ready"`.

**Testable pure units:** plan/result **reducers** extracted from the store (`applyPlan`, `applyWidgetResult`, `deriveStatus`) as pure functions — the store just wires them so state transitions are unit-tested without React/DuckDB.

### 6. Error / degradation model (end to end)

| Failure point | Behavior | Where enforced |
|---------------|----------|----------------|
| Malformed request (rows present, bad shape) | 400; nothing sent to model | route input validation |
| Model returns non-schema JSON | `safeParse` → 1 re-ask → structured `PlanError`; UI shows retry, no blank screen | route fallback reducer |
| Rate limit hit | 429 + friendly message | route limiter |
| Single widget SQL invalid | ≤2 corrections → `unavailable`; rest of grid renders | `executePlan` |
| Zero rows / single value / null-heavy | `empty` state per widget | `classifyChartData` |
| Whole plan fails | `planStatus="error"` with message; upload/comment still usable | store |

**Golden rule enforcement point:** `buildPlanPayload` in the route is the single chokepoint — it constructs the model payload from `TableProfile` fields only. The route never reads/forwards rows; the correction endpoint likewise sends only `{ sql, error, profile }`. Only metadata ever leaves the browser. This is an explicit acceptance gate for verify.

### 7. Strict TDD — pure units worth testing first (Vitest, `npm run test`)

| Unit | File (proposed) | Why tests-first |
|------|-----------------|-----------------|
| Chart decision table + `mapEncoding` + `formatValue` + `classifyChartData` | `lib/charts/*` | Pure, high branch count, core correctness |
| Executor retry/classification reducer | `lib/duckdb/executePlan.ts` (pure core) | Bounded-retry logic is easy to get wrong |
| Plan payload builder (golden-rule projection) | route helper `buildPlanPayload` | Asserts no rows leak — security-critical |
| Fallback decision reducer (parse→safeParse→re-ask→error) | route helper | Deterministic, mock model responses |
| Store reducers (`applyPlan`, `applyWidgetResult`, `deriveStatus`) | store helpers | State transitions without React/IO |

IO shells (Anthropic call, `runQuery`, Recharts render) stay thin and are covered by lighter integration/smoke checks, not unit tests.

## Checklist

- [ ] Route accepts `{ profile, comment }` only; row-shaped input rejected; key never client-side.
- [ ] Structured output via `messages.parse()` + `zodOutputFormat`; `.min(1)` handled (stripped + client-validated); no `thinking`/`effort`.
- [ ] Plan re-ask ≤1 (server) and per-widget SQL correction ≤2 (client) are separate budgets.
- [ ] `WidgetResult` discriminated union (`ok`/`empty`/`unavailable`) drives rendering; one bad widget never blanks the grid.
- [ ] `lib/charts` decision table + encoding mapping are pure and handle empty/degenerate data.
- [ ] Components use `--chart-1..5`, `shadow-card`, `radius-card`, `tabular-nums`; reduced-motion respected.
- [ ] Store holds `{ comment, plan, widgetResults, planStatus }` and orchestrates POST → executePlan → render incrementally.
- [ ] Golden rule enforced at `buildPlanPayload`; only metadata leaves the browser.

## ADR-style decisions

| Decision | Rationale | Rejected alternative |
|----------|-----------|----------------------|
| Two separate bounded retry budgets (plan re-ask 1, SQL correction 2) | Different failure classes (bad JSON vs bad SQL) with different costs; merging them would let one class starve the other | Single shared retry counter |
| Correction via injected `correct(sql,error,schema)`: deterministic fixer first, endpoint fallback | Cheap/common errors fixed with no network/cost; keeps executor testable via DI | Always re-call the model (cost, latency); always deterministic (misses semantic errors) |
| `WidgetResult` discriminated union with explicit `empty`/`unavailable` | Rendering degradation is data, not exceptions — no try/catch in components | Throwing errors and catching per card |
| Centralized `classifyChartData` empty-state guard | One shared empty-state decision; prevents per-component null crashes | Each chart component guarding independently |
| Extend existing Zustand store (not a new store) | `profile`/`tableName` already live there; avoids cross-store sync | Separate `usePlanStore` |
| In-memory per-IP limiter for demo, Redis noted as prod path | Zero infra for the single-file demo; caveat documented honestly | Skip rate limiting (cost/abuse risk); require Redis now (out of scope) |
| Pure reducers extracted from store/route/executor | Strict TDD needs deterministic units without React/DuckDB/network | Test through the store/route directly (slow, flaky, IO-bound) |

## Next step

Proceed to `sdd-tasks` (reads this design + the spec) to break the work into tests-first task steps. Scope stays Phase 2: one file, comment → plan → execute → render, degrade never break.
