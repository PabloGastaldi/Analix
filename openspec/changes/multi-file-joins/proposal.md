# Multi-file with confirmed joins

Let users upload several files at once, work with each as its own dashboard, and — only when the data actually relates — join two of them into a single view that the existing dashboard, summary, and chat flow treats like any other table. Joins are always inferred from metadata, shown to the user, and confirmed before a single number is computed. If nothing relates, the app degrades to a per-table experience instead of inventing a relationship.

## Intent

### Problem
Real business data almost never lives in one file. Sales sit in one export, the customer directory in another, the product catalog in a third. Today Analix ingests exactly one file into a single DuckDB table (`"dataset"`) and holds one `TableProfile`. A user with three related exports has to pre-join them in Excel before Analix is useful — which defeats the point of the tool.

### Why now
Phases 0–5 shipped a working single-file pipeline: ingest → profile → comment-driven plan → narrated summary → text-to-SQL chat, all honoring the golden rule (only schema + stats reach the model; DuckDB computes). That foundation is exactly what a multi-file flow should reuse. Multi-file is the "complete version" the project plan describes — the last real feature before polish.

### User-facing outcome
- Upload N files in one session; each appears as a named, profiled table the user can inspect and pick.
- Pick any table and get the full existing experience (dashboard, comment, summary, chat) unchanged.
- When two tables plausibly relate, Analix surfaces the candidate join ("`orders.customer_id` matches `customers.id`, high overlap") and asks the user to confirm or correct it.
- On confirmation, a joined view behaves like a normal profiled table — the same dashboard/summary/chat flow runs over it, no new mental model.
- When nothing relates reliably, the app quietly stays per-table. It never fabricates a join, and it never blocks the user.

### Success looks like
A user uploads `orders.csv` + `customers.csv`, confirms the suggested join, types "show me revenue by customer region," and gets a correct dashboard whose numbers come from a DuckDB view — with the model having seen only column names, types, stats, and candidate-key metadata.

## Scope

The project plan explicitly warns *"frená el scope"* — multi-file is ambitious and the join logic is fragile. So this change is split into two slices with a hard, shippable boundary between them. **Degradation is the safe default; joins are additive.**

### First slice — multi-table base (degradation-safe, no joins)
Ships a fully usable multi-file experience without any join logic.

**In scope**
- Ingest N files (CSV/Excel) into N distinct DuckDB tables with sanitized, collision-free names (not the hardcoded `"dataset"`).
- Produce and hold N `TableProfile`s plus per-table preview rows.
- A table-list / table-switcher UI to see uploaded tables and inspect each profile.
- The user selects an **active table**; the entire existing single-table flow (plan, comment, summary, chat) runs against it, unchanged.
- Per-table type correction (the existing column-type dropdown) scoped to the active table.
- Reset/remove: clear all tables, or drop one table.

**Out of scope for this slice** — all join detection, inference, confirmation UI, and joined views. They are the second slice.

### Second slice — confirmed joins
Adds relationship detection and joined views on top of the base.

**In scope**
- Deterministic candidate-key detection in code: compatible column names + measured value-set overlap between table pairs, computed in DuckDB.
- An `app/api/joins` route: the LLM infers relationships from **schemas + candidate-key metadata only**, returning join proposals with a confidence, validated with Zod.
- A confirm/correct UI: show inferred join(s); user accepts, edits the key columns, changes join type, or rejects.
- On confirmation, build a DuckDB `VIEW` for the joined result, profile that view into a `TableProfile`, and register it as a selectable table the existing flow consumes with no special-casing.
- Graceful degradation: if no candidate keys pass the overlap threshold, or the model returns low confidence, offer no join and keep the per-table experience.

**Out of scope (deferred beyond this change)**
- Multi-hop joins / more than two tables joined into one view (star schemas, chains). First real join is pairwise.
- Automatic joins without user confirmation. Confirmation is mandatory, always.
- Cross-file fuzzy/type-coerced key matching (e.g. `"01"` vs `1`, trimmed strings, case-folding). First cut matches on exact normalized values only.
- Persisting sessions, saved join configurations, or sharing.
- Aggregation-aware fan-out warnings beyond a basic one-to-many notice (see risks).

## Approach

### 1. Multi-table ingest and profiles (first slice)
Generalize the store from a single `{ tableName, profile, previewRows }` to a keyed collection of tables, each with its own DuckDB table name, `TableProfile`, and preview. Table names must be sanitized and deduplicated (derive from file name, strip to a safe identifier, suffix on collision) — the current hardcoded `"dataset"` becomes one entry among many. `loadCsvTable` already takes a `tableName` argument, so the ingest path is reused per file. `profileTable` already takes a table name, so N profiles is N calls. The plan/summary/chat slices become parameterized by the **active table's** profile instead of the single global `profile`.

Rationale: the existing single-file pipeline is entirely table-name-parameterized already; the base slice is mostly a store/state refactor plus a table-switcher UI, with almost no new algorithmic risk. That is why it ships first and stands alone.

### 2. Deterministic candidate-key detection (second slice, code only)
Before any model call, find plausible join keys in code:
- **Name compatibility:** pair columns across two tables by normalized name similarity (`id`, `customer_id`, `customerId`, `Customer ID`) and compatible `rawType`/`semanticType` (an `id`/`categorical` column, not a free-text or continuous measure).
- **Value-set overlap:** for each candidate pair, run a DuckDB query measuring how many distinct values of column A also appear in column B (and vice versa). Overlap ratio + direction (one-to-one vs one-to-many) is the signal. This is measured, never guessed.

Only pairs passing an overlap threshold become candidate keys. This metadata — column names, types, overlap ratios, cardinality direction — is the *only* new thing added to the model payload.

Rationale: the golden rule says DuckDB computes and the model never sees rows. Overlap is a factual property of the data, so it must be computed in DuckDB and passed as a summary statistic — exactly like the existing column stats. The model's job is to *interpret* candidates, not to discover them.

### 3. LLM join inference (second slice, metadata only) + Zod
A new `app/api/joins` route sends the model: the participating `TableProfile`s (schema + stats, no rows) plus the deterministic candidate-key metadata, and the user comment if present. The model returns proposed join(s): left table, right table, key column pair, join type, and a confidence. The response is validated with a new Zod schema (`joinPlanSchema`) **before** any view is built — same discipline as `dashboardPlanSchema`. On invalid output, re-ask once, then degrade.

Rationale: this mirrors the existing `app/api/plan` route exactly (Sonnet 5, `thinking: disabled`, structured output, Zod, rate limiting, schema-only payload). Reusing that shape keeps the security and cost properties identical and the code familiar.

### 4. Confirm/correct UI (second slice)
Never auto-apply. Render the inferred join(s) with their confidence and overlap evidence in plain language. The user can accept, swap the key columns, change the join type (inner/left), or reject. Confirmation is the gate: no view is created until the user says yes.

Rationale: a wrong join silently produces wrong numbers — the single most dangerous failure mode of this feature. Human confirmation on cheap-to-review metadata is the mitigation. The signature "the app reads your files" moment from Phase 1 extends naturally here: "the app sees how your files relate," editable in place.

### 5. Joined DuckDB view, reused by the existing flow (second slice)
On confirmation, create a DuckDB `VIEW` joining the two tables on the confirmed keys. Profile that view with the existing `profileTable` into a normal `TableProfile`, and register it as a selectable table. From that point, the existing plan/summary/chat flow runs over the view's profile with **zero special-casing** — a joined view is just another profiled table to the rest of the app.

Rationale: making the join output conform to the existing `TableProfile` contract is what keeps the blast radius small. Everything downstream of profiling stays untouched.

### 6. Graceful per-table degradation (both slices)
Degradation is not an error path — it is the default. No candidate keys → no join offered, per-table experience continues. Model low-confidence or invalid → no join offered. User rejects → per-table. The dashboard/summary/chat never break because a join could not be formed.

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Garbage join produces confident-looking wrong numbers | High — violates the app's core promise of exactness | Mandatory user confirmation on metadata evidence; overlap thresholds gate what is even proposed; show the overlap ratio so the user judges, not just accepts |
| Ambiguous keys (several columns plausibly join) | Medium — user confusion, wrong pick | Rank candidates by overlap + cardinality; present the top candidate but let the user switch; never silently choose |
| Model is over-eager and proposes joins that do not hold | Medium | Candidate keys are computed deterministically first; the model may only choose among code-detected candidates, not invent columns. Zod rejects references to non-candidate columns. Low confidence → degrade |
| Large tables make overlap checks slow (client-side WASM) | Medium — janky ingest | Compute overlap on distinct values with a bounded sample when a table exceeds a row threshold; overlap is an estimate flagged as such; keep checks off the ingest critical path (run after tables are ready) |
| One-to-many joins fan out rows and inflate aggregates | Medium — subtle wrong sums | Detect cardinality direction during overlap measurement; warn the user when a join is one-to-many so they read totals with that context. Full fan-out-safe aggregation is deferred |
| Store refactor (single → multi table) regresses the Phase 0–5 flow | Medium | First slice is exactly this refactor with existing behavior preserved for the active table; ship and verify it before any join logic touches the codebase |
| Table-name collisions / unsafe identifiers from file names | Low–Medium — SQL errors | Sanitize to safe identifiers and dedupe with suffixes at ingest; quote all identifiers as the code already does |

## Security and cost

- **Golden rule preserved and extended:** the only new data crossing to the model is candidate-key *metadata* (column names, types, overlap ratios, cardinality). Never rows. Overlap is computed in DuckDB-WASM in the browser — raw values never leave the client.
- **API key stays server-side.** The join inference call goes through the `app/api/joins` route handler like every other model call; nothing new is exposed to the client.
- **Rate limiting:** the `joins` route reuses the existing per-IP limiter pattern from `app/api/plan`. Join inference is a schema-only payload, so each call costs cents, same order as plan/summary/chat.
- **Cost shape unchanged:** one extra model call per confirmed-join attempt, only when candidate keys exist and the user engages — not on every ingest.

## Non-goals and product constraints

- **No auto-join.** Confirmation is always required; the model never applies a join on its own.
- **Pairwise only** in this change. Multi-table chains/stars are deferred.
- **No fuzzy key coercion** in this change — exact normalized value match only.
- **No row data to the model, ever** — including during join inference. This is the non-negotiable project constraint.
- **Never break the dashboard** — a failed or absent join always degrades to the per-table experience.
- **Reuse the existing contracts** (`TableProfile`, `DashboardPlan`, the plan/summary/chat routes). A joined view must look like a normal profiled table so the rest of the app stays untouched.
- **Type discipline:** strict TypeScript, no `any`; every model response validated with Zod before use; UI copy in the user's language (Spanish), code and comments in English.

## Open questions

- Overlap threshold value(s): what minimum distinct-value overlap ratio qualifies a candidate key? Needs a default plus possibly a per-direction rule for one-to-many.
- Row-count threshold above which overlap switches to sampled estimation, and the sample size.
- Whether the join confirm step should pre-run when the user's comment clearly spans two tables, or stay a distinct user-initiated action.
- Exact `joinPlanSchema` shape (join type set: inner/left only, or more?).
