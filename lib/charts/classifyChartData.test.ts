import { describe, expect, it } from "vitest";
import { classifyChartData } from "./classifyChartData";

describe("classifyChartData", () => {
  it("classifies a zero-row result as empty", () => {
    expect(classifyChartData([], "bar", { x: "region", y: "sales" })).toBe(
      "empty",
    );
  });

  it("classifies a single-value result on a line widget as empty (insufficient data for a chart)", () => {
    const rows = [{ month: "2023-01", total: 100 }];
    expect(classifyChartData(rows, "line", { x: "month", y: "total" })).toBe(
      "empty",
    );
  });

  it("classifies a single-value result on a bar widget as empty", () => {
    const rows = [{ region: "north", sales: 100 }];
    expect(classifyChartData(rows, "bar", { x: "region", y: "sales" })).toBe(
      "empty",
    );
  });

  it("classifies a single-value result on a donut widget as empty", () => {
    const rows = [{ region: "north", sales: 100 }];
    expect(classifyChartData(rows, "donut", { x: "region", y: "sales" })).toBe(
      "empty",
    );
  });

  it("classifies a single-value result on a scatter widget as empty", () => {
    const rows = [{ x: 1, y: 2 }];
    expect(classifyChartData(rows, "scatter", { x: "x", y: "y" })).toBe(
      "empty",
    );
  });

  it("classifies a single-value result on a histogram widget as empty", () => {
    const rows = [{ bin: "0-10", count: 5 }];
    expect(classifyChartData(rows, "histogram", { x: "bin", y: "count" })).toBe(
      "empty",
    );
  });

  it("classifies a single-value result on a kpi widget as renderable (kpi only needs one value)", () => {
    const rows = [{ total: 100 }];
    expect(classifyChartData(rows, "kpi", { y: "total" })).toBe("renderable");
  });

  it("classifies a two-row bar result as renderable", () => {
    const rows = [
      { region: "north", sales: 100 },
      { region: "south", sales: 200 },
    ];
    expect(classifyChartData(rows, "bar", { x: "region", y: "sales" })).toBe(
      "renderable",
    );
  });

  it("classifies a null-heavy result (all mapped values null) as empty", () => {
    const rows = [
      { region: "north", sales: null },
      { region: "south", sales: null },
    ];
    expect(classifyChartData(rows, "bar", { x: "region", y: "sales" })).toBe(
      "empty",
    );
  });

  it("classifies a partially-null result (>=2 non-null mapped values) as renderable", () => {
    const rows = [
      { region: "north", sales: null },
      { region: "south", sales: 200 },
      { region: "east", sales: 300 },
    ];
    expect(classifyChartData(rows, "bar", { x: "region", y: "sales" })).toBe(
      "renderable",
    );
  });

  it("classifies a partially-null result with only one non-null mapped value as empty (single usable point)", () => {
    const rows = [
      { region: "north", sales: null },
      { region: "south", sales: 200 },
    ];
    expect(classifyChartData(rows, "bar", { x: "region", y: "sales" })).toBe(
      "empty",
    );
  });

  it("classifies a zero-row kpi result as empty", () => {
    expect(classifyChartData([], "kpi", { y: "total" })).toBe("empty");
  });
});
