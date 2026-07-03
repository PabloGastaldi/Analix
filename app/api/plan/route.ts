import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { tableProfileSchema, dashboardPlanSchema, type PlanError } from "@/lib/schemas";
import { buildPlanPayload, buildSystemPrompt, resolvePlan, planRateLimiter } from "@/lib/ai";

// Node.js runtime (default) — the Anthropic SDK needs Node, not the Edge runtime.

const MODEL = "claude-sonnet-5";
// Thinking is disabled explicitly: Sonnet 5 runs adaptive thinking by default
// when `thinking` is omitted, which would spend `max_tokens` on reasoning (risking
// a truncated plan) and add latency. Plan generation is a structured translation
// task, so we keep it direct. Bump to adaptive + higher max_tokens if we ever want
// deeper plan reasoning.
const MAX_TOKENS = 8192;
const THINKING = { type: "disabled" } as const;
const MAX_COMMENT_LENGTH = 2000;
const MAX_SQL_LENGTH = 4000;
const MAX_SQL_ERROR_LENGTH = 2000;

const requestBodySchema = z.object({
  profile: tableProfileSchema,
  comment: z.string().trim().min(1).max(MAX_COMMENT_LENGTH),
});

/**
 * Network-fallback SQL correction branch (Work Unit 6, design §2). Metadata
 * only, same golden rule as the plan payload: `sql`, `error`, and `profile`
 * (schema, never rows) — the profile here is the small `{ tableName,
 * columns }` shape from `lib/duckdb/correctSql.ts`, not row-shaped data.
 */
const correctRequestBodySchema = z.object({
  mode: z.literal("correct"),
  sql: z.string().trim().min(1).max(MAX_SQL_LENGTH),
  error: z.string().trim().min(1).max(MAX_SQL_ERROR_LENGTH),
  profile: z.object({
    tableName: z.string(),
    columns: z.array(z.string()),
  }),
});

function errorResponse(status: number, error: PlanError) {
  return Response.json({ ok: false, error }, { status });
}

/** Best-effort client IP extraction for the per-IP rate limiter. */
function resolveClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]!.trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  // No reliable IP available (e.g. local dev, opaque proxy) — fall back to a
  // shared bucket. See design §1 "Session-based limiting" scenario for the
  // documented alternative when per-IP derivation is not possible.
  return "unknown";
}

/**
 * `mode: "correct"` branch (Work Unit 6, design §2 "Correction endpoint
 * fallback"): the client-side executor's network-correction layer, used
 * only after the deterministic fixer in `lib/duckdb/correctSql.ts` can't
 * confidently resolve a failing widget query. Counts against the per-widget
 * SQL-correction budget (≤2), never the plan re-ask budget (≤1) — the two
 * budgets stay independent per the widget-sql-execution spec.
 */
async function handleCorrectRequest(body: z.infer<typeof correctRequestBodySchema>) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse(500, {
      code: "unexpected",
      message: "El servicio de generación de dashboards no está configurado.",
    });
  }

  const client = new Anthropic({ apiKey });
  const { sql, error, profile } = body;

  const system = [
    "You are a DuckDB SQL correction assistant. You fix broken SQL — you never invent data or state a number.",
    "",
    `Table name: "${profile.tableName}"`,
    `Known columns: ${profile.columns.map((name) => `"${name}"`).join(", ")}`,
    "",
    "Failing SQL:",
    sql,
    "",
    "DuckDB error:",
    error,
    "",
    "Return ONLY the corrected SQL string. No prose, no markdown fences, no explanation — just the SQL.",
  ].join("\n");

  try {
    // Plain-text completion, not structured output — the response IS the
    // corrected SQL string. Thinking disabled: a mechanical SQL fix needs no
    // reasoning budget.
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: THINKING,
      system,
      messages: [{ role: "user", content: "Return the corrected SQL." }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const correctedSql = textBlock?.text.trim();
    if (!correctedSql) {
      return errorResponse(500, {
        code: "model_error",
        message: "No se pudo corregir la consulta SQL.",
      });
    }

    return Response.json({ ok: true, sql: correctedSql }, { status: 200 });
  } catch {
    return errorResponse(500, {
      code: "unexpected",
      message: "Ocurrió un error inesperado corrigiendo la consulta SQL.",
    });
  }
}

export async function POST(req: Request) {
  const clientIp = resolveClientIp(req);
  const rateLimit = planRateLimiter.check(clientIp);
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

  // `mode: "correct"` is a distinct request shape (widget SQL correction, not
  // plan generation) — dispatched before the plan-request validation below.
  if (typeof rawBody === "object" && rawBody !== null && "mode" in rawBody && rawBody.mode === "correct") {
    const parsedCorrectBody = correctRequestBodySchema.safeParse(rawBody);
    if (!parsedCorrectBody.success) {
      return errorResponse(400, {
        code: "invalid_request",
        message: "La solicitud de corrección no tiene el formato esperado ({ mode, sql, error, profile }).",
      });
    }
    return handleCorrectRequest(parsedCorrectBody.data);
  }

  const parsedBody = requestBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return errorResponse(400, {
      code: "invalid_request",
      message: "La solicitud no tiene el formato esperado ({ profile, comment }).",
    });
  }

  const { profile, comment } = parsedBody.data;

  // Golden rule chokepoint: buildPlanPayload is the ONLY place that reads
  // `profile` fields to build the model payload. No row-shaped data can
  // reach the model past this line (design §7).
  const payload = buildPlanPayload(profile, comment);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse(500, {
      code: "unexpected",
      message: "El servicio de generación de dashboards no está configurado.",
    });
  }

  const client = new Anthropic({ apiKey });

  const askModel = async (context: { isReask: boolean; validationError: string | undefined }) => {
    const system = buildSystemPrompt(payload, {
      isReask: context.isReask,
      validationError: context.validationError,
    });

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: THINKING,
      system,
      messages: [{ role: "user", content: payload.comment }],
      output_config: { format: zodOutputFormat(dashboardPlanSchema) },
    });

    return response.parsed_output;
  };

  try {
    const result = await resolvePlan(askModel);
    if (result.ok) {
      return Response.json({ ok: true, plan: result.plan }, { status: 200 });
    }
    // Structured plan errors are a normal, user-facing outcome the UI must
    // surface gracefully — HTTP 200 per design §1 response table.
    return Response.json({ ok: false, error: result.error }, { status: 200 });
  } catch {
    return errorResponse(500, {
      code: "unexpected",
      message: "Ocurrió un error inesperado generando el dashboard.",
    });
  }
}
