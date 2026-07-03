import { chatResponseSchema, type ChatError, type Widget } from "@/lib/schemas";
import type { AskModelContext, AskModelFn } from "./planFallback";

export type ResolveChatResult =
  | { ok: true; widget: Widget }
  | { ok: false; error: ChatError };

const MODEL_ERROR_MESSAGE =
  "No pude responder esa pregunta. Probá reformularla o preguntá otra cosa.";

/**
 * Pure fallback decision reducer for a chat answer — mirrors `resolvePlan`:
 * parse -> safeParse -> re-ask (at most once) -> structured error. Never throws
 * past this boundary; `askModel` rejections count the same as invalid responses
 * toward the 2-call budget.
 */
export async function resolveChat(askModel: AskModelFn): Promise<ResolveChatResult> {
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
  | { ok: true; widget: Widget }
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

  const parsed = chatResponseSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, widget: parsed.data.widget };
  }
  return { ok: false, validationError: parsed.error.message };
}
