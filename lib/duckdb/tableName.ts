/**
 * Sanitize a file name into a unique, safe DuckDB identifier (design §1).
 * Pure — no DuckDB, no I/O. Deterministic given the same
 * `(fileName, existingNames)` pair.
 */

const MAX_LENGTH = 64;

/** Strip the extension, lowercase, replace any non `[a-z0-9]` run with `_`, collapse. */
function sanitize(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const lowered = withoutExtension.toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9]+/g, "_");
  const collapsed = replaced.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  return collapsed;
}

/**
 * Sanitize `fileName` into a valid, unique DuckDB table identifier that does
 * not collide with any name in `existingNames`. Lowercase, `[a-z0-9_]` only,
 * `t_` prefix when the sanitized result would start with a digit or is empty,
 * collision-suffixed with `_2`, `_3`, … .
 */
export function uniqueTableName(fileName: string, existingNames: string[]): string {
  let base = sanitize(fileName);
  if (base.length === 0 || /^[0-9]/.test(base)) {
    base = `t_${base}`;
  }
  base = base.slice(0, MAX_LENGTH);
  // Re-trim a trailing underscore left behind by truncation.
  base = base.replace(/_+$/, "") || "t_table";

  const existing = new Set(existingNames);
  if (!existing.has(base)) return base;

  let suffix = 2;
  let candidate = `${base}_${suffix}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  return candidate;
}
