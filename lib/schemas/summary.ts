import { z } from "zod";

/**
 * Narrative summary contracts (§Fase 3). The LLM (Sonnet) turns the profile
 * stats + dashboard plan + aggregated widget results into a few written
 * insights — using ONLY the provided numbers, never inventing. Validated with
 * Zod before rendering, like every other model response.
 */

export const summaryInsightSchema = z.object({
  /** The insight sentence, in the user's language. */
  text: z.string(),
  /**
   * The single key datum from `text` to highlight (e.g. "$7.919,70", "45%",
   * "Sur"). Must be a substring of `text` so the UI can emphasize it in place.
   */
  highlight: z.string(),
});
export type SummaryInsight = z.infer<typeof summaryInsightSchema>;

export const dashboardSummarySchema = z.object({
  /** 3-5 insights (guideline). Kept lenient so a short-but-valid summary passes. */
  insights: z.array(summaryInsightSchema).min(1),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

/** Structured, user-safe error returned by the summary route on failure. */
export type SummaryError = {
  code: "invalid_request" | "model_error" | "rate_limited" | "unexpected";
  message: string;
};
