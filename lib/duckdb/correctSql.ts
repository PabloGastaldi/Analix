/**
 * Two-layer SQL correction (design §2 ADR: "Correction via injected
 * correct(sql,error,schema): deterministic fixer first, endpoint fallback").
 *
 * 1. `deterministicFix` — cheap, no-network fixes for common DuckDB errors:
 *    unquoted table identifier, obvious column-name typo vs. the known
 *    profile columns. Returns `null` when it cannot confidently fix the SQL,
 *    signalling the caller to fall back to the network layer.
 * 2. `correct` — the `CorrectFn` implementation wired into `executePlan`.
 *    Tries `deterministicFix` first; on `null`, POSTs `{ mode: "correct",
 *    sql, error, profile }` to the existing `/api/plan` route (metadata
 *    only — no rows, per the golden rule) and returns the corrected SQL.
 */

/** Minimal schema shape this module needs — table name + known column names. */
export type CorrectionProfile = {
  tableName: string;
  columns: string[];
};

const MAX_TYPO_DISTANCE = 2;

/** Standard Levenshtein edit distance between two strings. */
function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) distances[i]![0] = i;
  for (let j = 0; j < cols; j++) distances[0]![j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i]![j] = Math.min(
        distances[i - 1]![j]! + 1,
        distances[i]![j - 1]! + 1,
        distances[i - 1]![j - 1]! + cost,
      );
    }
  }

  return distances[rows - 1]![cols - 1]!;
}

/** Nearest known column to `candidate` within `MAX_TYPO_DISTANCE`, or `null`. */
function nearestColumn(candidate: string, columns: string[]): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const column of columns) {
    const distance = levenshtein(candidate.toLowerCase(), column.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = column;
    }
  }

  return best !== null && bestDistance > 0 && bestDistance <= MAX_TYPO_DISTANCE ? best : null;
}

/** Replaces every whole-word occurrence of `from` with `to` in `sql`. */
function replaceIdentifier(sql: string, from: string, to: string): string {
  const pattern = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  return sql.replace(pattern, to);
}

/** Quotes an unquoted `tableName` occurrence in `sql`, if not already quoted. */
function quoteTableIdentifier(sql: string, tableName: string): string {
  const alreadyQuoted = new RegExp(`"${tableName}"`).test(sql);
  if (alreadyQuoted) return sql;

  const pattern = new RegExp(`\\b${tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  return sql.replace(pattern, `"${tableName}"`);
}

/**
 * Extracts the column name DuckDB flagged as missing from a Binder Error
 * message, e.g. `Referenced column "regoin" not found in FROM clause!`.
 */
function extractMissingColumn(error: string): string | null {
  const match = error.match(/Referenced column "([^"]+)" not found/i);
  return match?.[1] ?? null;
}

/** True when `error` indicates the table identifier itself was not found. */
function isMissingTableError(error: string, tableName: string): boolean {
  const catalogError = /Catalog Error:.*(does not exist|not found)/i.test(error);
  return catalogError && error.includes(tableName);
}

/**
 * Deterministic, no-network SQL fixer. Returns the corrected SQL string on a
 * confident fix, or `null` when the error doesn't match a known pattern (the
 * caller should fall back to the network correction layer).
 */
export function deterministicFix(
  sql: string,
  error: string,
  tableName: string,
  columns: string[],
): string | null {
  if (isMissingTableError(error, tableName)) {
    const quoted = quoteTableIdentifier(sql, tableName);
    return quoted !== sql ? quoted : null;
  }

  const missingColumn = extractMissingColumn(error);
  if (missingColumn) {
    const nearest = nearestColumn(missingColumn, columns);
    if (nearest) {
      return replaceIdentifier(sql, missingColumn, nearest);
    }
  }

  return null;
}

/**
 * Default `CorrectFn` (see `lib/duckdb/executePlan.ts`): tries the
 * deterministic fixer first, then falls back to the `/api/plan` route's
 * `mode: "correct"` branch. Only `{ sql, error, profile }` metadata is sent —
 * never rows (golden rule).
 */
export async function correct(
  sql: string,
  error: string,
  profile: CorrectionProfile,
): Promise<string> {
  const deterministic = deterministicFix(sql, error, profile.tableName, profile.columns);
  if (deterministic) {
    return deterministic;
  }

  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "correct", sql, error, profile }),
  });

  if (!response.ok) {
    throw new Error(`SQL correction request failed with status ${response.status}`);
  }

  const body = (await response.json()) as { ok: boolean; sql?: string; error?: { message: string } };
  if (!body.ok || !body.sql) {
    throw new Error(body.error?.message ?? "SQL correction failed.");
  }

  return body.sql;
}
