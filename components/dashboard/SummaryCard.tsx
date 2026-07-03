"use client";

import { useDataStore } from "@/lib/store";
import type { SummaryInsight } from "@/lib/schemas";

/** Emphasizes the insight's key datum (a substring of `text`) in the primary color. */
function HighlightedText({ text, highlight }: SummaryInsight) {
  const index = highlight ? text.indexOf(highlight) : -1;
  if (index === -1) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, index)}
      <strong className="font-semibold text-primary">{highlight}</strong>
      {text.slice(index + highlight.length)}
    </>
  );
}

/**
 * "Resumen automático" card (§Fase 3). Written insights whose key datum is
 * highlighted in the primary color. Numbers come from the engine via the
 * summary route — the model narrates, it never invents.
 */
export function SummaryCard() {
  const status = useDataStore((s) => s.summaryStatus);
  const summary = useDataStore((s) => s.summary);

  if (status === "idle") return null;

  return (
    <section className="rounded-card border border-border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-teal" />
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Resumen automático
        </h2>
      </div>

      {status === "loading" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Generando el resumen…
        </p>
      )}

      {status === "error" && (
        <p className="mt-4 text-sm text-muted-foreground">
          No pudimos generar el resumen esta vez.
        </p>
      )}

      {status === "ready" && summary && (
        <ul className="mt-4 flex flex-col gap-3">
          {summary.insights.map((insight, index) => (
            <li key={index} className="flex gap-3 text-sm leading-relaxed text-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
              <span>
                <HighlightedText text={insight.text} highlight={insight.highlight} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
