/** Deterministic download filename, e.g. "analix-dashboard-2026-07-02.png". */
export function exportFilename(kind: "png" | "pdf", date: Date = new Date()): string {
  const iso = date.toISOString().slice(0, 10);
  return `analix-dashboard-${iso}.${kind}`;
}
