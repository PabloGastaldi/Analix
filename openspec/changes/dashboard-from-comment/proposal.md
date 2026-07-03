# Proposal: Dashboard driven by a natural-language comment (Phase 2)

Turn the validated `TableProfile` from Phase 1 into a living dashboard: the user writes one plain-language comment ("mostrame lo más importante"), and Analix returns 4–8 charts whose numbers are computed by DuckDB-WASM in the browser, never by the model. This is the first slice where Analix becomes useful instead of merely a data loader.

## Intent

**Problem.** After Phase 1 the user has a parsed table, a validated `TableProfile`, and a queryable DuckDB table in the browser — but nothing to look at. There is no bridge from "I have data" to "I see what matters." Building that bridge by hand (choosing charts, writing SQL) is exactly the work non-technical users cannot do and technical users do not want to do.

**Why now.** Phase 1 already produces the two ingredients this phase consumes: the deterministic schema+stats profile and the in-browser query engine. The contracts (`dashboardPlanSchema`, `tableProfileSchema`) already exist. The remaining gap is purely the planning + rendering layer. This is the phase that makes the demo real.

**User-facing outcome.** The user types a comment, waits a few seconds, and sees a titled dashboard of KPI cards and charts relevant to their comment. Every figure is exact because it comes from SQL against their own data. If one widget cannot be computed, it degrades quietly; the dashboard as a whole still renders.

**Success looks like.**

- A single uploaded file goes end-to-end: comment → plan → SQL execution → rendered widgets.
- Numbers match what the user would get running the SQL themselves (deterministic, not hallucinated).
- No raw data row ever leaves the browser.
- A malformed model response or a broken widget query never blanks the screen.

## Scope

### In scope (this change)

| Area | What ships |
|------|------------|
| Plan route | `app/api/plan/route.ts` — server handler calling `claude-haiku-4-5`, returning a validated `DashboardPlan`. |
| Structured output | `client.messages.parse()` + `zodOutputFormat(dashboardPlanSchema)`, with a `safeParse` + single re-ask fallback. |
| Prompt design | System/user prompt that ships only schema + stats + user comment. Encodes the golden rule and the 4–8 widget target. |
| SQL executor | Client-side runner that executes each widget's SQL in DuckDB-WASM, with the correction loop (max 2 retries, then mark unavailable). |
| Rendering | `WidgetGrid` + per-`chartType` Recharts components: KPI card, line, bar, donut, scatter, histogram, table. Driven by `chartType` + `encoding`. |
| State wiring | Store slice holding the current plan, per-widget execution status (pending / ok / unavailable), and results. |
| Dependency | Add `recharts` to the project. |

### Out of scope (later phases, referenced only)

| Deferred to | What |
|-------------|------|
| Phase 3 | Narrative written summary (`api/summary`, Sonnet). |
| Phase 4 | Chat / interactive text-to-SQL. |
| Phase 5 | Dashboard export (image / PDF). |
| Phase 6 | Multi-file joins. |

### First-slice boundary

**One uploaded file, end to end.** No multi-file, no persistence of dashboards across reloads beyond in-memory store, no editing individual widget SQL by hand, no re-prompting UI beyond a single "generate" action. The comment-to-dashboard round trip working reliably for one file IS the deliverable.

## Approach

The flow is a clean handoff across the server/client boundary, with the golden rule enforced at the payload construction step.

```
comment + TableProfile
   │  (client → server: metadata only, no rows)
   ▼
app/api/plan/route.ts  ──►  claude-haiku-4-5
   │  messages.parse() + zodOutputFormat(dashboardPlanSchema)
   │  fallback: safeParse + one re-ask
   ▼
DashboardPlan (validated)  ──►  (server → client)
   │
   ▼
SQL executor (DuckDB-WASM, client-side)
   │  per widget: run SQL → on error, correction loop (≤2 retries)
   │  final failure → widget marked unavailable
   ▼
WidgetGrid → Recharts per chartType + encoding
```

### 1. Plan route (`app/api/plan/route.ts`)

- Server-side only. Instantiates `new Anthropic()` (reads `ANTHROPIC_API_KEY` from `.env.local`, never `NEXT_PUBLIC_`).
- Input: `{ profile: TableProfile, comment: string }`. The handler must NOT accept or forward data rows.
- Uses `client.messages.parse()` with `zodOutputFormat(dashboardPlanSchema)` from `@anthropic-ai/sdk/helpers/zod` so the response is schema-guaranteed JSON validated in one step.
- Fallback: if parse fails, `safeParse` the raw response; on failure, re-ask once explicitly requesting valid JSON matching the schema. After that, return a structured error the client can surface without crashing.
- No `thinking` / `effort` params (Haiku 4.5 does not accept them).

### 2. Prompt design (golden rule enforced here)

- The payload built for the model contains only: table name, row count, per-column name + `rawType` + `semanticType` + summarized stats + 3–5 `sampleValues`, and the user comment.
- The prompt instructs the model to plan 4–8 widgets, pick a `chartType` per widget aligned with each column's `semanticType` (e.g. `temporal` → line, `categorical_low` → bar/donut, `measure_continuous` → histogram, `id`/`text` → do not chart), and emit valid DuckDB SQL against the known table.
- The number is never asked of the model; the model only writes the SQL that DuckDB will run.

### 3. SQL executor + correction loop (client-side)

- For each widget in the validated plan, execute `widget.sql` in DuckDB-WASM.
- On SQL error: retry by passing the error message + schema back for correction. Max 2 retries.
- On final failure: mark that widget `unavailable` and continue. Never throw past the widget boundary — one bad query must not blank the grid.
- Widgets execute independently so partial success renders as it resolves.

### 4. Rendering (`WidgetGrid` + Recharts)

- `WidgetGrid` maps each widget to a component chosen by `chartType`.
- Encoding (`x`, `y`, `series`, `valueFormat`) maps SQL result columns onto chart axes/series.
- KPI cards use `tabular-nums` and the design-system tokens; charts use the `--chart-1..5` palette. Unavailable widgets render a quiet degraded state, not an error explosion.

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Model returns JSON that does not match the schema | `zodOutputFormat` makes the output schema-guaranteed; plus `safeParse` + one re-ask fallback; plus a structured error path so the UI never breaks. |
| Generated SQL is invalid or references wrong columns | Correction loop (≤2 retries) feeds the error + schema back; final failure degrades the single widget, not the dashboard. |
| Empty or degenerate widgets (zero rows, single value) | Executor treats empty/degenerate results as a renderable state; charts show an empty state rather than crashing; KPI still renders a value or "—". |
| Token cost creeping up | Haiku 4.5 is the cheap, bounded model; payload is metadata-only (schema + stats), keeping each dashboard in the cents range; re-ask is capped at one. |
| Golden-rule leak (rows reaching the model) | Payload is constructed explicitly from `TableProfile` fields only; the route rejects/ignores any row data; reviewed as an acceptance gate. |
| Model over/under-produces widgets | 4–8 is a prompt-level guideline; schema stays lenient (`min(1)`) so a short-but-valid plan still renders and degrades gracefully. |

## Security and cost

- **Key isolation.** `ANTHROPIC_API_KEY` lives only server-side in `.env.local`. Never exposed to the client, never `NEXT_PUBLIC_`. All model calls go through the route handler.
- **Metadata-only payloads.** Only schema + summarized stats + comment travel to the server and model. Raw data stays in DuckDB-WASM in the browser. This is both the privacy guarantee and the cost lever: cents per dashboard.
- **Rate limiting.** The `api/plan` route is rate-limited to bound abuse and runaway cost.

## Non-goals and product constraints

- **The number always comes from DuckDB, never the model.** Non-negotiable. The model plans and writes SQL; the engine computes.
- **No raw rows to the server or model.** Ever.
- **Degrade, never break.** A bad plan, bad SQL, or bad widget must never blank the dashboard.
- **One file, this phase.** Multi-file, narrative, chat, and export are explicitly later phases.
- **No new model IDs invented.** `claude-haiku-4-5` is the settled model for plan/SQL; do not hardcode unverified alternatives.

## Next step

Proceed to `sdd-spec` (widget/plan contracts, route request/response shape, executor state machine) and `sdd-design` (correction-loop design, prompt structure, Recharts component mapping). These two can run in parallel; both read this proposal.
