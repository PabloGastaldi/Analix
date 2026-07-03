"use client";

import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import { runQuery } from "./query";

export interface LoadedColumn {
  name: string;
  /** Raw DuckDB type, e.g. BIGINT, VARCHAR, DOUBLE, DATE. */
  duckdbType: string;
}

/**
 * Load CSV text into DuckDB as a table, letting `read_csv_auto` infer types.
 * Both CSV and XLSX inputs funnel through here as CSV text (single ingest path).
 */
export async function loadCsvTable(
  db: AsyncDuckDB,
  tableName: string,
  csvText: string,
): Promise<LoadedColumn[]> {
  const fileName = `${tableName}.csv`;
  await db.registerFileText(fileName, csvText);

  const conn = await db.connect();
  try {
    await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
    await conn.query(
      `CREATE TABLE "${tableName}" AS
       SELECT * FROM read_csv_auto('${fileName}', header = true)`,
    );
  } finally {
    await conn.close();
  }

  const described = await runQuery(db, `DESCRIBE "${tableName}"`);
  return described.map((row) => ({
    name: String(row.column_name),
    duckdbType: String(row.column_type),
  }));
}
