import type { ColumnStats, RawType, SemanticType } from "@/lib/schemas";

export interface SemanticTypeInput {
  name: string;
  rawType: RawType;
  isInteger: boolean;
  stats: Pick<ColumnStats, "count" | "distinctCount">;
}

/** Below this distinct count, a column reads as a few discrete categories. */
const LOW_CARDINALITY = 15;
/** At/above this distinct-to-row ratio, a column is effectively unique. */
const UNIQUE_RATIO = 0.9;

const TEMPORAL_NAME =
  /fecha|date|a[nñ]o|year|periodo|per[ií]odo|mes|month|d[ií]a|\bday\b|timestamp/i;
const MEASURE_NAME =
  /precio|price|monto|amount|total|importe|cantidad|qty|quantity|cost|costo|venta|sales|revenue|ingreso|profit|margen/i;
const ID_NAME = /(^|_|\b)(id|uuid|guid|codigo|c[oó]digo|code|sku)(\b|_|$)/i;

/**
 * Deterministic semantic typing (§5). Pure function — no I/O, no DuckDB. This is
 * a best-effort heuristic; the user can always correct a column's type in the UI.
 */
export function inferSemanticType(input: SemanticTypeInput): SemanticType {
  const { name, rawType, isInteger, stats } = input;
  const { count, distinctCount } = stats;
  const distinctRatio = count > 0 ? distinctCount / count : 0;

  if (rawType === "boolean") return "boolean";
  if (rawType === "date") return "temporal";

  if (rawType === "number") {
    // Almost-unique integers -> identifier (id, code stored as number).
    if (isInteger && (distinctRatio >= 0.98 || (distinctRatio >= UNIQUE_RATIO && ID_NAME.test(name)))) {
      return "id";
    }
    // Few distinct integers -> disguised category (rating, year), unless the
    // column name clearly denotes a measured quantity.
    if (isInteger && distinctCount > 0 && distinctCount < LOW_CARDINALITY) {
      return MEASURE_NAME.test(name) ? "measure_discrete" : "categorical_low";
    }
    return isInteger ? "measure_discrete" : "measure_continuous";
  }

  if (rawType === "string") {
    if (TEMPORAL_NAME.test(name)) return "temporal";
    if (ID_NAME.test(name) && distinctRatio >= UNIQUE_RATIO) return "id";
    if (distinctCount > 0 && distinctCount <= LOW_CARDINALITY) return "categorical_low";
    // Many repeated values -> high-cardinality category; mostly-unique -> text.
    if (distinctRatio < 0.5) return "categorical_high";
    return "text";
  }

  return "text";
}
