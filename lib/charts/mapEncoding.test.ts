import { describe, expect, it } from "vitest";
import { mapEncoding } from "./mapEncoding";

describe("mapEncoding", () => {
  it("uses explicit x/y/series encoding when the columns exist in the rows", () => {
    const rows = [
      { region: "north", sales: 100, year: 2023 },
      { region: "south", sales: 200, year: 2023 },
    ];
    const result = mapEncoding(rows, { x: "region", y: "sales", series: "year" });
    expect(result).toEqual({ x: "region", y: "sales", series: "year" });
  });

  it("falls back to first string col = x, first numeric col = y when encoding is missing", () => {
    const rows = [
      { region: "north", sales: 100 },
      { region: "south", sales: 200 },
    ];
    const result = mapEncoding(rows, undefined);
    expect(result).toEqual({ x: "region", y: "sales", series: undefined });
  });

  it("falls back when encoding.x names a column absent from the result", () => {
    const rows = [
      { region: "north", sales: 100 },
      { region: "south", sales: 200 },
    ];
    const result = mapEncoding(rows, { x: "does_not_exist", y: "sales" });
    expect(result.x).toBe("region");
    expect(result.y).toBe("sales");
  });

  it("falls back when encoding.y names a column absent from the result", () => {
    const rows = [
      { region: "north", sales: 100 },
      { region: "south", sales: 200 },
    ];
    const result = mapEncoding(rows, { x: "region", y: "missing_col" });
    expect(result.x).toBe("region");
    expect(result.y).toBe("sales");
  });

  it("returns undefined x/y when rows are empty and no encoding is given", () => {
    const result = mapEncoding([], undefined);
    expect(result).toEqual({ x: undefined, y: undefined, series: undefined });
  });

  it("preserves valueFormat pass-through when provided", () => {
    const rows = [{ region: "north", sales: 100 }];
    const result = mapEncoding(rows, { x: "region", y: "sales", valueFormat: "currency" });
    expect(result.valueFormat).toBe("currency");
  });

  it("resolves a numeric-string value column as y (DuckDB DECIMAL arrives as a string)", () => {
    const rows = [
      { producto: "Mouse", ingresos: "234.50" },
      { producto: "Teclado", ingresos: "180.00" },
    ];
    const result = mapEncoding(rows, undefined);
    expect(result.x).toBe("producto");
    expect(result.y).toBe("ingresos");
  });

  it("resolves a bigint value column as y and does not pick it as x", () => {
    const rows = [
      { producto: "Mouse", cantidad: BigInt(22) },
      { producto: "Teclado", cantidad: BigInt(10) },
    ];
    const result = mapEncoding(rows, undefined);
    expect(result.x).toBe("producto");
    expect(result.y).toBe("cantidad");
  });
});
