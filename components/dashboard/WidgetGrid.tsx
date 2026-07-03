"use client";

import { Component, type ReactNode } from "react";
import type { WidgetResult } from "@/lib/schemas";
import { ChartCard } from "./ChartCard";

/**
 * Per-tile error boundary (widget-rendering spec "Grid-Level Fault
 * Isolation"): if one widget's render throws (e.g. a malformed-encoding edge
 * case not caught by `classifyChartData`), only that tile degrades — the
 * rest of the grid renders unaffected.
 */
class WidgetTileBoundary extends Component<
  { title: string; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { title: string; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-32 flex-col gap-2 rounded-card border border-border bg-card p-5 shadow-card">
          <h3 className="text-sm font-medium text-foreground">{this.props.title}</h3>
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No disponible
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** `kpi` widgets span a single column; charts span two on wider screens (design §4). */
function spanClassFor(result: WidgetResult): string {
  return result.status === "ok" && result.widget.chartType === "kpi"
    ? "col-span-1"
    : "col-span-1 md:col-span-2";
}

/**
 * Maps `widgetResults` -> `ChartCard` tiles in a responsive grid (design §4).
 * `KpiCard` rendering happens inside `ChartCard` for `chartType: "kpi"`.
 */
export function WidgetGrid({ widgetResults }: { widgetResults: WidgetResult[] }) {
  if (widgetResults.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {widgetResults.map((result) => (
        <div key={result.widget.id} className={spanClassFor(result)}>
          <WidgetTileBoundary title={result.widget.title}>
            <ChartCard result={result} />
          </WidgetTileBoundary>
        </div>
      ))}
    </div>
  );
}
