import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  tableProfileSchema,
  dashboardPlanSchema,
  dashboardSummarySchema,
  widgetSchema,
  type SummaryError,
} from "@/lib/schemas";
import {
  buildSummaryPayload,
  buildSummarySystemPrompt,
  createRateLimiter,
  resolveSummary,
} from "@/lib/ai";
import type { WidgetResult } from "@/lib/schemas";

// Node.js runtime (default) — the Anthropic SDK needs Node, not the Edge runtime.

const MODEL = "claude-sonnet-5";
// Thinking disabled (see app/api/plan/route.ts): a short narrative from
// pre-computed numbers needs no reasoning budget, and it keeps latency/cost down.
const THINKING = { type: "disabled" } as const;
const MAX_TOKENS = 4096;

const summaryRateLimiter = createRateLimiter();

// Widget results come from our own client; validate the essential shape only.
const widgetResultSchema = z.object({
  widget: widgetSchema,
  status: z.enum(["ok", "empty", "unavailable", "pending"]),
  rows: z.array(z.record(z.string(), z.unknown())).optional(),
  sql: z.string().optional(),
  reason: z.string().optional(),
});

const requestBodySchema = z.object({
  profile: tableProfileSchema,
  plan: dashboardPlanSchema,
  results: z.array(widgetResultSchema).default([]),
});

function errorResponse(status: number, error: SummaryError) {
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
  const rateLimit = summaryRateLimiter.check(resolveClientIp(req));
  if (!rateLimit.allowed) {
    return errorResponse(429, {
      code: "rate_limited",
      message: "Alcanzaste el límite de solicitudes. Probá de nuevo en unos segundos.",
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
      message: "La solicitud no tiene el formato esperado ({ profile, plan, results }).",
    });
  }

  const { profile, plan, results } = parsedBody.data;

  // Golden rule chokepoint: buildSummaryPayload is the ONLY place that reads the
  // profile/plan/results to build the model payload — no raw rows past this line.
  const payload = buildSummaryPayload(profile, plan, results as WidgetResult[]);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse(500, {
      code: "unexpected",
      message: "El servicio de resumen no está configurado.",
    });
  }

  const client = new Anthropic({ apiKey });

  const askModel = async (context: { isReask: boolean; validationError: string | undefined }) => {
    const system = buildSummarySystemPrompt(payload, {
      isReask: context.isReask,
      validationError: context.validationError,
    });

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: THINKING,
      system,
      messages: [{ role: "user", content: "Escribí el resumen automático del dashboard." }],
      output_config: { format: zodOutputFormat(dashboardSummarySchema) },
    });

    return response.parsed_output;
  };

  try {
    const result = await resolveSummary(askModel);
    if (result.ok) {
      return Response.json({ ok: true, summary: result.summary }, { status: 200 });
    }
    return Response.json({ ok: false, error: result.error }, { status: 200 });
  } catch {
    return errorResponse(500, {
      code: "unexpected",
      message: "Ocurrió un error inesperado generando el resumen.",
    });
  }
}
