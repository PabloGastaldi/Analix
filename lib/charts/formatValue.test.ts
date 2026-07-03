import { describe, expect, it } from "vitest";
import { formatValue } from "./formatValue";

describe("formatValue", () => {
  it("formats a plain number with es-AR thousands separators", () => {
    expect(formatValue(1234.5, "number")).toBe("1.234,5");
  });

  it("formats currency with a $ prefix and 2 decimals (es-AR)", () => {
    expect(formatValue(1234.5, "currency")).toBe("$1.234,50");
  });

  it("formats percent by multiplying by 100 and appending % (es-AR)", () => {
    expect(formatValue(0.256, "percent")).toBe("25,6%");
  });

  it("formats an integer number format without a trailing decimal", () => {
    expect(formatValue(42, "number")).toBe("42");
  });

  it("returns em dash for null", () => {
    expect(formatValue(null, "number")).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatValue(undefined, "number")).toBe("—");
  });

  it("returns em dash for NaN", () => {
    expect(formatValue(NaN, "number")).toBe("—");
  });

  it("defaults to plain number formatting when valueFormat is omitted", () => {
    expect(formatValue(10, undefined)).toBe("10");
  });

  it("returns em dash for a non-numeric string value", () => {
    expect(formatValue("not-a-number", "number")).toBe("—");
  });
});
