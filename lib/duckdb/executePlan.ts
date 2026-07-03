import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import type { DashboardPlan, Widget, WidgetResult } from "@/lib/schemas";
import { runQuery, type Row } from "./query";

/** Max additional attempts after the first (design §2: "at most 2 retries"). */
const MAX_RETRIES = 2;
/** Total execution attempts per widget, including the first (1 initial + 2 retries). */
const MAX_ATTEMPTS = MAX_RETRIES + 1;

/**
 * Runs `widget.sql` against `db`, returning the rows on success.
 * Injected so the pure reducer in this module stays framework-free and
 * testable without a real DuckDB instance.
 */
export type RunQueryFn<TDb> = (db: TDb, sql: string) => Promise<Row[]>;

/**
 * Produces a corrected SQL string from the failing query and the DuckDB
 * error message. Injected (dependency inversion, design §2 ADR) — the real
 * implementation (deterministic fixer + correction endpoint) lands in
 * Work Unit 6; this pure core only drives the retry state machine.
 */
export type CorrectFn = (sql: string, errorMessage: string) => Promise<string>;

/** Post-execution classifier: zero rows -> empty, otherwise -> ok (design §2 "On success -> classify result"). */
export function classifyRows(rows: Row[]): "ok" | "empty" {
  return rows.length === 0 ? "empty" : "ok";
}

/**
 * Pure retry/classification core for a single widget (design §2, widget-sql-
 * execution spec's "Bounded SQL Correction Loop"). Drives the state machine
 * `attempt -> success | retry | give-up`, capped at `MAX_ATTEMPTS` (3) total
 * execution attempts — 1 initial + up to 2 retries. Never throws past this
 * boundary: on exhaustion the widget resolves to `status: "unavailable"`.
 *
 * `db` is an opaque handle forwarded to `runQuery` — this module has no
 * dependency on `AsyncDuckDB` so it stays a pure core (IO shell added in
 * Work Unit 6).
 */
export async function attemptWidget<TDb>(
  db: TDb,
  widget: Widget,
  runQuery: RunQueryFn<TDb>,
  correct: CorrectFn,
): Promise<WidgetResult> {
  let sql = widget.sql;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const rows = await runQuery(db, sql);
      if (classifyRows(rows) === "empty") {
        return { widget, status: "empty" };
      }
      return { widget, status: "ok", rows, sql };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      const hasRetriesLeft = attempt < MAX_ATTEMPTS;
      if (!hasRetriesLeft) break;
      sql = await correct(sql, lastError);
    }
  }

  return { widget, status: "unavailable", reason: lastError };
}

/**
 * IO shell (Work Unit 6, design §2): executes every widget in `plan` against
 * a real `AsyncDuckDB` instance, driving the pure `attemptWidget` core above.
 *
 * Widgets resolve **independently** — each is its own `runQuery`/`correct`
 * loop via `Promise.all`, so a slow or failing widget never blocks the
 * others from settling (widget-sql-execution spec, "Widgets execute
 * independently"). `attemptWidget` never throws past its own boundary, so no
 * additional try/catch is needed here.
 *
 * `correct` here matches the WU4 pure-core `CorrectFn` shape (`sql,
 * errorMessage`) — callers that need the full `correctSql.correct(sql,
 * error, profile)` signature (which also needs the table schema) close over
 * `profile` when constructing the callback, e.g.
 * `(sql, error) => correct(sql, error, profile)`.
 */
export async function executePlan(
  db: AsyncDuckDB,
  plan: DashboardPlan,
  correct: CorrectFn,
): Promise<WidgetResult[]> {
  return Promise.all(
    plan.widgets.map((widget) => attemptWidget(db, widget, runQuery, correct)),
  );
}
