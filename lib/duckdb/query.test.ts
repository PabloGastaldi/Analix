import { describe, expect, it } from "vitest";
import { normalizeValue } from "./query";

/** Mimics DuckDB-WASM's `DecimalBigNum`: a typeof-"object" that stringifies to a number. */
class FakeDecimalBigNum {
  constructor(private readonly value: string) {}
  toString() {
    return this.value;
  }
}

describe("normalizeValue", () => {
  it("passes plain numbers through", () => {
    expect(normalizeValue(45.9)).toBe(45.9);
  });

  it("converts bigint to number", () => {
    expect(normalizeValue(BigInt(45))).toBe(45);
  });

  it("coerces a DecimalBigNum-like object (SUM over an integer column) to a number", () => {
    expect(normalizeValue(new FakeDecimalBigNum("45"))).toBe(45);
  });

  it("coerces a decimal-valued object to a number", () => {
    expect(normalizeValue(new FakeDecimalBigNum("3247.6"))).toBe(3247.6);
  });

  it("leaves strings untouched", () => {
    expect(normalizeValue("Norte")).toBe("Norte");
  });

  it("leaves booleans untouched", () => {
    expect(normalizeValue(true)).toBe(true);
  });

  it("leaves null and undefined untouched", () => {
    expect(normalizeValue(null)).toBeNull();
    expect(normalizeValue(undefined)).toBeUndefined();
  });

  it("leaves a genuinely non-numeric object untouched", () => {
    const obj = { a: 1 };
    expect(normalizeValue(obj)).toBe(obj);
  });
});
