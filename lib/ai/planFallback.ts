import { dashboardPlanSchema, type DashboardPlan, type PlanError } from "@/lib/schemas";

/**
 * Context passed to `askModel` for each call so the caller can build the
 * right prompt: the first call has no validation error, the re-ask call
 * carries the previous validation failure so the model can self-correct.
 */
export type AskModelContext = {
  isReask: boolean;
  validationError: string | undefined;
};

/**
 * Calls the model once and returns its raw (unvalidated) response. Injected
 * so this reducer stays pure/testable — the real implementation (route
 * handler) wraps `client.messages.parse()`.
 */
export type AskModelFn = (context: AskModelContext) => Promise<unknown>;

export type ResolvePlanResult =
  | { ok: true; plan: DashboardPlan }
  | { ok: false; error: PlanError };

const MODEL_ERROR_MESSAGE =
  "No pudimos generar el dashboard a partir de este comentario. Probá reformularlo o intentá de nuevo.";

/**
 * Pure fallback decision reducer (design §1 "Fallback" row, §7): parse ->
 * safeParse -> re-ask (at most once) -> structured error. Never throws past
 * this boundary — `askModel` failures (rejections) are treated the same as
 * invalid responses and still count toward the same 2-call budget.
 *
 * Budget: at most 2 total calls to `askModel` (1 initial + 1 re-ask), per the
 * "Bounded Plan Retry Budget" requirement — independent of the client-side
 * per-widget SQL correction budget.
 */
export async function resolvePlan(askModel: AskModelFn): Promise<ResolvePlanResult> {
  const first = await tryAsk(askModel, { isReask: false, validationError: undefined });
  if (first.ok) {
    return first;
  }

  const second = await tryAsk(askModel, {
    isReask: true,
    validationError: first.validationError,
  });
  if (second.ok) {
    return second;
  }

  return {
    ok: false,
    error: { code: "model_error", message: MODEL_ERROR_MESSAGE },
  };
}

type AttemptResult =
  | { ok: true; plan: DashboardPlan }
  | { ok: false; validationError: string };

async function tryAsk(askModel: AskModelFn, context: AskModelContext): Promise<AttemptResult> {
  let raw: unknown;
  try {
    raw = await askModel(context);
  } catch (error) {
    return {
      ok: false,
      validationError: error instanceof Error ? error.message : String(error),
    };
  }

  const parsed = dashboardPlanSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, plan: parsed.data };
  }
  return { ok: false, validationError: parsed.error.message };
}
