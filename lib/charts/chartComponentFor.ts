import type { ChartType } from "@/lib/schemas";

/**
 * chartType -> Recharts component key (design §3 decision table). Pure,
 * single source of truth. Returns a component *key*, not a React component,
 * so this module stays framework-free and unit-testable; `ChartCard`
 * (Work Unit 7) maps the key to an actual Recharts import.
 *
 * | chartType | key         | Recharts component      |
 * |-----------|-------------|--------------------------|
 * | kpi       | "kpi"       | KpiCard (no Recharts)   |
 * | line      | "line"      | LineChart + Line        |
 * | bar       | "bar"       | BarChart + Bar          |
 * | donut     | "donut"     | PieChart + Pie          |
 * | scatter   | "scatter"   | ScatterChart + Scatter  |
 * | histogram | "histogram" | BarChart (pre-binned)   |
 * | table     | "table"     | plain table              |
 */
export type ChartComponentKey =
  | "kpi"
  | "line"
  | "bar"
  | "donut"
  | "scatter"
  | "histogram"
  | "table";

const CHART_COMPONENT_TABLE: Record<ChartType, ChartComponentKey> = {
  kpi: "kpi",
  line: "line",
  bar: "bar",
  donut: "donut",
  scatter: "scatter",
  histogram: "histogram",
  table: "table",
};

export function chartComponentFor(chartType: ChartType): ChartComponentKey {
  return CHART_COMPONENT_TABLE[chartType];
}
