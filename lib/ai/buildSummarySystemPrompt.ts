import type { AskModelContext } from "./planFallback";
import type { SummaryPayload } from "./buildSummaryPayload";

/**
 * System prompt for the narrative summary (§Fase 3). Receives ONLY the already
 * projected `SummaryPayload` (dataset stats + widget aggregates, no raw rows),
 * so it cannot leak more than `buildSummaryPayload` allowed through. The
 * anti-hallucination rule is the whole point: the model narrates the provided
 * numbers, it never computes or invents one.
 */
export function buildSummarySystemPrompt(
  payload: SummaryPayload,
  context: Pick<AskModelContext, "isReask" | "validationError">,
): string {
  const lines = [
    "Sos un analista de datos que escribe un resumen ejecutivo breve para un dashboard.",
    "",
    "Reglas ESTRICTAS:",
    "- Usá SOLO los números provistos abajo (estadísticas del dataset y resultados de los widgets). NUNCA inventes, estimes ni calcules un número que no esté literalmente en los datos.",
    "- Escribí en el mismo idioma de los datos (español rioplatense si están en español).",
    "- Devolvé entre 3 y 5 insights. Cada insight tiene: una oración clara y el dato clave a resaltar.",
    "- El campo `highlight` DEBE ser un substring textual y exacto de `text` (para poder resaltarlo en la interfaz).",
    "- Priorizá lo relevante para el negocio: líderes y rezagados, totales, extremos, proporciones, tendencias.",
    "- Voz activa, sin relleno. No repitas el mismo dato en dos insights.",
    "",
    "Datos del dashboard (JSON):",
    JSON.stringify(payload),
  ];

  if (context.isReask && context.validationError) {
    lines.push(
      "",
      `Tu respuesta anterior no cumplió el formato requerido (${context.validationError}). Devolvé únicamente JSON válido que cumpla el schema.`,
    );
  }

  return lines.join("\n");
}
