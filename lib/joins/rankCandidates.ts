/**
 * Pure ranking/threshold logic over precomputed value-set-overlap stats
 * (design §2). No DuckDB, no I/O — `detectKeys` (Stage B) supplies the raw
 * `{distinctLeft, distinctRight, shared}` counts per candidate pair; this
 * function applies `MIN_OVERLAP`, derives coverage/overlap/cardinality, and
 * sorts the result. `estimated` is never set here — it is the caller's
 * (`detectKeys`) responsibility to flag sampled pairs.
 */

export const MIN_OVERLAP = 0.5;

/** Raw counts for one name/type-compatible column pair (`detectKeys` Stage B). */
export interface RawCandidateStats {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  distinctLeft: number;
  distinctRight: number;
  shared: number;
}

/** Ranked, thresholded candidate key (design §2). */
export interface CandidateKey {
  leftTable: string;
  leftColumn: string;
  rightTable: string;
  rightColumn: string;
  distinctLeft: number;
  distinctRight: number;
  shared: number;
  /** `shared / min(distinctLeft, distinctRight)`. */
  overlap: number;
  coverageLeftToRight: number;
  coverageRightToLeft: number;
  cardinality: "one-to-one" | "one-to-many" | "many-to-one";
  /** Always `false` here — set by `detectKeys` when the pair was sampled. */
  estimated: boolean;
}

/** Coverage ≈ 1.0 marks the PK/"one" side (design §2 "Cardinality"). */
const FULL_COVERAGE_EPSILON = 1e-9;

function deriveCardinality(
  coverageLeftToRight: number,
  coverageRightToLeft: number,
): CandidateKey["cardinality"] {
  const leftIsFull = coverageLeftToRight >= 1 - FULL_COVERAGE_EPSILON;
  const rightIsFull = coverageRightToLeft >= 1 - FULL_COVERAGE_EPSILON;

  if (leftIsFull && rightIsFull) return "one-to-one";
  // Left fully covered by the shared set -> left is the "one" side -> many
  // rows on the right reference it -> one-to-many.
  if (leftIsFull) return "one-to-many";
  // Right fully covered -> right is the "one" side -> many-to-one.
  if (rightIsFull) return "many-to-one";
  // Neither side is fully covered: fall back to whichever side has lower
  // coverage as the "many" side, same direction rule.
  return coverageLeftToRight <= coverageRightToLeft ? "many-to-one" : "one-to-many";
}

/**
 * Applies `MIN_OVERLAP`, derives coverage/overlap/cardinality, drops
 * sub-threshold pairs, and sorts by `overlap` desc then `distinct` (the
 * larger side's distinct count) desc (design §2).
 */
export function rankCandidates(rawStats: RawCandidateStats[]): CandidateKey[] {
  const candidates: CandidateKey[] = [];

  for (const stat of rawStats) {
    const { distinctLeft, distinctRight, shared } = stat;
    const minDistinct = Math.min(distinctLeft, distinctRight);
    if (minDistinct <= 0) continue;

    const overlap = shared / minDistinct;
    if (overlap < MIN_OVERLAP) continue;

    const coverageLeftToRight = distinctLeft > 0 ? shared / distinctLeft : 0;
    const coverageRightToLeft = distinctRight > 0 ? shared / distinctRight : 0;

    candidates.push({
      leftTable: stat.leftTable,
      leftColumn: stat.leftColumn,
      rightTable: stat.rightTable,
      rightColumn: stat.rightColumn,
      distinctLeft,
      distinctRight,
      shared,
      overlap,
      coverageLeftToRight,
      coverageRightToLeft,
      cardinality: deriveCardinality(coverageLeftToRight, coverageRightToLeft),
      estimated: false,
    });
  }

  return candidates.sort((a, b) => {
    if (b.overlap !== a.overlap) return b.overlap - a.overlap;
    const aDistinct = Math.max(a.distinctLeft, a.distinctRight);
    const bDistinct = Math.max(b.distinctLeft, b.distinctRight);
    return bDistinct - aDistinct;
  });
}
