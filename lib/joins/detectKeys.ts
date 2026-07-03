"use client";

import type { AsyncDuckDB } from "@duckdb/duckdb-wasm";
import type { ColumnProfile, TableProfile } from "@/lib/schemas";
import { runQuery } from "@/lib/duckdb/query";
import { rankCandidates, type CandidateKey, type RawCandidateStats } from "./rankCandidates";

/**
 * Deterministic candidate-key detection (design §2). Two stages: a pure
 * name/type compatibility gate (Stage A), then a DuckDB value-set overlap
 * measurement (Stage B) fed into the pure `rankCandidates`. Runs after
 * ingest settles — never on the ingest critical path.
 */

/** Above this row count, overlap is measured on a bounded sample. */
export const SAMPLE_ROW_THRESHOLD = 100_000;
/** Reservoir sample size used above `SAMPLE_ROW_THRESHOLD`. */
export const SAMPLE_SIZE = 50_000;

/** Column semantic types plausible as a join key (design §2 Stage A). */
const KEY_SEMANTIC_TYPES = new Set<ColumnProfile["semanticType"]>([
  "id",
  "categorical_low",
  "categorical_high",
]);

/** Quote a SQL identifier, escaping embedded double quotes. */
function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Normalize a column name for compatibility matching: lowercase, strip
 * non-alphanumerics, drop a trailing `id`/`_id`/`key` token to a base token
 * (design §2 Stage A "Name compatibility").
 */
function normalizeName(name: string): { normalized: string; base: string } {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const base = normalized.replace(/(id|key)$/, "");
  return { normalized, base };
}

/** Naive trailing-`s` singularization, per design "Assumptions to validate." */
function singularize(name: string): string {
  return name.toLowerCase().endsWith("s") ? name.toLowerCase().slice(0, -1) : name.toLowerCase();
}

/**
 * Two columns are name-compatible if their normalized names are equal, or
 * one normalized name equals the other's base + the other TABLE's
 * singularized name (`customers.id` <-> `orders.customer_id`).
 */
function namesCompatible(
  leftColumn: string,
  leftTable: string,
  rightColumn: string,
  rightTable: string,
): boolean {
  const left = normalizeName(leftColumn);
  const right = normalizeName(rightColumn);

  if (left.normalized === right.normalized) return true;

  const leftTableSingular = singularize(leftTable).replace(/[^a-z0-9]+/g, "");
  const rightTableSingular = singularize(rightTable).replace(/[^a-z0-9]+/g, "");

  // right.base + right table's own singular name (unusual) is not meaningful;
  // instead check: left.base matches the OTHER table's singular name, and
  // right column is a bare key ("id"), or vice versa.
  if (right.base === rightTableSingular && left.base === rightTableSingular) return true;
  if (left.base === leftTableSingular && right.base === leftTableSingular) return true;

  // customers.id (base="") <-> orders.customer_id (base="customer")
  if (right.base.length === 0 && left.base === rightTableSingular) return true;
  if (left.base.length === 0 && right.base === leftTableSingular) return true;

  return false;
}

/** Column is plausible as a join key: id/categorical semantic type. */
function isKeyPlausible(column: ColumnProfile): boolean {
  return KEY_SEMANTIC_TYPES.has(column.semanticType);
}

/** One Stage-A (name/type compatible) candidate pair, pre-overlap-measurement. */
export interface NameTypeCandidate {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
}

/**
 * Stage A (pure): pairs columns across two profiles that are plausibly keys
 * by semantic type, matching `rawType`, and name compatibility. No DB call.
 */
export function findNameTypeCandidates(left: TableProfile, right: TableProfile): NameTypeCandidate[] {
  const candidates: NameTypeCandidate[] = [];

  for (const leftColumn of left.columns) {
    if (!isKeyPlausible(leftColumn)) continue;

    for (const rightColumn of right.columns) {
      if (!isKeyPlausible(rightColumn)) continue;
      // Both number, or both string; `mixed` is skipped this cut.
      if (leftColumn.rawType !== rightColumn.rawType) continue;
      if (leftColumn.rawType !== "number" && leftColumn.rawType !== "string") continue;

      if (
        namesCompatible(leftColumn.name, left.tableName, rightColumn.name, right.tableName)
      ) {
        candidates.push({
          leftTable: left.tableName,
          leftColumn: leftColumn.name,
          rightTable: right.tableName,
          rightColumn: rightColumn.name,
        });
      }
    }
  }

  return candidates;
}

/** Builds the (possibly sampled) source expression for overlap measurement. */
function overlapSource(tableName: string, rowCount: number): { sql: string; estimated: boolean } {
  const table = q(tableName);
  if (rowCount > SAMPLE_ROW_THRESHOLD) {
    return { sql: `(SELECT * FROM ${table} USING SAMPLE ${SAMPLE_SIZE} ROWS)`, estimated: true };
  }
  return { sql: table, estimated: false };
}

/**
 * Stage B (DuckDB): for each Stage-A candidate pair, measure directional
 * value-set overlap via `COUNT(DISTINCT)` + `INTERSECT` (design §2). Applies
 * the sampling cutoff and flags sampled pairs as `estimated`.
 */
export async function detectKeys(
  db: AsyncDuckDB,
  tables: TableProfile[],
): Promise<CandidateKey[]> {
  const rawStats: RawCandidateStats[] = [];
  const estimatedFlags = new Map<string, boolean>();

  for (let i = 0; i < tables.length; i += 1) {
    for (let j = 0; j < tables.length; j += 1) {
      if (i === j) continue;
      const left = tables[i]!;
      const right = tables[j]!;
      // Unordered pairs: only process i < j to avoid measuring both
      // directions of the same pair redundantly (candidates are symmetric
      // for overlap; left/right in the output still reflects table order).
      if (i > j) continue;

      const nameTypeCandidates = findNameTypeCandidates(left, right);
      for (const candidate of nameTypeCandidates) {
        const leftSrc = overlapSource(left.tableName, left.rowCount);
        const rightSrc = overlapSource(right.tableName, right.rowCount);
        const estimated = leftSrc.estimated || rightSrc.estimated;

        const sql = `
          SELECT
            (SELECT COUNT(DISTINCT ${q(candidate.leftColumn)}) FROM ${leftSrc.sql}) AS distinct_left,
            (SELECT COUNT(DISTINCT ${q(candidate.rightColumn)}) FROM ${rightSrc.sql}) AS distinct_right,
            (SELECT COUNT(*) FROM (
               SELECT DISTINCT ${q(candidate.leftColumn)} AS v FROM ${leftSrc.sql}
               INTERSECT
               SELECT DISTINCT ${q(candidate.rightColumn)} AS v FROM ${rightSrc.sql}
             )) AS shared
        `;

        const [row] = await runQuery(db, sql);
        if (!row) continue;

        const distinctLeft = Number(row.distinct_left ?? 0);
        const distinctRight = Number(row.distinct_right ?? 0);
        const shared = Number(row.shared ?? 0);

        const key = `${candidate.leftTable}.${candidate.leftColumn}::${candidate.rightTable}.${candidate.rightColumn}`;
        estimatedFlags.set(key, estimated);

        rawStats.push({
          leftTable: candidate.leftTable,
          leftColumn: candidate.leftColumn,
          rightTable: candidate.rightTable,
          rightColumn: candidate.rightColumn,
          distinctLeft,
          distinctRight,
          shared,
        });
      }
    }
  }

  return rankCandidates(rawStats).map((ranked) => {
    const key = `${ranked.leftTable}.${ranked.leftColumn}::${ranked.rightTable}.${ranked.rightColumn}`;
    return { ...ranked, estimated: estimatedFlags.get(key) ?? false };
  });
}
