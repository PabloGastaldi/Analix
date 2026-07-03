import { z } from "zod";
import { widgetSchema } from "./plan";

/**
 * Chat text-to-SQL contracts (§Fase 4). A question + the schema go to the LLM,
 * which answers with a single `Widget` (SQL + how to visualize it). DuckDB
 * computes the number; the model never states one. Validated with Zod before
 * any SQL touches the engine, like every other model response.
 */

export const chatResponseSchema = z.object({
  /** The widget that answers the question — a `kpi` for a scalar, a chart for a distribution. */
  widget: widgetSchema,
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

/** Structured, user-safe error returned by the chat route on failure. */
export type ChatError = {
  code: "invalid_request" | "model_error" | "rate_limited" | "unexpected";
  message: string;
};
