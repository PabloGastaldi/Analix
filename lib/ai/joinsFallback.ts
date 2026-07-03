import { joinPlanSchema, type JoinError, type JoinPlan } from "@/lib/schemas";
import type { CandidateKey } from "@/lib/joins/rankCandidates";
import type { AskModelContext, AskModelFn } from "./planFallback";

export type ResolveJoinsResult =
  | { ok: true; plan: JoinPlan }
  | { ok: false; error: JoinError };

const MODEL_ERROR_MESSAGE =
  "No pudimos inferir una relación confiable entre estas tablas. Podés unirlas manualmente o seguir trabajando por separado.";

/** Confidence below this floor degrades to "no actionable join" (design §3). */
const CONFIDENCE_FLOOR = 0.5;

/**
 * Pure fallback decision reducer for join inference — mirrors `resolvePlan`:
 * parse -> safeParse -> candidate-gate -> re-ask (at most once) -> degrade.
 * Never throws past this boundary; `askModel` rejections count the same as
 * invalid responses toward the 2-call budget.
 *
 * Two extra gates beyond `resolvePlan`, both design §3 "Constraining the
 * model to code-detected candidates":
 * 1. Every relationship's `(table, column)` pair on both sides must be
 *    present in the supplied `candidateKeys` set — a non-candidate reference
 *    is treated exactly like invalid output.
 * 2. `confidence < 0.5` degrades to "no actionable join" without a re-ask
 *    (same treatment as an empty `relationships: []`, per the "Low or zero
 *    overlap" / "Low-confidence proposal degrades" scenarios) — a
 *    low-confidence proposal is not malformed, it is just not good enough.
 */
export async function resolveJoins(
  askModel: AskModelFn,
  candidateKeys: CandidateKey[],
): Promise<ResolveJoinsResult> {
  const first = await tryAsk(askModel, { isReask: false, validationError: undefined }, candidateKeys);
  if (first.ok) {
    return first;
  }
  if (first.degraded) {
    return degrade();
  }

  const second = await tryAsk(
    askModel,
    { isReask: true, validationError: first.validationError },
    candidateKeys,
  );
  if (second.ok) {
    return second;
  }

  return degrade();
}

function degrade(): ResolveJoinsResult {
  return { ok: false, error: { code: "model_error", message: MODEL_ERROR_MESSAGE } };
}

type AttemptResult =
  | { ok: true; plan: JoinPlan }
  | { ok: false; validationError: string; degraded?: false }
  // Low confidence / empty relationships: valid shape, not a re-ask target.
  | { ok: false; validationError: string; degraded: true };

async function tryAsk(
  askModel: AskModelFn,
  context: AskModelContext,
  candidateKeys: CandidateKey[],
): Promise<AttemptResult> {
  let raw: unknown;
  try {
    raw = await askModel(context);
  } catch (error) {
    return {
      ok: false,
      validationError: error instanceof Error ? error.message : String(error),
    };
  }

  const parsed = joinPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, validationError: parsed.error.message };
  }

  const { relationships } = parsed.data;

  // Empty relationships is a valid, first-class "nothing relates" answer.
  if (relationships.length === 0) {
    return { ok: true, plan: parsed.data };
  }

  // Candidate gate: every relationship must reference a candidate pair on
  // both sides. A hallucinated column is treated exactly like invalid Zod
  // output — re-ask once, then degrade.
  const isCandidateBacked = relationships.every((relationship) =>
    candidateKeys.some(
      (candidate) =>
        candidate.leftTable === relationship.leftTable &&
        candidate.leftColumn === relationship.leftColumn &&
        candidate.rightTable === relationship.rightTable &&
        candidate.rightColumn === relationship.rightColumn,
    ),
  );
  if (!isCandidateBacked) {
    return {
      ok: false,
      validationError: "Proposal references a column pair outside the detected candidate set.",
    };
  }

  // Confidence floor: a validly-shaped, candidate-backed proposal that is
  // still too uncertain degrades without spending the re-ask budget.
  const isConfident = relationships.every((relationship) => relationship.confidence >= CONFIDENCE_FLOOR);
  if (!isConfident) {
    return {
      ok: false,
      validationError: "Proposal confidence below the configured floor.",
      degraded: true,
    };
  }

  return { ok: true, plan: parsed.data };
}
