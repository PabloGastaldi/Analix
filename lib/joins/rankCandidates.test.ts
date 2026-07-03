import { describe, expect, it } from "vitest";
import { rankCandidates, type RawCandidateStats } from "./rankCandidates";

function makeStats(overrides: Partial<RawCandidateStats> = {}): RawCandidateStats {
  return {
    leftTable: "orders",
    leftColumn: "customer_id",
    rightTable: "customers",
    rightColumn: "id",
    distinctLeft: 100,
    distinctRight: 100,
    shared: 100,
    ...overrides,
  };
}

describe("rankCandidates", () => {
  it("drops pairs below MIN_OVERLAP = 0.5 of the smaller side's distinct values", () => {
    const belowThreshold = makeStats({ distinctLeft: 100, distinctRight: 100, shared: 40 });
    const atThreshold = makeStats({
      leftColumn: "at_threshold",
      distinctLeft: 100,
      distinctRight: 100,
      shared: 50,
    });

    const result = rankCandidates([belowThreshold, atThreshold]);

    expect(result).toHaveLength(1);
    expect(result[0]?.leftColumn).toBe("at_threshold");
  });

  it("derives coverageLeftToRight, coverageRightToLeft, and overlap from {distinctLeft, distinctRight, shared}", () => {
    // distinctLeft=100, distinctRight=200, shared=80
    // coverageLeftToRight = shared/distinctLeft = 0.8
    // coverageRightToLeft = shared/distinctRight = 0.4
    // overlap = shared / min(distinctLeft, distinctRight) = 80/100 = 0.8
    const stats = makeStats({ distinctLeft: 100, distinctRight: 200, shared: 80 });

    const [candidate] = rankCandidates([stats]);

    expect(candidate).toBeDefined();
    expect(candidate?.coverageLeftToRight).toBeCloseTo(0.8);
    expect(candidate?.coverageRightToLeft).toBeCloseTo(0.4);
    expect(candidate?.overlap).toBeCloseTo(0.8);
    expect(candidate?.distinctLeft).toBe(100);
    expect(candidate?.distinctRight).toBe(200);
    expect(candidate?.shared).toBe(80);
  });

  it("derives cardinality one-to-one when both coverages are approximately 1.0", () => {
    const stats = makeStats({ distinctLeft: 100, distinctRight: 100, shared: 100 });

    const [candidate] = rankCandidates([stats]);

    expect(candidate?.cardinality).toBe("one-to-one");
  });

  it("derives cardinality many-to-one when the left side has lower coverage (many rows on the left reference one row on the right)", () => {
    // coverageLeftToRight = 80/100 = 0.8 (left not fully covered)
    // coverageRightToLeft = 80/80 = 1.0 (right is the "one" side, fully covered)
    const stats = makeStats({ distinctLeft: 100, distinctRight: 80, shared: 80 });

    const [candidate] = rankCandidates([stats]);

    expect(candidate?.cardinality).toBe("many-to-one");
  });

  it("derives cardinality one-to-many when the right side has lower coverage (many rows on the right reference one row on the left)", () => {
    // coverageLeftToRight = 80/80 = 1.0 (left is the "one" side, fully covered)
    // coverageRightToLeft = 80/100 = 0.8 (right not fully covered)
    const stats = makeStats({ distinctLeft: 80, distinctRight: 100, shared: 80 });

    const [candidate] = rankCandidates([stats]);

    expect(candidate?.cardinality).toBe("one-to-many");
  });

  it("does not set estimated: true on any candidate (that flag belongs to the caller, detectKeys)", () => {
    const stats = makeStats();

    const [candidate] = rankCandidates([stats]);

    expect(candidate?.estimated).toBe(false);
  });

  it("sorts by overlap desc, then by distinct desc", () => {
    const lowOverlap = makeStats({
      leftColumn: "low_overlap",
      distinctLeft: 100,
      distinctRight: 100,
      shared: 60, // overlap = 0.6
    });
    const highOverlap = makeStats({
      leftColumn: "high_overlap",
      distinctLeft: 100,
      distinctRight: 100,
      shared: 90, // overlap = 0.9
    });
    const tiedOverlapHigherDistinct = makeStats({
      leftColumn: "tied_overlap_higher_distinct",
      distinctLeft: 1000,
      distinctRight: 1000,
      shared: 900, // overlap = 0.9, distinct = 1000
    });

    const result = rankCandidates([lowOverlap, highOverlap, tiedOverlapHigherDistinct]);

    expect(result.map((c) => c.leftColumn)).toEqual([
      "tied_overlap_higher_distinct",
      "high_overlap",
      "low_overlap",
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(rankCandidates([])).toEqual([]);
  });

  it("drops a pair with zero overlap", () => {
    const stats = makeStats({ shared: 0 });

    expect(rankCandidates([stats])).toEqual([]);
  });
});
