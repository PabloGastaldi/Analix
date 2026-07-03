import {
  dashboardSummarySchema,
  type DashboardSummary,
  type SummaryError,
} from "@/lib/schemas";
import type { AskModelContext, AskModelFn } from "./planFallback";

export type ResolveSummaryResult =
  | { ok: true; summary: DashboardSummary }
  | { ok: false; error: SummaryError };

const MODEL_ERROR_MESSAGE =
  "No pudimos generar el resumen automático. Probá de nuevo en unos segundos.";

/**
 * Pure fallback decision reducer for the narrative summary — mirrors
 * `resolvePlan`: parse -> safeParse -> re-ask (at most once) -> structured
 * error. Never throws past this boundary; `askModel` rejections count the same
 * as invalid responses toward the 2-call budget.
 */
export async function resolveSummary(
  askModel: AskModelFn,
): Promise<ResolveSummaryResult> {
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
  | { ok: true; summary: DashboardSummary }
  | { ok: false; validationError: string };

async function tryAsk(
  askModel: AskModelFn,
  context: AskModelContext,
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

  const parsed = dashboardSummarySchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, summary: parsed.data };
  }
  return { ok: false, validationError: parsed.error.message };
}
