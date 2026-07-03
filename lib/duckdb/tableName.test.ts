import { describe, expect, it } from "vitest";
import { uniqueTableName } from "./tableName";

describe("uniqueTableName", () => {
  it("sanitizes unsafe characters into a valid identifier", () => {
    const name = uniqueTableName("Sales Report (final).csv", []);
    expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(name).not.toMatch(/[^a-z0-9_]/);
  });

  it("lowercases the result", () => {
    const name = uniqueTableName("Ventas.csv", []);
    expect(name).toBe(name.toLowerCase());
  });

  it("prefixes with t_ when the sanitized name would start with a digit", () => {
    const name = uniqueTableName("2024-report.csv", []);
    expect(name.startsWith("t_")).toBe(true);
    expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("produces a valid identifier when the raw name starts with underscores", () => {
    const name = uniqueTableName("__report.csv", []);
    expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("collapses repeated separators", () => {
    const name = uniqueTableName("a   b---c.csv", []);
    expect(name).not.toMatch(/_{2,}/);
  });

  it("caps the identifier length", () => {
    const longName = `${"a".repeat(200)}.csv`;
    const name = uniqueTableName(longName, []);
    expect(name.length).toBeLessThanOrEqual(64);
  });

  it("is deterministic given the same inputs", () => {
    const first = uniqueTableName("orders.csv", ["orders"]);
    const second = uniqueTableName("orders.csv", ["orders"]);
    expect(first).toBe(second);
  });

  it("suffixes _2 on a first collision", () => {
    const base = uniqueTableName("data.csv", []);
    const deduped = uniqueTableName("data.csv", [base]);
    expect(deduped).toBe(`${base}_2`);
  });

  it("suffixes _3 on a second collision", () => {
    const base = uniqueTableName("data.csv", []);
    const deduped = uniqueTableName("data.csv", [base, `${base}_2`]);
    expect(deduped).toBe(`${base}_3`);
  });

  it("does not collide when the sanitized base differs", () => {
    const orders = uniqueTableName("orders.csv", []);
    const customers = uniqueTableName("customers.csv", [orders]);
    expect(customers).not.toBe(orders);
  });

  it("produces a non-empty identifier even for an all-symbol file name", () => {
    const name = uniqueTableName("!!!.csv", []);
    expect(name.length).toBeGreaterThan(0);
    expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
