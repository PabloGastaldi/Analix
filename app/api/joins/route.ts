import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { tableProfileSchema, joinPlanSchema, type JoinError } from "@/lib/schemas";
import {
  buildJoinsPayload,
  buildJoinsSystemPrompt,
  resolveJoins,
  joinsRateLimiter,
} from "@/lib/ai";
import type { CandidateKey } from "@/lib/joins/rankCandidates";

// Node.js runtime (default) — the Anthropic SDK needs Node, not the Edge runtime.

const MODEL = "claude-sonnet-5";
// Thinking disabled for the same reason as `app/api/plan/route.ts`: join
// inference is a structured "choose among these candidates" translation
// task, not open-ended reasoning.
const MAX_TOKENS = 4096;
const THINKING = { type: "disabled" } as const;
const MAX_COMMENT_LENGTH = 2000;

const candidateKeySchema = z.object({
  leftTable: z.string(),
  leftColumn: z.string(),
  rightTable: z.string(),
  rightColumn: z.string(),
  distinctLeft: z.number().int().nonnegative(),
  distinctRight: z.number().int().nonnegative(),
  shared: z.number().int().nonnegative(),
  overlap: z.number(),
  coverageLeftToRight: z.number(),
  coverageRightToLeft: z.number(),
  cardinality: z.enum(["one-to-one", "one-to-many", "many-to-one"]),
  estimated: z.boolean(),
}) satisfies z.ZodType<CandidateKey>;

const requestBodySchema = z.object({
  profiles: z.array(tableProfileSchema).min(2),
  candidates: z.array(candidateKeySchema).min(1),
  comment: z.string().trim().max(MAX_COMMENT_LENGTH).optional().default(""),
});

function errorResponse(status: number, error: JoinError) {
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
  return "unknown";
}

export async function POST(req: Request) {
  const clientIp = resolveClientIp(req);
  const rateLimit = joinsRateLimiter.check(clientIp);
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
      message: "La solicitud no tiene el formato esperado ({ profiles, candidates, comment? }).",
    });
  }

  const { profiles, candidates, comment } = parsedBody.data;

  // Golden rule chokepoint: buildJoinsPayload is the ONLY place that reads
  // `profiles`/`candidates` fields to build the model payload. No row-shaped
  // data or raw distinct-value sets can reach the model past this line.
  const payload = buildJoinsPayload(profiles, candidates, comment);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse(500, {
      code: "unexpected",
      message: "El servicio de inferencia de relaciones no está configurado.",
    });
  }

  const client = new Anthropic({ apiKey });

  const askModel = async (context: { isReask: boolean; validationError: string | undefined }) => {
    const system = buildJoinsSystemPrompt(payload, {
      isReask: context.isReask,
      validationError: context.validationError,
    });

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: THINKING,
      system,
      messages: [{ role: "user", content: payload.comment || "Sin comentario adicional." }],
      output_config: { format: zodOutputFormat(joinPlanSchema) },
    });

    return response.parsed_output;
  };

  try {
    const result = await resolveJoins(askModel, candidates);
    if (result.ok) {
      return Response.json({ ok: true, plan: result.plan }, { status: 200 });
    }
    // Structured join errors are a normal, user-facing degrade outcome the
    // UI must surface gracefully (per-table experience continues) — HTTP 200.
    return Response.json({ ok: false, error: result.error }, { status: 200 });
  } catch {
    return errorResponse(500, {
      code: "unexpected",
      message: "Ocurrió un error inesperado infiriendo la relación entre tablas.",
    });
  }
}
