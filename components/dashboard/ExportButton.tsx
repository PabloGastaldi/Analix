"use client";

import { useState, type RefObject } from "react";
import {
  exportDashboardToPng,
  exportDashboardToPdf,
} from "@/lib/export/exportDashboard";
import { Button } from "@/components/ui/button";

/**
 * Download the dashboard region (`targetRef`) as PNG or PDF (§Fase 5). Uses
 * html-to-image to capture the live DOM, so the file matches what's on screen.
 */
export function ExportButton({
  targetRef,
}: {
  targetRef: RefObject<HTMLElement | null>;
}) {
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
  const [failed, setFailed] = useState(false);

  const run = async (kind: "png" | "pdf") => {
    const node = targetRef.current;
    if (!node || busy) return;
    setBusy(kind);
    setFailed(false);
    try {
      if (kind === "png") await exportDashboardToPng(node);
      else await exportDashboardToPdf(node);
    } catch {
      // A failed export must never break the page.
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {failed ? (
        <span className="text-sm text-negative">No se pudo generar la descarga.</span>
      ) : (
        <span className="text-sm text-muted-foreground">Descargar:</span>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => run("png")}
      >
        {busy === "png" ? "Generando…" : "PNG"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={busy !== null}
        onClick={() => run("pdf")}
      >
        {busy === "pdf" ? "Generando…" : "PDF"}
      </Button>
    </div>
  );
}
