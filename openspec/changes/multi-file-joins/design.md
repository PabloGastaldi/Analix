# Design — Multi-file with confirmed joins

Architecture for Phase 6. The store generalizes from one table to a keyed collection with an active table; a confirmed join becomes a DuckDB `VIEW` that is profiled into a normal `TableProfile` and consumed by the existing plan/summary/chat flow with zero special-casing. Everything downstream of profiling stays untouched. The golden rule extends unchanged: only schema, stats, and code-computed candidate-key metadata reach the model — never rows.

## Architecture at a glance

| Decision | Choice |
|----------|--------|
| Pattern | Keep the "LLM plans, DuckDB computes" pipeline; add a **table registry** in front of it and a **join view** that re-enters the pipeline as a normal table. |
| Boundary | A joined `VIEW` conforms to the existing `TableProfile` contract. That contract is the seam that keeps the blast radius small. |
| New model call | One route only, `app/api/joins`, mirroring `app/api/plan` exactly (Sonnet 5, `thinking: disabled`, `messages.parse` + `zodOutputFormat`, own per-IP limiter, metadata-only payload). |
| Slice boundary | **Slice 1 (multi-table base)** ships alone and degradation-safe: no join code. **Slice 2 (confirmed joins)** adds detection, inference, confirm UI, and views on top. |
| Degradation | The default, not an error path. No candidates, low confidence, invalid output, or user reject → per-table experience continues. The dashboard never breaks because a join could not form. |

## Component map

```
Slice 1 — multi-table base
  lib/store.ts                 tables[] + activeTableName; ingestFile appends
  lib/store.reducers.ts        pure table-registry reducers (tested)
  lib/duckdb/tableName.ts      sanitize + dedupe file name -> safe identifier (tested, pure)
  components/data/TableSwitcher activate / inspect / drop a table
  (reuse) loadCsvTable, profileTable, runQuery — already table-name-parameterized

Slice 2 — confirmed joins
  lib/joins/detectKeys.ts      deterministic candidate-key detection (DuckDB overlap)
  lib/joins/rankCandidates.ts  PURE ranking/threshold over precomputed stats (tested)
  lib/schemas/joins.ts         joinPlanSchema (Zod) + JoinRelationship types
  lib/ai/buildJoinsPayload.ts  golden-rule chokepoint for the joins route (tested, pure)
  lib/ai/buildJoinsSystemPrompt.ts
  lib/ai/joinsFallback.ts      resolveJoins re-ask-once + degrade (tested)
  app/api/joins/route.ts       mirrors app/api/plan/route.ts
  lib/joins/buildJoinView.ts   CREATE VIEW + collision-safe SELECT list, then profileTable
  components/data/JoinPanel    show candidates / inferred join; confirm / correct / reject
```

## Data flow

**Slice 1 — ingest N files**
1. `ingestFile(file)` → `fileToCsv` → `tableName = uniqueTableName(fileName, existingNames)` → `loadCsvTable(db, tableName, csv)` → `profileTable(db, tableName)` → preview query.
2. Append `{ tableName, fileName, profile, previewRows }` to `tables[]`. First ingest also sets `activeTableName`.
3. The plan/summary/chat slices read the **active table's** profile via a selector, not a global `profile`.

**Slice 2 — join two tables**
4. After tables are ready (off the ingest critical path), `detectKeys(db, tables)` computes candidate keys pairwise in DuckDB.
5. If any candidate passes the threshold, POST `/api/joins` with `{ tableProfiles, candidateKeys, comment? }` (metadata only). Model returns proposals; `joinPlanSchema` validates before anything else.
6. `JoinPanel` shows the inferred join with its overlap evidence. User confirms / corrects / rejects. Nothing is computed until confirmation.
7. On confirm: `buildJoinView` runs `CREATE VIEW joined_… AS SELECT … JOIN …`, then `profileTable(db, viewName)` produces a normal `TableProfile`. The view registers as a `tables[]` entry and can be set active. From here, the existing flow runs unchanged.

## Decisions

### 1. Store refactor: single → multi (Slice 1)

Replace the three single-table fields (`fileName`, `tableName`, `profile`, `previewRows`) with a registry plus an active pointer. The plan/summary/chat/comment slices are **unchanged in shape** — they keep reading a single `profile`; that profile is now derived from the active table.

```ts
export interface DataTable {
  tableName: string;   // sanitized DuckDB identifier, unique
  fileName: string;    // original, for display
  profile: TableProfile;
  previewRows: Row[];
  kind: "file" | "join"; // join views are just another entry
}

interface DataState {
  tables: DataTable[];
  activeTableName: string | null;
  // ...existing plan/summary/chat/comment slices unchanged...
}
```

- **Active-table selector.** A derived getter `activeTable()` returns the `DataTable` for `activeTableName`. Where the old code read `get().profile`, it now reads `get().activeTable()?.profile`. This is the single behavioral change the Phase 0–5 flow sees. `toCorrectionProfile` is fed from the active profile exactly as today.
- **`ingestFile` migration → append.** `tableName` is no longer the hardcoded `"dataset"`; it is `uniqueTableName(file.name, tables.map(t => t.tableName))`. The function keeps its existing try/catch and preview logic, but on success it **appends** a `DataTable` instead of replacing the top-level fields, and sets `activeTableName` if none is set. Ingest of a second file must not disturb the first table, its profile, or an in-flight plan.
- **`updateColumnType`** is scoped to the active table: it maps over `tables`, replacing only the active entry's profile column. Correcting a type on table A never touches table B.
- **Switching active table** clears the derived plan/summary/chat state (`plan`, `widgetResults`, `summary`, `chatMessages`, `comment`) because those are outputs of the previously active profile. The tables and their profiles are preserved. This is a small dedicated reducer.
- **Reset semantics.** `reset()` clears `tables` and `activeTableName` plus all derived slices (as today). Add `removeTable(tableName)`: drops one entry; if it was active, activate the first remaining table (or null); if it was a base table that a join view depends on, drop the dependent join view too. Removing a table also `DROP`s its DuckDB table/view to free WASM memory.
- **Preview `date` cast** logic stays identical, just parameterized by the per-file `tableName` that already flows through it.

**Pure units to test (Slice 1):** the table-registry reducers in `lib/store.reducers.ts` — `addTable`, `setActiveTable` (clears derived slices), `updateActiveColumnType`, `removeTable` (re-activation + join-view cleanup). No React/Zustand/DuckDB; same pattern as the existing `applyPlan`/`applyWidgetResult` reducers. And `uniqueTableName` in `lib/duckdb/tableName.ts`.

**`uniqueTableName` (pure, tested).** Lowercase, replace any non `[a-z0-9_]` run with `_`, strip leading digits/underscores to a `t_` prefix if the result would be an invalid identifier, collapse repeats, cap length. On collision with an existing name, suffix `_2`, `_3`, …. Deterministic given `(fileName, existingNames)`. All identifiers stay quoted at the SQL layer as the code already does, so sanitization is defense-in-depth, not the only guard.

### 2. Candidate-key detection — `lib/joins/detectKeys.ts` (Slice 2)

Two stages: a **pure** name/type gate (testable in isolation) and a **DuckDB** overlap measurement.

**Stage A — name + type compatibility (pure).** For every ordered pair of tables, pair columns that are plausibly keys:
- Column `semanticType` must be `id`, `categorical_low`, or `categorical_high`. Never `measure_*`, `temporal`, `boolean`, or `text` (free text is not a key).
- `rawType` must be compatible on both sides (both `number`, or both `string`; `mixed` is skipped this cut — no fuzzy coercion, per scope).
- **Name compatibility** via a normalized name: lowercase, strip non-alphanumerics, drop a trailing `id`/`_id`/`key` token to a base token. Two columns are name-compatible if their normalized names are equal, or one normalized name equals the other's base + the other table's singularized name (`customers.id` ↔ `orders.customer_id`). This yields the initial candidate set — cheap, no DB.

**Stage B — value-set overlap (DuckDB).** For each name/type candidate pair `(A.a, B.b)`, measure directional overlap on distinct values:

```sql
-- distinct counts and the size of the shared value set
SELECT
  (SELECT COUNT(DISTINCT "a") FROM A_src)                    AS distinctA,
  (SELECT COUNT(DISTINCT "b") FROM B_src)                    AS distinctB,
  (SELECT COUNT(*) FROM (
     SELECT DISTINCT "a" FROM A_src
     INTERSECT
     SELECT DISTINCT "b" FROM B_src))                        AS shared
```

`A_src`/`B_src` are the full tables below the sampling cutoff, or a bounded sample above it (see below). From `{distinctA, distinctB, shared}` we derive **directional coverage**: `coverageAtoB = shared / distinctA`, `coverageBtoA = shared / distinctB`. The **overlap score** is `max(coverageAtoB, coverageBtoA)`; the low side signals cardinality direction.

**Threshold (decided): `MIN_OVERLAP = 0.5` of the smaller side's distinct values.** A candidate qualifies when `shared / min(distinctA, distinctB) >= 0.5`. Rationale: the FK side of a real relationship is usually near-fully covered by the PK side; 0.5 catches partial-but-real relationships (recent orders against a full customer directory) while rejecting coincidental low overlap. It is a default, not a law — the user still confirms.

**Cardinality (decided).** With the shared set, the side whose coverage ≈ 1.0 is the PK/"one" side; if both are ≈ 1.0 it is one-to-one, otherwise one-to-many toward the lower-coverage side. This direction is carried into the payload and drives the fan-out warning (Decision 6).

**Sampling cutoff (decided): `SAMPLE_ROW_THRESHOLD = 100_000` rows, `SAMPLE_SIZE = 50_000`.** When a table exceeds the threshold, `A_src` becomes `SELECT … FROM A USING SAMPLE 50000 ROWS` (DuckDB reservoir sample). Overlap from a sample is an **estimate**; the candidate carries `estimated: true` so the UI can say "approximate overlap." Rationale: distinct-value overlap over the full table is O(n) client-side WASM work; a 50k reservoir sample bounds latency while staying statistically representative for key detection. Overlap runs after all tables are ready, never on the ingest critical path.

**Ranked-candidate output shape.** `detectKeys` returns candidates already ranked (via the pure `rankCandidates`):

```ts
export interface CandidateKey {
  leftTable: string; leftColumn: string;
  rightTable: string; rightColumn: string;
  distinctLeft: number; distinctRight: number; shared: number;
  overlap: number;          // shared / min(distinctLeft, distinctRight)
  coverageLeftToRight: number; coverageRightToLeft: number;
  cardinality: "one-to-one" | "one-to-many" | "many-to-one";
  estimated: boolean;       // true when measured on a sample
}
```

**PURE unit worth testing (decided): `rankCandidates(rawStats): CandidateKey[]`** in `lib/joins/rankCandidates.ts`. Given precomputed `{distinctLeft, distinctRight, shared}` per pair, it applies the threshold, derives coverage/overlap/cardinality, drops sub-threshold pairs, and sorts by `overlap` desc then `distinct` desc. No DuckDB, no I/O — a table of inputs → expected ranked outputs. This isolates the risky judgment (thresholding, cardinality inference) from the DB plumbing.

### 3. `joinPlanSchema` — `lib/schemas/joins.ts` (Slice 2)

Mirrors the discipline of `dashboardPlanSchema`: validated before any view is built; re-ask once on invalid, then degrade.

```ts
export const joinTypeSchema = z.enum(["inner", "left"]); // MVP: inner + left only

export const joinRelationshipSchema = z.object({
  leftTable: z.string(),
  leftColumn: z.string(),
  rightTable: z.string(),
  rightColumn: z.string(),
  joinType: joinTypeSchema,
  cardinality: z.enum(["one-to-one", "one-to-many", "many-to-one"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().optional(), // plain-language evidence, in the user's language
});

export const joinPlanSchema = z.object({
  // Empty array is a valid, first-class "nothing relates" answer -> degrade.
  relationships: z.array(joinRelationshipSchema).max(1), // pairwise, one join this change
});
export type JoinPlan = z.infer<typeof joinPlanSchema>;
export type JoinRelationship = z.infer<typeof joinRelationshipSchema>;
```

**Join-type set (decided): `inner` + `left` only.** Covers the two cases that matter for a first pairwise join (matched-only vs. keep-all-of-left). `right`/`full`/`cross` add UI and fan-out complexity without MVP payoff and are deferred.

**Constraining the model to code-detected candidates.** The schema alone cannot forbid a hallucinated column, so the route enforces it in two layers:
1. **Prompt:** the system prompt lists the exact candidate `(leftTable.leftColumn ↔ rightTable.rightColumn)` pairs and instructs the model to choose only among them or return `relationships: []`.
2. **Post-validation gate (code):** after Zod parse, `resolveJoins` rejects any relationship whose `(table, column)` pair on either side is not in the code-detected candidate set. A non-candidate reference is treated exactly like invalid output → re-ask once → degrade. This makes "the model invents a column" unrepresentable in the confirmed path, per the risk table.

`confidence` below a floor (decided: `0.5`) is dropped to degradation, same as an empty result.

### 4. `api/joins` route + payload builder (Slice 2)

`app/api/joins/route.ts` is a structural copy of `app/api/plan/route.ts`: `MODEL = "claude-sonnet-5"`, `THINKING = { type: "disabled" }`, `messages.parse` with `output_config: { format: zodOutputFormat(joinPlanSchema) }`, its **own** `createRateLimiter` instance (`joinsRateLimiter`), the same `errorResponse` / `resolveClientIp` helpers, and structured errors returned at HTTP 200 for user-facing degradation.

**Golden-rule chokepoint — `lib/ai/buildJoinsPayload.ts` (pure, tested).** The single place that projects profiles + candidates into the model payload. Never spreads inputs; only reads documented fields; **no rows, ever**.

```ts
export type JoinsPayload = {
  tables: { tableName: string; rowCount: number; columns: PlanPayloadColumn[] }[];
  candidateKeys: {
    leftTable: string; leftColumn: string;
    rightTable: string; rightColumn: string;
    overlap: number; cardinality: CandidateKey["cardinality"]; estimated: boolean;
  }[];
  comment: string; // may be empty
};
```

`columns` reuse the exact `Pick<ColumnProfile, "name" | "rawType" | "semanticType" | "stats">` projection from `buildPlanPayload`. What crosses the wire is column names/types/stats (already sent today for a single table) plus overlap ratios and cardinality — all summary statistics computed in DuckDB-WASM in the browser. Raw values never leave the client. `resolveJoins` in `lib/ai/joinsFallback.ts` owns the re-ask-once + candidate-gate + degrade logic and is unit-tested against a mock `askModel`, mirroring `resolvePlan`/`planFallback`.

**PURE unit worth testing (decided): `buildJoinsPayload`** (asserts no row/data field can leak; asserts extra input fields are dropped) and `resolveJoins` (asserts re-ask-once, candidate-gate rejection, and degradation on empty/low-confidence).

### 5. Joined VIEW + reuse — `lib/joins/buildJoinView.ts` (Slice 2)

On confirmation, build a view and profile it into a normal `TableProfile`:

```sql
CREATE VIEW "joined_<left>_<right>" AS
SELECT <collision-safe select list>
FROM "<left>" AS l
<INNER|LEFT> JOIN "<right>" AS r
  ON l."<leftColumn>" = r."<rightColumn>"
```

- **View name** via `uniqueTableName(`join_${left}_${right}`, existingNames)` — same sanitizer, guaranteed unique and safe.
- **Column-name collision handling (decided).** Build the SELECT list explicitly in code, never `SELECT *`. Left columns keep their names. A right column whose name also exists on the left is aliased with the right table's name as a prefix: `r."total" AS "customers_total"`. The join key from the right side is dropped from the select list by default (it duplicates the left key value under an inner join and is redundant); it can be kept aliased if `joinType = left` and the user wants to see unmatched-right nulls — MVP keeps it dropped for simplicity. The alias map is deterministic and produced by a small **pure helper** (`buildJoinSelectList(leftColumns, rightColumns, keys)`), worth a test but secondary to the three primary units.
- **Reuse.** `profileTable(db, viewName)` runs unchanged against the view (DuckDB profiles a view like a table). The resulting `TableProfile` is stored as a `DataTable` with `kind: "join"`. Setting it active makes the entire plan/summary/chat flow run over it with **zero special-casing** — the whole point of conforming to `TableProfile`.
- **Preview** for the view uses the same `date`-cast preview query, parameterized by the view name.

### 6. Fan-out safety (Slice 2)

Cardinality direction is measured during overlap (Decision 2), not guessed. When the confirmed join is `one-to-many` / `many-to-one`, `JoinPanel` and the joined-table entry surface a plain-language warning: e.g. "Cada fila de `customers` se repite por cada `order` — los totales suman filas duplicadas; leé las sumas con cuidado." The warning is data on the `DataTable` (`fanOutWarning?: string`), rendered wherever the joined table is used, so a user reading a KPI over the view has the context.

**Deferred (documented):** full fan-out-safe aggregation — rewriting aggregates to pre-aggregate the many side before joining, or dimension-vs-fact-aware SQL generation. That is a query-planning change beyond this slice; the MVP surfaces the risk to the human rather than silently correcting it, consistent with the app's confirmation-over-automation stance.

### 7. UI (both slices)

Reuses the existing design tokens (`--card`, `--border`, `--brand`, `--radius-card`, `--shadow-card`, type-color labels from the Phase 1 signature moment). Copy in Spanish, active voice, sentence case; identifiers/comments in English.

- **Slice 1 — `TableSwitcher`** (`components/data/`): a compact list/segmented control of uploaded tables (file name + row count), the active one highlighted with `--brand`. Click activates (and clears derived plan/summary/chat, per Decision 1). Each entry has an inspect affordance (opens the profile + preview it already renders) and a remove control. Adding a file appends without disturbing others. Empty/loading/error per table degrade independently — one file failing to parse never blocks the others.
- **Slice 2 — `JoinPanel`** (`components/data/`): appears only when `detectKeys` found ≥1 candidate. Extends the "the app reads your files" signature to "the app sees how your files relate." Shows the inferred join in plain language with its overlap evidence and, when `estimated`, an "approximate" note. Controls: **confirm** (builds the view, activates it), **correct** (swap key columns among candidates, toggle `inner`/`left`), **reject** (dismiss, stay per-table). When the model returns nothing or low confidence, the panel simply does not offer a join. No candidates at all → no panel. Never auto-applies.
- **Graceful per-table degradation** is the through-line: any failure in detection, inference, or view building leaves the per-table experience intact.

### 8. Strict TDD — pure units, tests first (Vitest, `npm run test`)

Strict TDD is active. Write failing tests first for the pure units, then implement. The DuckDB/route/UI glue is integration-tested lightly around these cores.

| Unit | File | What the test pins |
|------|------|--------------------|
| Table-registry reducers | `lib/store.reducers.test.ts` | `addTable` appends without disturbing others; `setActiveTable` clears derived slices; `updateActiveColumnType` scopes to active; `removeTable` re-activates + drops dependent join view |
| `uniqueTableName` | `lib/duckdb/tableName.test.ts` | sanitizes unsafe file names to valid identifiers; dedupes with `_2/_3` suffixes; deterministic |
| `rankCandidates` | `lib/joins/rankCandidates.test.ts` | applies `MIN_OVERLAP = 0.5`; derives coverage/overlap/cardinality; drops sub-threshold; ranks by overlap then distinct |
| `buildJoinsPayload` | `lib/ai/buildJoinsPayload.test.ts` | never leaks a row/data field; drops undocumented input fields; carries overlap + cardinality only |
| `resolveJoins` | `lib/ai/joinsFallback.test.ts` | re-asks once on invalid; rejects non-candidate column references; degrades on empty/low-confidence |
| `buildJoinSelectList` (secondary) | `lib/joins/buildJoinView.test.ts` | collision aliasing; drops redundant right key; deterministic |

## Slice boundary (shippable)

- **Slice 1 — multi-table base.** Store refactor + `uniqueTableName` + `TableSwitcher`. Ships and is verified with the full Phase 0–5 flow working over the active table, **before any join code exists**. This is the low-risk refactor the proposal isolates first.
- **Slice 2 — confirmed joins.** `detectKeys` + `rankCandidates` + `joinPlanSchema` + `api/joins` + `buildJoinsPayload`/`resolveJoins` + `buildJoinView` + `JoinPanel`. Additive on top of Slice 1; degradation-safe throughout.

## Open questions — resolved here

| Proposal question | Resolution |
|-------------------|------------|
| Overlap threshold | `MIN_OVERLAP = 0.5` of the smaller side's distinct values; coverage ≈ 1.0 marks the PK/"one" side for cardinality. |
| Sampling cutoff / size | `SAMPLE_ROW_THRESHOLD = 100_000`, `SAMPLE_SIZE = 50_000` via `USING SAMPLE`; sampled results flagged `estimated: true`. |
| Pre-run join on multi-table comment | Stay a **distinct user-initiated action**. Detection may run after ingest, but the join is only proposed/built through `JoinPanel` confirmation — never pre-applied. |
| `joinPlanSchema` join-type set | `inner` + `left` only for this change. |

## Assumptions to validate

- DuckDB-WASM `INTERSECT` on distinct sets and `USING SAMPLE` perform acceptably for typical browser datasets; confirmed during Slice 2 apply against realistic file sizes.
- `profileTable` runs unmodified against a `VIEW` (expected — it uses `DESCRIBE`/aggregate queries that treat views as tables). Verify at Slice 2 apply.
- Singularization for name matching (`customers` → `customer`) is a simple trailing-`s` heuristic this cut; broader morphology is out of scope.
