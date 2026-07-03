import { describe, expect, it, vi } from "vitest";
import type { DashboardPlan } from "@/lib/schemas";
import { resolvePlan } from "./planFallback";

function validPlan(): DashboardPlan {
  return {
    title: "Sales overview",
    widgets: [
      {
        id: "w1",
        title: "Total sales",
        chartType: "kpi",
        sql: 'SELECT SUM(sales) AS total FROM "dataset"',
      },
    ],
  };
}

describe("resolvePlan (fallback reducer: parse -> safeParse -> re-ask -> error)", () => {
  it("returns the plan when the first model response is already valid", async () => {
    const plan = validPlan();
    const askModel = vi.fn().mockResolvedValue(plan);

    const result = await resolvePlan(askModel);

    expect(result).toEqual({ ok: true, plan });
    expect(askModel).toHaveBeenCalledTimes(1);
    expect(askModel).toHaveBeenCalledWith({ isReask: false, validationError: undefined });
  });

  it("re-asks once when the first response is invalid, and returns the plan if the re-ask is valid", async () => {
    const plan = validPlan();
    const askModel = vi
      .fn()
      .mockResolvedValueOnce({ title: "missing widgets" }) // fails schema: widgets required
      .mockResolvedValueOnce(plan);

    const result = await resolvePlan(askModel);

    expect(result).toEqual({ ok: true, plan });
    expect(askModel).toHaveBeenCalledTimes(2);
    expect(askModel).toHaveBeenNthCalledWith(1, { isReask: false, validationError: undefined });
    expect(askModel).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ isReask: true }),
    );
    const secondCallArg = askModel.mock.calls[1][0];
    expect(secondCallArg.validationError).toBeTruthy();
  });

  it("returns a structured PlanError when both the first response and the re-ask are invalid", async () => {
    const askModel = vi
      .fn()
      .mockResolvedValueOnce({ title: "invalid 1" })
      .mockResolvedValueOnce({ title: "invalid 2" });

    const result = await resolvePlan(askModel);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("model_error");
      expect(typeof result.error.message).toBe("string");
      expect(result.error.message.length).toBeGreaterThan(0);
    }
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("never calls askModel more than twice (caps at exactly 1 re-ask)", async () => {
    const askModel = vi.fn().mockResolvedValue({ nonsense: true });

    await resolvePlan(askModel);

    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("returns a structured PlanError, without throwing, when askModel rejects on both attempts", async () => {
    const askModel = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await resolvePlan(askModel);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("model_error");
    }
    // A rejection is treated like an invalid response: it still counts
    // toward the same 2-call budget (1 initial + 1 re-ask), never more.
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("re-asks (rather than treating as fatal) when the first call rejects but the second succeeds", async () => {
    const plan = validPlan();
    const askModel = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient error"))
      .mockResolvedValueOnce(plan);

    const result = await resolvePlan(askModel);

    expect(result).toEqual({ ok: true, plan });
    expect(askModel).toHaveBeenCalledTimes(2);
  });
});
