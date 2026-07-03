import { describe, expect, it, vi } from "vitest";
import { resolveSummary } from "./summaryFallback";

const validSummary = {
  insights: [
    { text: "El dataset tiene 12 registros.", highlight: "12" },
    { text: "Sur lidera con $3.247 en ingresos.", highlight: "$3.247" },
  ],
};

describe("resolveSummary", () => {
  it("returns the summary when the first response is valid", async () => {
    const askModel = vi.fn().mockResolvedValue(validSummary);
    const result = await resolveSummary(askModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary.insights).toHaveLength(2);
    expect(askModel).toHaveBeenCalledTimes(1);
  });

  it("re-asks once when the first response is invalid, then succeeds", async () => {
    const askModel = vi
      .fn()
      .mockResolvedValueOnce({ not: "a summary" })
      .mockResolvedValueOnce(validSummary);
    const result = await resolveSummary(askModel);
    expect(result.ok).toBe(true);
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("returns a structured error after the re-ask also fails, capping at 2 calls", async () => {
    const askModel = vi.fn().mockResolvedValue({ bad: true });
    const result = await resolveSummary(askModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("model_error");
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("treats a rejected askModel like an invalid response and still re-asks", async () => {
    const askModel = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(validSummary);
    const result = await resolveSummary(askModel);
    expect(result.ok).toBe(true);
    expect(askModel).toHaveBeenCalledTimes(2);
  });
});
