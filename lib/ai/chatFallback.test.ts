import { describe, expect, it, vi } from "vitest";
import { resolveChat } from "./chatFallback";

const validResponse = {
  widget: {
    id: "chat_1",
    title: "Ventas totales",
    chartType: "kpi",
    sql: 'SELECT SUM("precio") AS total FROM "dataset"',
    encoding: { y: "total", valueFormat: "currency" },
  },
};

describe("resolveChat", () => {
  it("returns the widget when the first response is valid", async () => {
    const askModel = vi.fn().mockResolvedValue(validResponse);
    const result = await resolveChat(askModel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.widget.chartType).toBe("kpi");
    expect(askModel).toHaveBeenCalledTimes(1);
  });

  it("re-asks once when the first response is invalid, then succeeds", async () => {
    const askModel = vi
      .fn()
      .mockResolvedValueOnce({ nope: true })
      .mockResolvedValueOnce(validResponse);
    const result = await resolveChat(askModel);
    expect(result.ok).toBe(true);
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("returns a structured error after the re-ask also fails, capping at 2 calls", async () => {
    const askModel = vi.fn().mockResolvedValue({ bad: 1 });
    const result = await resolveChat(askModel);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("model_error");
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("treats a rejected askModel like an invalid response and still re-asks", async () => {
    const askModel = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(validResponse);
    const result = await resolveChat(askModel);
    expect(result.ok).toBe(true);
    expect(askModel).toHaveBeenCalledTimes(2);
  });
});
