import { z } from "zod";

/**
 * Dashboard-plan contracts (§5). This is what the LLM returns: a JSON list of
 * widgets, each with the SQL that feeds it. Validated with Zod BEFORE any SQL
 * touches DuckDB. The number always comes from the engine, never from the model.
 */

export const chartTypeSchema = z.enum([
  "kpi",
  "line",
  "bar",
  "donut",
  "scatter",
  "histogram",
  "table",
]);
export type ChartType = z.infer<typeof chartTypeSchema>;

export const valueFormatSchema = z.enum(["number", "currency", "percent"]);
export type ValueFormat = z.infer<typeof valueFormatSchema>;

export const widgetEncodingSchema = z.object({
  x: z.string().optional(),
  y: z.string().optional(),
  series: z.string().optional(),
  valueFormat: valueFormatSchema.optional(),
});
export type WidgetEncoding = z.infer<typeof widgetEncodingSchema>;

export const widgetSchema = z.object({
  id: z.string(),
  /** In the user's language. */
  title: z.string(),
  chartType: chartTypeSchema,
  /** Query that feeds this widget. */
  sql: z.string(),
  /** How to map the SQL result onto the chart. */
  encoding: widgetEncodingSchema.optional(),
  /** Why this widget is relevant (optional, for debug). */
  rationale: z.string().optional(),
});
export type Widget = z.infer<typeof widgetSchema>;

export const dashboardPlanSchema = z.object({
  title: z.string(),
  /**
   * Target is 4-8 widgets (a prompt-level guideline). Kept lenient here so a
   * short-but-valid plan still passes and degrades gracefully.
   */
  widgets: z.array(widgetSchema).min(1),
});
export type DashboardPlan = z.infer<typeof dashboardPlanSchema>;

/**
 * Per-widget execution outcome (design §2). Discriminated on `status` so
 * rendering never needs try/catch — degradation is data, not exceptions.
 * `sql` on `ok` is the final (possibly corrected) query that produced `rows`.
 *
 * `pending` is a store-only placeholder status (design §5, Work Unit 8):
 * `applyPlan` seeds one `pending` entry per widget immediately after a plan
 * is received, before `executePlan` has resolved any of them, so
 * `WidgetGrid` can render a loading tile per widget instead of nothing.
 * `executePlan` (Work Unit 6) never produces `pending` — only `ok` / `empty`
 * / `unavailable`.
 */
export type WidgetResult =
  | { widget: Widget; status: "ok"; rows: Row[]; sql: string }
  | { widget: Widget; status: "empty" }
  | { widget: Widget; status: "unavailable"; reason: string }
  | { widget: Widget; status: "pending" };

/**
 * Minimal row shape from the DuckDB executor. Declared here (not imported
 * from `lib/duckdb/query.ts`) to keep this schema module free of client-only
 * imports; `lib/duckdb/query.ts`'s `Row` is structurally identical.
 */
export type Row = Record<string, unknown>;

/** Structured, user-safe error returned by the plan route on failure. */
export type PlanError = {
  code: "invalid_request" | "model_error" | "rate_limited" | "unexpected";
  message: string;
};

/**
 * Store-level plan lifecycle (design §5). Drives `CommentInput`'s pending
 * state and `WidgetGrid`'s per-widget rendering.
 */
export type PlanStatus = "idle" | "planning" | "executing" | "ready" | "error";
