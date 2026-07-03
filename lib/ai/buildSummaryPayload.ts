import type {
  DashboardPlan,
  Row,
  SemanticType,
  TableProfile,
  WidgetResult,
} from "@/lib/schemas";

/** Bound the payload — chart widgets have few rows, but cap defensively. */
const MAX_WIDGET_ROWS = 12;

export interface SummaryColumn {
  name: string;
  semanticType: SemanticType;
  stats: {
    distinctCount: number;
    nullCount: number;
    min?: number | string;
    max?: number | string;
    mean?: number;
    stddev?: number;
  };
}

export interface SummaryWidget {
  title: string;
  chartType: string;
  /** Aggregated rows for chart widgets only — absent for `table` widgets. */
  rows?: Row[];
}

export interface SummaryPayload {
  dataset: {
    tableName: string;
    rowCount: number;
    columns: SummaryColumn[];
  };
  widgets: SummaryWidget[];
}

/**
 * Golden-rule chokepoint for the narrative summary (§Fase 3). Projects the
 * profile, plan, and widget results into a compact metadata payload:
 * - dataset stats WITHOUT `sampleValues` (those are near-raw example cells).
 * - per widget: title + chartType, plus the AGGREGATED result rows for chart
 *   widgets (capped), but NEVER the row-level data of a `table` widget.
 * The model narrates these DuckDB-computed numbers; it never sees raw rows.
 */
export function buildSummaryPayload(
  profile: TableProfile,
  plan: DashboardPlan,
  results: WidgetResult[],
): SummaryPayload {
  const columns: SummaryColumn[] = profile.columns.map((column) => {
    const { distinctCount, nullCount, min, max, mean, stddev } = column.stats;
    const stats: SummaryColumn["stats"] = { distinctCount, nullCount };
    if (min !== undefined) stats.min = min;
    if (max !== undefined) stats.max = max;
    if (mean !== undefined) stats.mean = mean;
    if (stddev !== undefined) stats.stddev = stddev;
    return { name: column.name, semanticType: column.semanticType, stats };
  });

  const widgets: SummaryWidget[] = plan.widgets.map((widget) => {
    const base: SummaryWidget = {
      title: widget.title,
      chartType: widget.chartType,
    };
    // Table widgets carry row-level data — send the title only.
    if (widget.chartType === "table") return base;
    const result = results.find((r) => r.widget.id === widget.id);
    if (result?.status === "ok") {
      base.rows = result.rows.slice(0, MAX_WIDGET_ROWS);
    }
    return base;
  });

  return {
    dataset: {
      tableName: profile.tableName,
      rowCount: profile.rowCount,
      columns,
    },
    widgets,
  };
}
