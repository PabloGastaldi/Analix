import type { AskModelContext } from "./planFallback";
import type { PlanPayload } from "./buildPlanPayload";

/**
 * System prompt for the chat text-to-SQL route (§Fase 4). Receives ONLY the
 * projected `PlanPayload` (schema + stats + the question, no rows). The model
 * answers with a single widget (SQL + how to visualize it); DuckDB computes the
 * number — the model never states one.
 */
export function buildChatSystemPrompt(
  payload: PlanPayload,
  context: Pick<AskModelContext, "isReask" | "validationError">,
): string {
  const { comment, ...schema } = payload;

  const lines = [
    "Sos un analista de datos. Respondés UNA pregunta sobre una tabla generando un único widget que la contesta.",
    "",
    "Reglas ESTRICTAS:",
    "- El número lo calcula el motor (DuckDB), NO vos. Nunca afirmes un valor: devolvés el SQL que lo obtiene.",
    "- Escribí SQL válido de DuckDB contra la tabla indicada, usando SOLO las columnas del esquema. Citá los identificadores con comillas dobles.",
    "- Elegí el chartType adecuado: 'kpi' para una respuesta escalar (un único número), 'line' para series temporales, 'bar' o 'donut' para categorías, 'table' para detalle. Definí el encoding (x/y/valueFormat) cuando corresponda.",
    "- El título del widget describe la respuesta, en el idioma de la pregunta (ej. 'Mes de mayor venta').",
    "- Devolvé UN solo widget, el que responda la pregunta de la forma más directa.",
    "",
    `Esquema de la tabla (JSON): ${JSON.stringify(schema)}`,
    "",
    `Pregunta del usuario: ${comment}`,
  ];

  if (context.isReask && context.validationError) {
    lines.push(
      "",
      `Tu respuesta anterior no cumplió el formato (${context.validationError}). Devolvé únicamente JSON válido que cumpla el schema { widget }.`,
    );
  }

  return lines.join("\n");
}
