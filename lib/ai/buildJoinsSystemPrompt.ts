import type { JoinsPayload } from "./buildJoinsPayload";

/**
 * Builds the system prompt sent to `claude-sonnet-5` for join inference
 * (design §3 "Constraining the model to code-detected candidates"). Receives
 * ONLY the already-projected `JoinsPayload` (metadata + candidate keys +
 * comment) — never a raw `TableProfile` or any row data. Lists the exact
 * candidate `(leftTable.leftColumn <-> rightTable.rightColumn)` pairs and
 * instructs the model to choose only among them or return `relationships: []`,
 * mirroring `buildSystemPrompt`'s structure.
 */
export function buildJoinsSystemPrompt(
  payload: JoinsPayload,
  options: { isReask?: boolean; validationError?: string } = {},
): string {
  const { isReask = false, validationError } = options;

  const tablesDescription = payload.tables
    .map((table) => {
      const columnsDescription = table.columns
        .map((column) => `  - "${column.name}" (rawType: ${column.rawType}, semanticType: ${column.semanticType})`)
        .join("\n");
      return [`Table "${table.tableName}" (rowCount: ${table.rowCount}):`, columnsDescription].join(
        "\n",
      );
    })
    .join("\n\n");

  const candidatesDescription = payload.candidateKeys
    .map((candidate) => {
      const estimatedNote = candidate.estimated ? " (estimated, sampled overlap)" : "";
      return `- ${candidate.leftTable}.${candidate.leftColumn} <-> ${candidate.rightTable}.${candidate.rightColumn} (overlap: ${candidate.overlap.toFixed(2)}, cardinality: ${candidate.cardinality}${estimatedNote})`;
    })
    .join("\n");

  const base = [
    "You are a join-inference assistant. You choose which detected candidate key pair best represents a real relationship between two tables — you never invent a column pair and you never compute or state a number yourself.",
    "",
    tablesDescription,
    "",
    "Candidate key pairs (code-detected, the ONLY pairs you may choose from):",
    candidatesDescription,
    "",
    `User comment: ${payload.comment}`,
    "",
    "Instructions:",
    "- Choose AT MOST ONE relationship, and ONLY from the candidate pairs listed above — using their exact leftTable/leftColumn/rightTable/rightColumn values. Never propose a column pair that is not in that list.",
    "- If no candidate pair looks like a real, meaningful relationship, return an empty `relationships: []` array. This is a valid, expected answer — do not force a join.",
    "- Choose `joinType`: `inner` for a strict matched-only relationship, `left` to keep all rows from the left table.",
    "- Set `cardinality` to the candidate's cardinality direction exactly as given.",
    "- Set `confidence` (0 to 1) reflecting how confident you are this is the intended relationship, considering the overlap ratio and the user's comment.",
    "- `rationale` is optional plain-language evidence, in the user's language.",
    "- Return ONLY JSON matching the required schema. No prose, no markdown fences.",
  ];

  if (isReask) {
    base.push(
      "",
      "Your previous response did not match the required schema or referenced a column pair outside the candidate list. Return ONLY valid JSON matching the schema, choosing exclusively from the listed candidate pairs (or an empty relationships array) — no prose, no markdown fences, no trailing commentary.",
      validationError ? `Validation error: ${validationError}` : "",
    );
  }

  return base.filter((line) => line !== undefined).join("\n");
}
