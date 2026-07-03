import { describe, expect, it, vi } from "vitest";
import { deterministicFix, correct } from "./correctSql";

describe("deterministicFix", () => {
  it("quotes an unquoted identifier that matches a profile column name", () => {
    const sql = "SELECT region, SUM(sales) AS total FROM dataset GROUP BY region";
    const error = 'Catalog Error: Table with name dataset does not exist';
    const columns = ["region", "sales"];

    const fixed = deterministicFix(sql, error, "dataset", columns);

    expect(fixed).toBe(
      'SELECT region, SUM(sales) AS total FROM "dataset" GROUP BY region',
    );
  });

  it("corrects an obvious column-name typo to the nearest profile column", () => {
    const sql = 'SELECT regoin, SUM(sales) AS total FROM "dataset" GROUP BY regoin';
    const error = 'Binder Error: Referenced column "regoin" not found in FROM clause!';
    const columns = ["region", "sales"];

    const fixed = deterministicFix(sql, error, "dataset", columns);

    expect(fixed).toBe(
      'SELECT region, SUM(sales) AS total FROM "dataset" GROUP BY region',
    );
  });

  it("returns null when it cannot confidently fix the error", () => {
    const sql = 'SELECT * FROM "dataset" WHERE 1 = 1 AND totally_unrelated_syntax !!!';
    const error = "Parser Error: syntax error";
    const columns = ["region", "sales"];

    const fixed = deterministicFix(sql, error, "dataset", columns);

    expect(fixed).toBeNull();
  });

  it("returns null when the typo is too far from any known column (low confidence)", () => {
    const sql = 'SELECT zzz, SUM(sales) AS total FROM "dataset" GROUP BY zzz';
    const error = 'Binder Error: Referenced column "zzz" not found in FROM clause!';
    const columns = ["region", "sales"];

    const fixed = deterministicFix(sql, error, "dataset", columns);

    expect(fixed).toBeNull();
  });
});

describe("correct", () => {
  it("uses the deterministic fixer first without calling fetch", async () => {
    const sql = "SELECT region, SUM(sales) AS total FROM dataset GROUP BY region";
    const error = 'Catalog Error: Table with name dataset does not exist';
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const fixed = await correct(sql, error, {
      tableName: "dataset",
      columns: ["region", "sales"],
    });

    expect(fixed).toBe(
      'SELECT region, SUM(sales) AS total FROM "dataset" GROUP BY region',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("falls back to POSTing /api/plan with mode:correct when the deterministic fixer can't resolve it", async () => {
    const sql = 'SELECT * FROM "dataset" WHERE 1 = 1 AND totally_unrelated_syntax !!!';
    const error = "Parser Error: syntax error";
    const correctedSql = 'SELECT * FROM "dataset"';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, sql: correctedSql }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const profile = { tableName: "dataset", columns: ["region", "sales"] };
    const fixed = await correct(sql, error, profile);

    expect(fixed).toBe(correctedSql);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/plan");
    expect(JSON.parse(init.body)).toEqual({
      mode: "correct",
      sql,
      error,
      profile,
    });

    vi.unstubAllGlobals();
  });
});
