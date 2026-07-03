"use client";

import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";

export type Row = Record<string, unknown>;

/**
 * Coerce a DuckDB-WASM value to a plain JS value.
 *
 * DuckDB returns BIGINT/HUGEINT as JS `bigint`, and — critically — `SUM`/other
 * aggregates over an INTEGER column (and DECIMAL columns) come back as a
 * `DecimalBigNum` **object** whose `typeof` is `"object"` but which stringifies
 * to a number (e.g. "45"). Left as-is these break JSON, React, and every chart
 * encoder (which expect real numbers), so we coerce anything that cleanly
 * stringifies to a finite number. Genuinely non-numeric objects (Dates already
 * arrive as numbers/strings, typed arrays, etc.) fail the `isFinite` guard and
 * pass through untouched.
 */
export function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object") {
    const asNumber = Number(String(value));
    if (Number.isFinite(asNumber)) return asNumber;
  }
  return value;
}

/** Run a query and return plain JS rows with numeric values normalized. */
export async function runQuery(db: AsyncDuckDB, sql: string): Promise<Row[]> {
  const conn = await db.connect();
  try {
    const table = await conn.query(sql);
    return table.toArray().map((arrowRow) => {
      const row = arrowRow.toJSON() as Row;
      for (const key of Object.keys(row)) {
        row[key] = normalizeValue(row[key]);
      }
      return row;
    });
  } finally {
    await conn.close();
  }
}
