import { describe, expect, it, vi } from "vitest";
import type { JoinPlan, JoinRelationship } from "@/lib/schemas";
import type { CandidateKey } from "@/lib/joins/rankCandidates";
import { resolveJoins } from "./joinsFallback";

function makeCandidate(overrides: Partial<CandidateKey> = {}): CandidateKey {
  return {
    leftTable: "orders",
    leftColumn: "customer_id",
    rightTable: "customers",
    rightColumn: "id",
    distinctLeft: 100,
    distinctRight: 100,
    shared: 90,
    overlap: 0.9,
    coverageLeftToRight: 0.9,
    coverageRightToLeft: 0.9,
    cardinality: "many-to-one",
    estimated: false,
    ...overrides,
  };
}

function makeRelationship(overrides: Partial<JoinRelationship> = {}): JoinRelationship {
  return {
    leftTable: "orders",
    leftColumn: "customer_id",
    rightTable: "customers",
    rightColumn: "id",
    joinType: "inner",
    cardinality: "many-to-one",
    confidence: 0.9,
    ...overrides,
  };
}

describe("resolveJoins (fallback reducer: parse -> safeParse -> candidate-gate -> re-ask -> degrade)", () => {
  it("returns the plan when the first model response is a valid proposal referencing a candidate pair", async () => {
    const candidates = [makeCandidate()];
    const plan: JoinPlan = { relationships: [makeRelationship()] };
    const askModel = vi.fn().mockResolvedValue(plan);

    const result = await resolveJoins(askModel, candidates);

    expect(result).toEqual({ ok: true, plan });
    expect(askModel).toHaveBeenCalledTimes(1);
  });

  it("re-asks once when the first response is invalid Zod shape, and returns the plan if the re-ask is valid", async () => {
    const candidates = [makeCandidate()];
    const plan: JoinPlan = { relationships: [makeRelationship()] };
    const askModel = vi
      .fn()
      .mockResolvedValueOnce({ nonsense: true })
      .mockResolvedValueOnce(plan);

    const result = await resolveJoins(askModel, candidates);

    expect(result).toEqual({ ok: true, plan });
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("degrades after the re-ask also fails Zod validation", async () => {
    const candidates = [makeCandidate()];
    const askModel = vi
      .fn()
      .mockResolvedValueOnce({ nonsense: true })
      .mockResolvedValueOnce({ nonsense: 2 });

    const result = await resolveJoins(askModel, candidates);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("model_error");
    }
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("rejects a proposal referencing a (table, column) pair not present in the candidate set — treated as invalid, re-asks once, then degrades", async () => {
    const candidates = [makeCandidate()]; // orders.customer_id <-> customers.id only
    const nonCandidateProposal: JoinPlan = {
      relationships: [
        makeRelationship({
          leftTable: "orders",
          leftColumn: "email",
          rightTable: "customers",
          rightColumn: "email",
        }),
      ],
    };
    const askModel = vi.fn().mockResolvedValue(nonCandidateProposal);

    const result = await resolveJoins(askModel, candidates);

    expect(result.ok).toBe(false);
    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("accepts a proposal whose (table, column) pair matches a candidate exactly", async () => {
    const candidates = [makeCandidate({ leftColumn: "cust_id", rightColumn: "customer_id" })];
    const plan: JoinPlan = {
      relationships: [
        makeRelationship({ leftColumn: "cust_id", rightColumn: "customer_id" }),
      ],
    };
    const askModel = vi.fn().mockResolvedValue(plan);

    const result = await resolveJoins(askModel, candidates);

    expect(result).toEqual({ ok: true, plan });
    expect(askModel).toHaveBeenCalledTimes(1);
  });

  it("treats an empty relationships: [] array as a valid degrade with no re-ask", async () => {
    const candidates = [makeCandidate()];
    const emptyPlan: JoinPlan = { relationships: [] };
    const askModel = vi.fn().mockResolvedValue(emptyPlan);

    const result = await resolveJoins(askModel, candidates);

    expect(result).toEqual({ ok: true, plan: emptyPlan });
    expect(askModel).toHaveBeenCalledTimes(1);
  });

  it("degrades without re-asking when confidence is below the 0.5 floor", async () => {
    const candidates = [makeCandidate()];
    const lowConfidencePlan: JoinPlan = {
      relationships: [makeRelationship({ confidence: 0.3 })],
    };
    const askModel = vi.fn().mockResolvedValue(lowConfidencePlan);

    const result = await resolveJoins(askModel, candidates);

    expect(result.ok).toBe(false);
    expect(askModel).toHaveBeenCalledTimes(1);
  });

  it("accepts a proposal exactly at the 0.5 confidence floor", async () => {
    const candidates = [makeCandidate()];
    const plan: JoinPlan = { relationships: [makeRelationship({ confidence: 0.5 })] };
    const askModel = vi.fn().mockResolvedValue(plan);

    const result = await resolveJoins(askModel, candidates);

    expect(result).toEqual({ ok: true, plan });
  });

  it("never calls askModel more than twice", async () => {
    const candidates = [makeCandidate()];
    const askModel = vi.fn().mockResolvedValue({ nonsense: true });

    await resolveJoins(askModel, candidates);

    expect(askModel).toHaveBeenCalledTimes(2);
  });

  it("returns a structured error, without throwing, when askModel rejects on both attempts", async () => {
    const candidates = [makeCandidate()];
    const askModel = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await resolveJoins(askModel, candidates);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("model_error");
    }
    expect(askModel).toHaveBeenCalledTimes(2);
  });
});
