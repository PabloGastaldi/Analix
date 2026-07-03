import type { Row } from "@/lib/duckdb/query";
import type { WidgetEncoding } from "@/lib/schemas";

/**
 * Resolved encoding — guaranteed to name columns that actually exist in
 * `rows` (or be `undefined` when no usable column was found).
 */
export interface ResolvedEncoding {
  x: string | undefined;
  y: string | undefined;
  series: string | undefined;
  valueFormat: WidgetEncoding["valueFormat"];
}

/**
 * A value that can be plotted on a value axis. DuckDB/Arrow hands back BIGINT
 * as a JS bigint and DECIMAL as a string, so a numeric string counts too —
 * otherwise a real value column silently fails to resolve and the chart is
 * blank. `ChartCard` coerces these to real numbers before handing them to
 * Recharts.
 */
function isNumericLike(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "bigint") return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed !== "" && Number.isFinite(Number(trimmed));
  }
  return false;
}

function isStringLike(value: unknown): boolean {
  return typeof value === "string";
}

/** A category label: a string that is not just a number (so a numeric-string value column isn't mistaken for the x axis). */
function isCategoryLike(value: unknown): boolean {
  return isStringLike(value) && !isNumericLike(value);
}

/** First column name (in row-key order) whose value satisfies `predicate` in the first row. */
function firstColumnMatching(
  rows: Row[],
  predicate: (value: unknown) => boolean,
): string | undefined {
  if (rows.length === 0) return undefined;
  const [firstRow] = rows;
  for (const key of Object.keys(firstRow)) {
    if (predicate(firstRow[key])) return key;
  }
  return undefined;
}

function columnExists(rows: Row[], column: string | undefined): boolean {
  if (!column || rows.length === 0) return false;
  return Object.prototype.hasOwnProperty.call(rows[0], column);
}

/**
 * Resolves `x`/`y`/`series` against the actual SQL result columns (design
 * §3). Falls back to "first category col = x, first numeric col = y" whenever
 * `encoding` is missing or names a column absent from `rows`. Numeric columns
 * that arrive as bigint or numeric strings (DuckDB BIGINT/DECIMAL) still count
 * as the value axis. Pure — no I/O.
 */
export function mapEncoding(
  rows: Row[],
  encoding: WidgetEncoding | undefined,
): ResolvedEncoding {
  const x = columnExists(rows, encoding?.x)
    ? encoding!.x
    : (firstColumnMatching(rows, isCategoryLike) ??
      firstColumnMatching(rows, isStringLike));

  const y = columnExists(rows, encoding?.y)
    ? encoding!.y
    : firstColumnMatching(rows, isNumericLike);

  const series = columnExists(rows, encoding?.series) ? encoding!.series : undefined;

  return { x, y, series, valueFormat: encoding?.valueFormat };
}
