import type { ColumnProfile, TableProfile } from "@/lib/schemas";

/**
 * Metadata-only projection sent to the model (design §1, §7 "golden rule").
 * This is the ONE chokepoint where `TableProfile` fields are chosen for the
 * model payload — never widen this shape to include row-shaped data.
 */
export type PlanPayload = {
  tableName: string;
  rowCount: number;
  columns: PlanPayloadColumn[];
  comment: string;
};

type PlanPayloadColumn = Pick<ColumnProfile, "name" | "rawType" | "semanticType" | "stats">;

/**
 * Projects a `TableProfile` + user comment into the exact metadata shape the
 * model is allowed to see: `tableName`, `rowCount`, per-column
 * `{ name, rawType, semanticType, stats }`, and `comment`. Any extra field on
 * `profile` or its columns (e.g. an accidental `rows`/`data` field) is
 * dropped by construction — this function only reads the documented fields,
 * it never spreads the input object.
 */
export function buildPlanPayload(profile: TableProfile, comment: string): PlanPayload {
  return {
    tableName: profile.tableName,
    rowCount: profile.rowCount,
    columns: profile.columns.map((column) => ({
      name: column.name,
      rawType: column.rawType,
      semanticType: column.semanticType,
      stats: {
        count: column.stats.count,
        nullCount: column.stats.nullCount,
        distinctCount: column.stats.distinctCount,
        min: column.stats.min,
        max: column.stats.max,
        mean: column.stats.mean,
        stddev: column.stats.stddev,
        sampleValues: column.stats.sampleValues,
      },
    })),
    comment,
  };
}
