"use client";

import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import type { DataTable } from "@/lib/store.reducers";
import { profileTable } from "@/lib/profile";
import { runQuery } from "@/lib/duckdb/query";
import { uniqueTableName } from "@/lib/duckdb/tableName";
import type { JoinType } from "@/lib/schemas";

/**
 * Build a confirmed join into a DuckDB `VIEW`, then profile it into a normal
 * `TableProfile` (design §5). Once profiled, the view is indistinguishable
 * from an ingested table to the plan/summary/chat flow.
 */

/** Quote a SQL identifier, escaping embedded double quotes. */
function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export interface JoinSelectEntry {
  source: "l" | "r";
  /** Original column name on its source table. */
  column: string;
  /** Output column name in the view (aliased on collision). */
  alias: string;
}

interface JoinSideColumns {
  tableName: string;
  columns: string[];
}

/**
 * Pure helper (design §5): builds a collision-safe, deterministic SELECT
 * list for a two-table join. Left columns keep their names and come first.
 * A right column whose name also exists on the left is aliased
 * `"<rightTable>_<name>"`. The right-side join key column is dropped by
 * default (redundant with the left key under the confirmed join semantics).
 */
export function buildJoinSelectList(
  left: JoinSideColumns,
  right: JoinSideColumns,
  keys: { leftColumn: string; rightColumn: string },
): JoinSelectEntry[] {
  const leftNames = new Set(left.columns);
  const entries: JoinSelectEntry[] = left.columns.map((column) => ({
    source: "l",
    column,
    alias: column,
  }));

  for (const column of right.columns) {
    if (column === keys.rightColumn) continue; // redundant with the left key
    const alias = leftNames.has(column) ? `${right.tableName}_${column}` : column;
    entries.push({ source: "r", column, alias });
  }

  return entries;
}

function toSelectListSql(entries: JoinSelectEntry[]): string {
  return entries
    .map((entry) => `${entry.source}.${q(entry.column)} AS ${q(entry.alias)}`)
    .join(", ");
}

export interface BuildJoinViewOptions {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  joinType: JoinType;
}

/**
 * Runs `CREATE VIEW "<name>" AS SELECT <list> FROM "<left>" AS l
 * <INNER|LEFT> JOIN "<right>" AS r ON l."<key>" = r."<key>"`, then profiles
 * the view and returns a `DataTable` with `kind: "join"` and
 * `dependsOn: [leftTable, rightTable]` (design §5). Only after this resolves
 * does the joined table exist — nothing is computed before confirmation.
 */
export async function buildJoinView(
  db: AsyncDuckDB,
  options: BuildJoinViewOptions,
  context: {
    leftColumns: string[];
    rightColumns: string[];
    existingTableNames: string[];
  },
): Promise<DataTable> {
  const { leftTable, leftColumn, rightTable, rightColumn, joinType } = options;

  const viewName = uniqueTableName(`join_${leftTable}_${rightTable}`, context.existingTableNames);

  const selectList = buildJoinSelectList(
    { tableName: leftTable, columns: context.leftColumns },
    { tableName: rightTable, columns: context.rightColumns },
    { leftColumn, rightColumn },
  );

  const joinKeyword = joinType === "left" ? "LEFT" : "INNER";
  const sql = `
    CREATE VIEW ${q(viewName)} AS
    SELECT ${toSelectListSql(selectList)}
    FROM ${q(leftTable)} AS l
    ${joinKeyword} JOIN ${q(rightTable)} AS r
      ON l.${q(leftColumn)} = r.${q(rightColumn)}
  `;

  await runQuery(db, sql);

  const profile = await profileTable(db, viewName);
  const previewRows = await runQuery(db, `SELECT * FROM ${q(viewName)} LIMIT 50`);

  return {
    tableName: viewName,
    fileName: viewName,
    profile,
    previewRows,
    kind: "join",
    dependsOn: [leftTable, rightTable],
  };
}
