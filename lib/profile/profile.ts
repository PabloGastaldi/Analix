"use client";

import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import {
  tableProfileSchema,
  type ColumnProfile,
  type RawType,
  type TableProfile,
} from "@/lib/schemas";
import { runQuery } from "@/lib/duckdb/query";
import { inferSemanticType } from "./semanticType";

/** Quote a SQL identifier, escaping embedded double quotes. */
function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function mapDuckdbType(type: string): { rawType: RawType; isInteger: boolean } {
  const t = type.toUpperCase();
  if (t.includes("BOOL")) return { rawType: "boolean", isInteger: false };
  if (/DATE|TIMESTAMP|TIME/.test(t)) return { rawType: "date", isInteger: false };
  if (/INT/.test(t)) return { rawType: "number", isInteger: true };
  if (/DECIMAL|DOUBLE|FLOAT|REAL|NUMERIC/.test(t))
    return { rawType: "number", isInteger: false };
  if (/VARCHAR|CHAR|TEXT|STRING|UUID/.test(t))
    return { rawType: "string", isInteger: false };
  return { rawType: "mixed", isInteger: false };
}

function coerceSample(value: unknown): string | number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return String(value);
}

/**
 * Deterministic table profiling. Runs aggregate SQL per column in DuckDB, then
 * applies the semantic-typing heuristics. No AI involved. Result is validated
 * against `tableProfileSchema` before it leaves this function.
 */
export async function profileTable(
  db: AsyncDuckDB,
  tableName: string,
): Promise<TableProfile> {
  const table = q(tableName);
  const described = await runQuery(db, `DESCRIBE ${table}`);
  const [{ total }] = await runQuery(
    db,
    `SELECT COUNT(*) AS total FROM ${table}`,
  );
  const rowCount = Number(total ?? 0);

  const columns: ColumnProfile[] = [];

  for (const d of described) {
    const name = String(d.column_name);
    const { rawType, isInteger } = mapDuckdbType(String(d.column_type));
    const col = q(name);
    const numeric = rawType === "number";

    const statsSql = `
      SELECT
        COUNT(${col}) AS non_null,
        COUNT(DISTINCT ${col}) AS distinct_cnt,
        CAST(MIN(${col}) AS VARCHAR) AS min_v,
        CAST(MAX(${col}) AS VARCHAR) AS max_v
        ${numeric ? `, AVG(CAST(${col} AS DOUBLE)) AS mean_v, STDDEV_SAMP(CAST(${col} AS DOUBLE)) AS stddev_v` : ""}
      FROM ${table}`;
    const [agg] = await runQuery(db, statsSql);

    const sampleRows = await runQuery(
      db,
      `SELECT DISTINCT ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL LIMIT 5`,
    );

    const nonNull = Number(agg.non_null ?? 0);
    const distinctCount = Number(agg.distinct_cnt ?? 0);

    const stats: ColumnProfile["stats"] = {
      count: rowCount,
      nullCount: rowCount - nonNull,
      distinctCount,
      sampleValues: sampleRows.map((r) => coerceSample(r.v)),
    };
    if (agg.min_v != null) stats.min = String(agg.min_v);
    if (agg.max_v != null) stats.max = String(agg.max_v);
    if (numeric && agg.mean_v != null) stats.mean = Number(agg.mean_v);
    if (numeric && agg.stddev_v != null) stats.stddev = Number(agg.stddev_v);

    const semanticType = inferSemanticType({
      name,
      rawType,
      isInteger,
      stats: { count: rowCount, distinctCount },
    });

    columns.push({ name, rawType, semanticType, stats });
  }

  return tableProfileSchema.parse({ tableName, rowCount, columns });
}
