import { z } from "zod";

/**
 * Join-plan contracts (design §3). This is what `/api/joins` returns: a
 * model-proposed join relationship between two candidate-key columns.
 * Validated with Zod BEFORE any `CREATE VIEW` touches DuckDB, mirroring the
 * discipline of `dashboardPlanSchema`.
 */

/** MVP: `inner` + `left` only (design §3 "Join-type set"). */
export const joinTypeSchema = z.enum(["inner", "left"]);
export type JoinType = z.infer<typeof joinTypeSchema>;

export const joinRelationshipSchema = z.object({
  leftTable: z.string(),
  leftColumn: z.string(),
  rightTable: z.string(),
  rightColumn: z.string(),
  joinType: joinTypeSchema,
  cardinality: z.enum(["one-to-one", "one-to-many", "many-to-one"]),
  confidence: z.number().min(0).max(1),
  /** Plain-language evidence, in the user's language. */
  rationale: z.string().optional(),
});
export type JoinRelationship = z.infer<typeof joinRelationshipSchema>;

export const joinPlanSchema = z.object({
  // Empty array is a valid, first-class "nothing relates" answer -> degrade.
  relationships: z.array(joinRelationshipSchema).max(1), // pairwise, one join this change
});
export type JoinPlan = z.infer<typeof joinPlanSchema>;

/** Structured, user-safe error returned by the joins route on failure. */
export type JoinError = {
  code: "invalid_request" | "model_error" | "rate_limited" | "unexpected";
  message: string;
};
