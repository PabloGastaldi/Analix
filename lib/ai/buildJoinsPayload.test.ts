import { describe, expect, it } from "vitest";
import type { TableProfile } from "@/lib/schemas";
import type { CandidateKey } from "@/lib/joins/rankCandidates";
import { buildJoinsPayload } from "./buildJoinsPayload";

function makeProfile(overrides: Partial<TableProfile> = {}): TableProfile {
  return {
    tableName: "orders",
    rowCount: 500,
    columns: [
      {
        name: "customer_id",
        rawType: "number",
        semanticType: "id",
        stats: {
          count: 500,
          nullCount: 0,
          distinctCount: 100,
          sampleValues: [1, 2, 3],
        },
      },
    ],
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateKey> = {}): CandidateKey {
  return {
    leftTable: "orders",
    leftColumn: "customer_id",
    rightTable: "customers",
    rightColumn: "id",
    distinctLeft: 100,
    distinctRight: 100,
    shared: 90,
    overlap: 0.9,
    coverageLeftToRight: 0.9,
    coverageRightToLeft: 0.9,
    cardinality: "many-to-one",
    estimated: false,
    ...overrides,
  };
}

describe("buildJoinsPayload", () => {
  it("projects tables (tableName, rowCount, columns), candidateKeys (overlap/cardinality/estimated), and comment", () => {
    const profiles = [makeProfile()];
    const candidates = [makeCandidate()];

    const payload = buildJoinsPayload(profiles, candidates, "revenue by customer region");

    expect(payload).toEqual({
      tables: [
        {
          tableName: "orders",
          rowCount: 500,
          columns: [
            {
              name: "customer_id",
              rawType: "number",
              semanticType: "id",
              stats: {
                count: 500,
                nullCount: 0,
                distinctCount: 100,
                min: undefined,
                max: undefined,
                mean: undefined,
                stddev: undefined,
                sampleValues: [1, 2, 3],
              },
            },
          ],
        },
      ],
      candidateKeys: [
        {
          leftTable: "orders",
          leftColumn: "customer_id",
          rightTable: "customers",
          rightColumn: "id",
          overlap: 0.9,
          cardinality: "many-to-one",
          estimated: false,
        },
      ],
      comment: "revenue by customer region",
    });
  });

  it("carries an empty comment through unchanged", () => {
    const payload = buildJoinsPayload([makeProfile()], [makeCandidate()], "");

    expect(payload.comment).toBe("");
  });

  it("never leaks a row/data field even if the input TableProfile accidentally carries one", () => {
    const maliciousProfile = {
      ...makeProfile(),
      rows: [{ customer_id: 424242 }],
      data: [{ customer_id: 131313 }],
    } as TableProfile & { rows: unknown; data: unknown };

    const payload = buildJoinsPayload([maliciousProfile], [makeCandidate()], "comment");

    expect(payload.tables[0]).not.toHaveProperty("rows");
    expect(payload.tables[0]).not.toHaveProperty("data");
    expect(JSON.stringify(payload)).not.toContain("424242");
    expect(JSON.stringify(payload)).not.toContain("131313");
    expect(Object.keys(payload.tables[0]!)).toEqual(["tableName", "rowCount", "columns"]);
  });

  it("drops any undocumented input field on candidate keys (only reads leftTable/leftColumn/rightTable/rightColumn/overlap/cardinality/estimated)", () => {
    const candidateWithExtraFields = {
      ...makeCandidate(),
      distinctLeft: 100,
      distinctRight: 100,
      shared: 90,
      // Malicious/unexpected extra field simulating value leakage.
      sampleSharedValues: [1, 2, 3],
    } as CandidateKey & { sampleSharedValues: unknown };

    const payload = buildJoinsPayload([makeProfile()], [candidateWithExtraFields], "comment");

    expect(payload.candidateKeys[0]).not.toHaveProperty("sampleSharedValues");
    expect(payload.candidateKeys[0]).not.toHaveProperty("distinctLeft");
    expect(payload.candidateKeys[0]).not.toHaveProperty("distinctRight");
    expect(payload.candidateKeys[0]).not.toHaveProperty("shared");
    expect(Object.keys(payload.candidateKeys[0]!)).toEqual([
      "leftTable",
      "leftColumn",
      "rightTable",
      "rightColumn",
      "overlap",
      "cardinality",
      "estimated",
    ]);
  });

  it("only projects the documented column fields, dropping any extra column-level fields", () => {
    const profileWithExtraColumnField = {
      ...makeProfile(),
      columns: [
        {
          name: "customer_id",
          rawType: "number" as const,
          semanticType: "id" as const,
          stats: {
            count: 500,
            nullCount: 0,
            distinctCount: 100,
            sampleValues: [1, 2, 3],
          },
          rawValues: [1, 2, 3, 4, 5],
        },
      ],
    } as unknown as TableProfile;

    const payload = buildJoinsPayload([profileWithExtraColumnField], [makeCandidate()], "comment");

    expect(payload.tables[0]!.columns[0]).not.toHaveProperty("rawValues");
    expect(Object.keys(payload.tables[0]!.columns[0]!)).toEqual([
      "name",
      "rawType",
      "semanticType",
      "stats",
    ]);
  });
});
