"use client";

import { useDataStore } from "@/lib/store";
import { Button } from "@/components/ui/button";

/**
 * Textarea + generate button (design §4). Calls `store.generatePlan()`;
 * disabled + pending state while `planStatus === "planning"`. Active-voice
 * Spanish UI copy, per project convention (see `DataPreview.tsx`).
 */
export function CommentInput() {
  const comment = useDataStore((s) => s.comment);
  const planStatus = useDataStore((s) => s.planStatus);
  const setComment = useDataStore((s) => s.setComment);
  const generatePlan = useDataStore((s) => s.generatePlan);

  const isPending = planStatus === "planning" || planStatus === "executing";

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void generatePlan();
      }}
    >
      <label htmlFor="dashboard-comment" className="text-sm font-medium text-foreground">
        ¿Qué querés ver en tus datos?
      </label>
      <textarea
        id="dashboard-comment"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Mostrame lo más importante"
        disabled={planStatus === "planning"}
        rows={3}
        className="w-full resize-none rounded-inner border border-border bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      />
      <div>
        <Button type="submit" disabled={isPending || comment.trim().length === 0}>
          {planStatus === "planning"
            ? "Generando…"
            : planStatus === "executing"
              ? "Calculando…"
              : "Generar dashboard"}
        </Button>
      </div>
    </form>
  );
}
