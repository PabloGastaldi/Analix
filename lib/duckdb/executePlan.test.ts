import { describe, expect, it, vi } from "vitest";
import type { Row } from "./query";
import { attemptWidget, classifyRows } from "./executePlan";
import type { Widget } from "@/lib/schemas";

function makeWidget(overrides: Partial<Widget> = {}): Widget {
  return {
    id: "w1",
    title: "Sales by region",
    chartType: "bar",
    sql: 'SELECT region, SUM(sales) AS sales FROM "dataset" GROUP BY region',
    ...overrides,
  };
}

describe("classifyRows", () => {
  it("classifies zero rows as empty", () => {
    expect(classifyRows([])).toBe("empty");
  });

  it("classifies non-empty rows as ok", () => {
    const rows: Row[] = [{ region: "north", sales: 100 }];
    expect(classifyRows(rows)).toBe("ok");
  });
});

describe("attemptWidget", () => {
  it("succeeds on the first attempt without calling correct", async () => {
    const widget = makeWidget();
    const rows: Row[] = [{ region: "north", sales: 100 }];
    const runQuery = vi.fn().mockResolvedValue(rows);
    const correct = vi.fn();

    const result = await attemptWidget({}, widget, runQuery, correct);

    expect(result).toEqual({ widget, status: "ok", rows, sql: widget.sql });
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(correct).not.toHaveBeenCalled();
  });

  it("succeeds on retry 1 after the first attempt fails", async () => {
    const widget = makeWidget();
    const correctedSql = "SELECT region, SUM(sales) AS sales FROM dataset GROUP BY region";
    const rows: Row[] = [{ region: "north", sales: 100 }];
    const runQuery = vi
      .fn()
      .mockRejectedValueOnce(new Error("Catalog Error: table dataset does not exist"))
      .mockResolvedValueOnce(rows);
    const correct = vi.fn().mockResolvedValue(correctedSql);

    const result = await attemptWidget({}, widget, runQuery, correct);

    expect(result).toEqual({ widget, status: "ok", rows, sql: correctedSql });
    expect(runQuery).toHaveBeenCalledTimes(2);
    expect(correct).toHaveBeenCalledTimes(1);
  });

  it("succeeds on retry 2, the final allowed attempt", async () => {
    const widget = makeWidget();
    const rows: Row[] = [{ region: "north", sales: 100 }];
    const runQuery = vi
      .fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"))
      .mockResolvedValueOnce(rows);
    const correct = vi
      .fn()
      .mockResolvedValueOnce("sql attempt 2")
      .mockResolvedValueOnce("sql attempt 3");

    const result = await attemptWidget({}, widget, runQuery, correct);

    expect(result.status).toBe("ok");
    expect(runQuery).toHaveBeenCalledTimes(3);
    expect(correct).toHaveBeenCalledTimes(2);
  });

  it("marks the widget unavailable after exhausting the 2-retry budget (3 total attempts)", async () => {
    const widget = makeWidget();
    const runQuery = vi
      .fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"))
      .mockRejectedValueOnce(new Error("error 3 final"));
    const correct = vi
      .fn()
      .mockResolvedValueOnce("sql attempt 2")
      .mockResolvedValueOnce("sql attempt 3");

    const result = await attemptWidget({}, widget, runQuery, correct);

    expect(result).toEqual({
      widget,
      status: "unavailable",
      reason: "error 3 final",
    });
    expect(runQuery).toHaveBeenCalledTimes(3);
    expect(correct).toHaveBeenCalledTimes(2);
  });

  it("never exceeds 3 total execution attempts even if correct is called again", async () => {
    const widget = makeWidget();
    const runQuery = vi.fn().mockRejectedValue(new Error("always fails"));
    const correct = vi.fn().mockResolvedValue("still broken sql");

    await attemptWidget({}, widget, runQuery, correct);

    expect(runQuery).toHaveBeenCalledTimes(3);
    expect(correct).toHaveBeenCalledTimes(2);
  });

  it("classifies a successful query with zero rows as empty", async () => {
    const widget = makeWidget();
    const runQuery = vi.fn().mockResolvedValue([]);
    const correct = vi.fn();

    const result = await attemptWidget({}, widget, runQuery, correct);

    expect(result).toEqual({ widget, status: "empty" });
    expect(runQuery).toHaveBeenCalledTimes(1);
    expect(correct).not.toHaveBeenCalled();
  });
});
