import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  tableProfileSchema,
  chatResponseSchema,
  type ChatError,
} from "@/lib/schemas";
import {
  buildPlanPayload,
  buildChatSystemPrompt,
  createRateLimiter,
  resolveChat,
} from "@/lib/ai";

// Node.js runtime (default) — the Anthropic SDK needs Node, not the Edge runtime.

const MODEL = "claude-sonnet-5";
// Thinking disabled (see app/api/plan/route.ts): translating one question to one
// widget is a bounded task; adaptive thinking would only add latency/cost.
const THINKING = { type: "disabled" } as const;
const MAX_TOKENS = 4096;
const MAX_QUESTION_LENGTH = 2000;

const chatRateLimiter = createRateLimiter();

const requestBodySchema = z.object({
  profile: tableProfileSchema,
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
});

function errorResponse(status: number, error: ChatError) {
  return Response.json({ ok: false, error }, { status });
}

function resolveClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export async function POST(req: Request) {
  const rateLimit = chatRateLimiter.check(resolveClientIp(req));
  if (!rateLimit.allowed) {
    return errorResponse(429, {
      code: "rate_limited",
      message: "Alcanzaste el límite de preguntas. Probá de nuevo en unos segundos.",
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, {
      code: "invalid_request",
      message: "El cuerpo de la solicitud no es JSON válido.",
    });
  }

  const parsedBody = requestBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return errorResponse(400, {
      code: "invalid_request",
      message: "La solicitud no tiene el formato esperado ({ profile, question }).",
    });
  }

  const { profile, question } = parsedBody.data;

  // Golden rule chokepoint: buildPlanPayload is the ONLY place profile fields
  // are read for the model payload — schema + stats + the question, never rows.
  const payload = buildPlanPayload(profile, question);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse(500, {
      code: "unexpected",
      message: "El servicio de chat no está configurado.",
    });
  }

  const client = new Anthropic({ apiKey });

  const askModel = async (context: { isReask: boolean; validationError: string | undefined }) => {
    const system = buildChatSystemPrompt(payload, {
      isReask: context.isReask,
      validationError: context.validationError,
    });

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: THINKING,
      system,
      messages: [{ role: "user", content: payload.comment }],
      output_config: { format: zodOutputFormat(chatResponseSchema) },
    });

    return response.parsed_output;
  };

  try {
    const result = await resolveChat(askModel);
    if (result.ok) {
      return Response.json({ ok: true, widget: result.widget }, { status: 200 });
    }
    return Response.json({ ok: false, error: result.error }, { status: 200 });
  } catch {
    return errorResponse(500, {
      code: "unexpected",
      message: "Ocurrió un error inesperado respondiendo la pregunta.",
    });
  }
}
