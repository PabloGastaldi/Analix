import type { ValueFormat } from "@/lib/schemas";

/**
 * Formats a chart/KPI value for display (design §3). `tabular-nums`-safe:
 * always plain ASCII digits, no locale surprises beyond thousands grouping.
 * null / undefined / NaN / non-numeric -> "—" (never blank, never "NaN").
 */
export function formatValue(
  value: unknown,
  valueFormat: ValueFormat | undefined,
): string {
  if (value === null || value === undefined) return "—";
  const num = typeof value === "number" ? value : Number(value);
  if (typeof value !== "number" || !Number.isFinite(num)) return "—";

  switch (valueFormat) {
    case "currency":
      return `$${num.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case "percent":
      return `${(num * 100).toLocaleString("es-AR", {
        maximumFractionDigits: 2,
      })}%`;
    case "number":
    default:
      return num.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  }
}
