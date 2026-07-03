import { describe, expect, it } from "vitest";
import type { TableProfile } from "@/lib/schemas";
import { buildPlanPayload } from "./buildPlanPayload";

function makeProfile(overrides: Partial<TableProfile> = {}): TableProfile {
  return {
    tableName: "dataset",
    rowCount: 120,
    columns: [
      {
        name: "region",
        rawType: "string",
        semanticType: "categorical_low",
        stats: {
          count: 120,
          nullCount: 0,
          distinctCount: 4,
          sampleValues: ["north", "south", "east"],
        },
      },
      {
        name: "sales",
        rawType: "number",
        semanticType: "measure_continuous",
        stats: {
          count: 120,
          nullCount: 0,
          distinctCount: 98,
          min: 10,
          max: 999,
          mean: 245.5,
          stddev: 88.2,
          sampleValues: [10, 250, 999],
        },
      },
    ],
    ...overrides,
  };
}

describe("buildPlanPayload", () => {
  it("forwards only tableName, rowCount, per-column metadata and comment", () => {
    const profile = makeProfile();
    const payload = buildPlanPayload(profile, "Show me sales by region");

    expect(payload).toEqual({
      tableName: "dataset",
      rowCount: 120,
      comment: "Show me sales by region",
      columns: [
        {
          name: "region",
          rawType: "string",
          semanticType: "categorical_low",
          stats: {
            count: 120,
            nullCount: 0,
            distinctCount: 4,
            min: undefined,
            max: undefined,
            mean: undefined,
            stddev: undefined,
            sampleValues: ["north", "south", "east"],
          },
        },
        {
          name: "sales",
          rawType: "number",
          semanticType: "measure_continuous",
          stats: {
            count: 120,
            nullCount: 0,
            distinctCount: 98,
            min: 10,
            max: 999,
            mean: 245.5,
            stddev: 88.2,
            sampleValues: [10, 250, 999],
          },
        },
      ],
    });
  });

  it("never forwards a row-shaped field, even when the input profile maliciously carries one", () => {
    const maliciousProfile = {
      ...makeProfile(),
      rows: [{ region: "north", sales: 424242 }],
      data: [{ region: "south", sales: 131313 }],
    } as TableProfile & { rows: unknown; data: unknown };

    const payload = buildPlanPayload(maliciousProfile, "Show me sales by region");

    expect(payload).not.toHaveProperty("rows");
    expect(payload).not.toHaveProperty("data");
    expect(JSON.stringify(payload)).not.toContain("424242");
    expect(JSON.stringify(payload)).not.toContain("131313");
    expect(Object.keys(payload)).toEqual(["tableName", "rowCount", "columns", "comment"]);
  });

  it("only projects the documented column fields, dropping any extra column-level fields", () => {
    const profileWithExtraColumnField = {
      ...makeProfile(),
      columns: [
        {
          name: "region",
          rawType: "string" as const,
          semanticType: "categorical_low" as const,
          stats: {
            count: 120,
            nullCount: 0,
            distinctCount: 4,
            sampleValues: ["north", "south", "east"],
          },
          // Malicious/unexpected extra field simulating raw row leakage.
          rawValues: ["north", "south", "east", "north", "west"],
        },
      ],
    } as unknown as TableProfile;

    const payload = buildPlanPayload(profileWithExtraColumnField, "comment");

    expect(payload.columns[0]).not.toHaveProperty("rawValues");
    expect(Object.keys(payload.columns[0])).toEqual([
      "name",
      "rawType",
      "semanticType",
      "stats",
    ]);
  });
});
