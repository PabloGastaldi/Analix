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

  // Scale the type down as the number gets longer so large values (e.g.
  // "$15.641.400.000") stay inside the card instead of overflowing its edge.
  // `break-all` is the safety net for the extreme case; `title` keeps the full
  // value one hover away.
  const formatted = formatValue(value, valueFormat);
  const valueSize =
    formatted.length > 15
      ? "text-base"
      : formatted.length > 12
        ? "text-lg"
        : formatted.length > 9
          ? "text-2xl"
          : "text-3xl";

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {/* Block value (not a flex row) so a very long number wraps within the
          card instead of overflowing its edge; `break-all` is the safety net. */}
      <span
        title={formatted}
        className={cn(
          "break-all font-mono font-semibold leading-tight tabular-nums text-foreground",
          valueSize,
        )}
      >
        {formatted}
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
  );
}
