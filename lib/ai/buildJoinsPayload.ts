import type { ColumnProfile, TableProfile } from "@/lib/schemas";
import type { CandidateKey } from "@/lib/joins/rankCandidates";

/**
 * Golden-rule chokepoint for the joins route (design §4). This is the ONE
 * place where `TableProfile[]` + `CandidateKey[]` are projected into the
 * model payload — never widen this shape to include row-shaped data or raw
 * distinct values. Mirrors `buildPlanPayload`'s exact column projection.
 */
export type JoinsPayload = {
  tables: { tableName: string; rowCount: number; columns: JoinsPayloadColumn[] }[];
  candidateKeys: JoinsPayloadCandidate[];
  comment: string; // may be empty
};

type JoinsPayloadColumn = Pick<ColumnProfile, "name" | "rawType" | "semanticType" | "stats">;

type JoinsPayloadCandidate = {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  overlap: number;
  cardinality: CandidateKey["cardinality"];
  estimated: boolean;
};

/**
 * Projects `TableProfile[]` + `CandidateKey[]` + comment into the exact
 * metadata shape the model is allowed to see: per-table
 * `{ tableName, rowCount, columns }`, per-candidate
 * `{ leftTable, leftColumn, rightTable, rightColumn, overlap, cardinality,
 * estimated }`, and `comment`. Any extra field (e.g. an accidental
 * `rows`/`data` field, or raw `distinctLeft`/`distinctRight`/`shared`
 * counts) is dropped by construction — this function only reads the
 * documented fields, it never spreads the input objects.
 */
export function buildJoinsPayload(
  profiles: TableProfile[],
  candidateKeys: CandidateKey[],
  comment: string,
): JoinsPayload {
  return {
    tables: profiles.map((profile) => ({
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
    })),
    candidateKeys: candidateKeys.map((candidate) => ({
      leftTable: candidate.leftTable,
      leftColumn: candidate.leftColumn,
      rightTable: candidate.rightTable,
      rightColumn: candidate.rightColumn,
      overlap: candidate.overlap,
      cardinality: candidate.cardinality,
      estimated: candidate.estimated,
    })),
    comment,
  };
}
