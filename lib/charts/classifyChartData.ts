import type { Row } from "@/lib/duckdb/query";
import type { ChartType, WidgetEncoding } from "@/lib/schemas";
import { mapEncoding } from "./mapEncoding";

export type ChartDataClassification = "renderable" | "empty";

/** chartType families that need >=2 usable data points to render a chart. */
const MULTI_POINT_CHART_TYPES = new Set<ChartType>([
  "line",
  "bar",
  "donut",
  "scatter",
  "histogram",
]);

function isUsable(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/**
 * Rows with a usable data point (per widget-rendering spec's null-heavy
 * scenario: null points are omitted, not plotted as zero). The value axis
 * (`y`) is what's actually plotted/aggregated, so it drives usability; `x`
 * is only consulted as a fallback when no `y` column was resolved at all.
 */
function usableRowCount(rows: Row[], x: string | undefined, y: string | undefined): number {
  if (y) {
    return rows.filter((row) => isUsable(row[y])).length;
  }
  if (x) {
    return rows.filter((row) => isUsable(row[x])).length;
  }
  return 0;
}

/**
 * Centralized degenerate-data guard (design §3). Every chart/KPI component
 * shares this single empty-state decision instead of guarding individually.
 * Pure — no I/O.
 */
export function classifyChartData(
  rows: Row[],
  chartType: ChartType,
  encoding: WidgetEncoding | undefined,
): ChartDataClassification {
  if (rows.length === 0) return "empty";

  const { x, y } = mapEncoding(rows, encoding);
  const usable = usableRowCount(rows, x, y);

  if (usable === 0) return "empty";

  if (chartType === "kpi" || chartType === "table") {
    return "renderable";
  }

  if (MULTI_POINT_CHART_TYPES.has(chartType) && usable < 2) {
    return "empty";
  }

  return "renderable";
}
