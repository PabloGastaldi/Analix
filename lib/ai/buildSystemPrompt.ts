import type { PlanPayload } from "./buildPlanPayload";

/**
 * Builds the system prompt sent to `claude-sonnet-5` (design §1 "System-
 * prompt strategy"). Receives ONLY the already-projected `PlanPayload`
 * (metadata + comment) — never the raw `TableProfile` or any row data, so
 * this function cannot accidentally leak more than `buildPlanPayload`
 * already allowed through.
 *
 * `isReask` + `validationError` let the caller ask again with an explicit
 * "return ONLY JSON matching the schema" instruction plus the previous
 * validation failure (design §1 "Fallback" row).
 */
export function buildSystemPrompt(
  payload: PlanPayload,
  options: { isReask?: boolean; validationError?: string } = {},
): string {
  const { isReask = false, validationError } = options;

  const columnsDescription = payload.columns
    .map((column) => {
      const { stats } = column;
      const sampleValues = stats.sampleValues.map((value) => JSON.stringify(value)).join(", ");
      return [
        `- "${column.name}" (rawType: ${column.rawType}, semanticType: ${column.semanticType})`,
        `  stats: count=${stats.count}, nullCount=${stats.nullCount}, distinctCount=${stats.distinctCount}` +
          (stats.min !== undefined ? `, min=${stats.min}` : "") +
          (stats.max !== undefined ? `, max=${stats.max}` : "") +
          (stats.mean !== undefined ? `, mean=${stats.mean}` : "") +
          (stats.stddev !== undefined ? `, stddev=${stats.stddev}` : ""),
        `  sampleValues: [${sampleValues}]`,
      ].join("\n");
    })
    .join("\n");

  const base = [
    "You are a dashboard planning assistant. You design SQL-driven dashboard widgets — you never compute or state a number yourself.",
    "",
    `Table name: "${payload.tableName}"`,
    `Row count: ${payload.rowCount}`,
    "",
    "Columns:",
    columnsDescription,
    "",
    `User comment: ${payload.comment}`,
    "",
    "Instructions:",
    `- Emit valid DuckDB SQL that queries the table by its exact name, "${payload.tableName}", quoting identifiers with double quotes.`,
    "- Plan 4 to 8 widgets. Choose chartType from each column's semanticType: temporal -> line, categorical_low -> bar or donut, measure_continuous -> histogram, a single aggregate value -> kpi. Never chart id or text columns.",
    "- For every widget, provide an encoding (x, y, series, valueFormat) naming the actual SQL result columns.",
    "- You write SQL. You never state a number, total, or statistic directly — the query result is the only source of truth.",
    "- Return ONLY JSON matching the required schema. No prose, no markdown fences.",
  ];

  if (isReask) {
    base.push(
      "",
      "Your previous response did not match the required schema. Return ONLY valid JSON matching the schema — no prose, no markdown fences, no trailing commentary.",
      validationError ? `Validation error: ${validationError}` : "",
    );
  }

  return base.filter((line) => line !== undefined).join("\n");
}
