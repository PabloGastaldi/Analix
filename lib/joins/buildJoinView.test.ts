import { describe, expect, it } from "vitest";
import { buildJoinSelectList } from "./buildJoinView";

describe("buildJoinSelectList", () => {
  it("keeps both sides' column names as-is when there is no collision", () => {
    const selectList = buildJoinSelectList(
      { tableName: "orders", columns: ["id", "customer_id", "total"] },
      { tableName: "customers", columns: ["id", "name", "region"] },
      { leftColumn: "customer_id", rightColumn: "id" },
    );

    expect(selectList).toEqual([
      { source: "l", column: "id", alias: "id" },
      { source: "l", column: "customer_id", alias: "customer_id" },
      { source: "l", column: "total", alias: "total" },
      { source: "r", column: "name", alias: "name" },
      { source: "r", column: "region", alias: "region" },
    ]);
  });

  it("aliases a right column name colliding with a left column name as <rightTable>_<name>", () => {
    const selectList = buildJoinSelectList(
      { tableName: "orders", columns: ["id", "customer_id", "total"] },
      { tableName: "customers", columns: ["id", "name", "total"] },
      { leftColumn: "customer_id", rightColumn: "id" },
    );

    const totalAlias = selectList.find((entry) => entry.source === "r" && entry.column === "total");
    expect(totalAlias).toEqual({ source: "r", column: "total", alias: "customers_total" });
  });

  it("drops the right-side join key column from the select list by default", () => {
    const selectList = buildJoinSelectList(
      { tableName: "orders", columns: ["id", "customer_id", "total"] },
      { tableName: "customers", columns: ["id", "name", "region"] },
      { leftColumn: "customer_id", rightColumn: "id" },
    );

    const rightKeyEntry = selectList.find((entry) => entry.source === "r" && entry.column === "id");
    expect(rightKeyEntry).toBeUndefined();
  });

  it("produces deterministic output ordering: left columns first, then right", () => {
    const selectList = buildJoinSelectList(
      { tableName: "orders", columns: ["total", "id", "customer_id"] },
      { tableName: "customers", columns: ["region", "id", "name"] },
      { leftColumn: "customer_id", rightColumn: "id" },
    );

    expect(selectList.map((entry) => `${entry.source}:${entry.column}`)).toEqual([
      "l:total",
      "l:id",
      "l:customer_id",
      "r:region",
      "r:name",
    ]);
  });

  it("keeps the left join key column (only the right one is dropped)", () => {
    const selectList = buildJoinSelectList(
      { tableName: "orders", columns: ["id", "customer_id"] },
      { tableName: "customers", columns: ["id", "name"] },
      { leftColumn: "customer_id", rightColumn: "id" },
    );

    const leftKeyEntry = selectList.find((entry) => entry.source === "l" && entry.column === "customer_id");
    expect(leftKeyEntry).toEqual({ source: "l", column: "customer_id", alias: "customer_id" });
  });
});
