import { formatValue } from "@/lib/charts";
import type { ValueFormat } from "@/lib/schemas";
import { cn } from "@/lib/utils";

/**
 * Single-value KPI display (design §4, widget-rendering spec "Single-value
 * result on a KPI widget"). Not a Recharts component — `chartComponentFor`
 * returns `"kpi"` for this case (design §3), handled directly by `ChartCard`.
 *
 * `null`/missing -> `formatValue` already renders `"—"`, never blank or
 * `NaN`. `delta` is optional (no `delta` field exists on `Widget`/
 * `WidgetEncoding` yet) — when provided, its sign drives
 * `--positive`/`--negative` coloring.
 */
export function KpiCard({
  label,
  value,
  valueFormat,
  delta,
}: {
  label: string;
  value: unknown;
  valueFormat: ValueFormat | undefined;
  delta?: number;
}) {
  const showDelta = typeof delta === "number" && Number.isFinite(delta);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {formatValue(value, valueFormat)}
        </span>
        {showDelta ? (
          <span
            className={cn(
              "font-mono text-sm font-medium tabular-nums",
              delta >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {delta >= 0 ? "+" : ""}
            {formatValue(delta, valueFormat)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
