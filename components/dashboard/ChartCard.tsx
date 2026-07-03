"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartComponentFor,
  classifyChartData,
  formatValue,
  mapEncoding,
} from "@/lib/charts";
import type { Row } from "@/lib/duckdb/query";
import type { WidgetResult } from "@/lib/schemas";
import { KpiCard } from "./KpiCard";
import { cn } from "@/lib/utils";

/** `--chart-1..5` cycled by series/category index (design §3 — no hardcoded hex). */
const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/** Below this, a large number is not epoch-ms (year 1973+). */
const EPOCH_MS_FLOOR = 1e11;

/**
 * Coerce a value-axis cell to a number. DuckDB/Arrow can hand back BIGINT as
 * a JS bigint and DECIMAL (e.g. a computed percentage) as a string; Recharts
 * only plots real numbers, so both must be coerced. Returns null for anything
 * non-numeric (Recharts skips null points).
 */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return null;
}

/** Ensure the plotted value column is numeric so line/bar/donut/scatter draw. */
function numericChartData(rows: Row[], y: string | undefined): Row[] {
  if (!y) return rows;
  return rows.map((row) => ({ ...row, [y]: toNumber(row[y]) }));
}

/** Temporal columns arrive as epoch-ms numbers — render them as readable dates. */
function formatAxisTick(value: unknown): string {
  if (typeof value === "number" && value >= EPOCH_MS_FLOOR) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
    }
  }
  return value == null ? "" : String(value);
}

/** Robust single-value pick for a KPI: resolved `y`, else first numeric, else first non-null. */
function resolveKpiValue(rows: Row[], y: string | undefined): unknown {
  const row = rows[0];
  if (!row) return undefined;
  const candidates = y ? [row[y], ...Object.values(row)] : Object.values(row);
  for (const candidate of candidates) {
    const numeric = toNumber(candidate);
    if (numeric != null) return numeric;
  }
  for (const candidate of candidates) {
    if (candidate != null) return candidate;
  }
  return undefined;
}

function CardShell({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-4 rounded-card border border-border bg-card p-5 shadow-card",
        className,
      )}
    >
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Quiet muted state — never an error banner (widget-rendering spec). */
function MutedState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/** Recharts' tooltip `Formatter` widens `value` to `ValueType | undefined`; `formatValue` already treats non-numeric input as `"—"`. */
function tooltipFormatter(valueFormat: ReturnType<typeof mapEncoding>["valueFormat"]) {
  return (value: unknown) => formatValue(value, valueFormat);
}

/**
 * Card shell + chart body for one widget (design §4). Picks the Recharts
 * component via `chartComponentFor`, uses `classifyChartData` to decide
 * renderable vs. empty, and renders a quiet "unavailable" state for widgets
 * the SQL executor gave up on — never an error banner or crash.
 */
export function ChartCard({ result }: { result: WidgetResult }) {
  if (result.status === "pending") {
    return (
      <CardShell title={result.widget.title}>
        <MutedState message="Calculando…" />
      </CardShell>
    );
  }

  if (result.status === "unavailable") {
    return (
      <CardShell title={result.widget.title}>
        <MutedState message="No disponible" />
      </CardShell>
    );
  }

  if (result.status === "empty") {
    return (
      <CardShell title={result.widget.title}>
        <MutedState message="Sin datos" />
      </CardShell>
    );
  }

  const { widget, rows } = result;
  const key = chartComponentFor(widget.chartType);
  const encoding = mapEncoding(rows, widget.encoding);

  // A KPI always shows its single value (or "—") — it is never gated behind the
  // multi-point "insufficient data" check, which is meant for real charts.
  if (key === "kpi") {
    return (
      <CardShell title={widget.title}>
        <KpiCard
          label={widget.title}
          value={resolveKpiValue(rows, encoding.y)}
          valueFormat={encoding.valueFormat}
        />
      </CardShell>
    );
  }

  const classification = classifyChartData(rows, widget.chartType, widget.encoding);
  if (classification === "empty") {
    return (
      <CardShell title={widget.title}>
        <MutedState message="No hay suficientes datos para este gráfico" />
      </CardShell>
    );
  }

  if (key === "table") {
    const columns = Object.keys(rows[0] ?? {});
    return (
      <CardShell title={widget.title}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} className="pb-2 pr-4 font-medium text-muted-foreground">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} className="border-t border-border">
                  {columns.map((column) => (
                    <td key={column} className="py-1.5 pr-4 tabular-nums">
                      {formatValue(row[column], encoding.valueFormat) === "—" &&
                      typeof row[column] !== "number"
                        ? String(row[column] ?? "—")
                        : formatValue(row[column], encoding.valueFormat)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardShell>
    );
  }

  const { x, y } = encoding;
  const data = numericChartData(rows, y);

  return (
    <CardShell title={widget.title}>
      <ResponsiveContainer width="100%" height={220}>
        {key === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey={x} tick={{ fontSize: 12 }} tickFormatter={formatAxisTick} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={tooltipFormatter(encoding.valueFormat)}
              labelFormatter={formatAxisTick}
            />
            <Line
              type="monotone"
              dataKey={y}
              stroke={CHART_COLORS[0]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        ) : key === "bar" || key === "histogram" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey={x} tick={{ fontSize: 12 }} tickFormatter={formatAxisTick} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={tooltipFormatter(encoding.valueFormat)}
              labelFormatter={formatAxisTick}
            />
            <Bar dataKey={y} fill={CHART_COLORS[0]} isAnimationActive={false} />
          </BarChart>
        ) : key === "donut" ? (
          <PieChart>
            <Tooltip formatter={tooltipFormatter(encoding.valueFormat)} />
            <Pie
              data={data.map((row, index) => ({
                ...row,
                fill: CHART_COLORS[index % CHART_COLORS.length],
              }))}
              dataKey={y ?? ""}
              nameKey={x}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={85}
              isAnimationActive={false}
            />
          </PieChart>
        ) : (
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey={x} tick={{ fontSize: 12 }} tickFormatter={formatAxisTick} />
            <YAxis dataKey={y} tick={{ fontSize: 12 }} />
            <Tooltip formatter={tooltipFormatter(encoding.valueFormat)} />
            <Scatter data={data} fill={CHART_COLORS[0]} isAnimationActive={false} />
          </ScatterChart>
        )}
      </ResponsiveContainer>
    </CardShell>
  );
}
