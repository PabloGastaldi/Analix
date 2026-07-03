import { z } from "zod";

/**
 * Data-profiling contracts (§5). Produced deterministically in `lib/profile/`
 * from the parsed table — never by the LLM. Shared by front, API and validation.
 */

export const semanticTypeSchema = z.enum([
  "id", // almost all unique -> do not chart
  "categorical_low", // few categories -> bar/donut
  "categorical_high", // many categories -> top-N table
  "measure_continuous", // price, temperature -> histogram / Y axis
  "measure_discrete", // integer counts
  "temporal", // date -> time series
  "boolean",
  "text", // free text -> do not chart
]);
export type SemanticType = z.infer<typeof semanticTypeSchema>;

export const rawTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "mixed",
]);
export type RawType = z.infer<typeof rawTypeSchema>;

export const columnStatsSchema = z.object({
  count: z.number().int().nonnegative(),
  nullCount: z.number().int().nonnegative(),
  distinctCount: z.number().int().nonnegative(),
  min: z.union([z.number(), z.string()]).optional(),
  max: z.union([z.number(), z.string()]).optional(),
  mean: z.number().optional(),
  stddev: z.number().optional(),
  /** 3-5 example values, for the LLM's context. */
  sampleValues: z.array(z.union([z.string(), z.number()])),
});
export type ColumnStats = z.infer<typeof columnStatsSchema>;

export const columnProfileSchema = z.object({
  name: z.string(),
  rawType: rawTypeSchema,
  semanticType: semanticTypeSchema,
  stats: columnStatsSchema,
});
export type ColumnProfile = z.infer<typeof columnProfileSchema>;

export const tableProfileSchema = z.object({
  tableName: z.string(),
  rowCount: z.number().int().nonnegative(),
  columns: z.array(columnProfileSchema),
});
export type TableProfile = z.infer<typeof tableProfileSchema>;
