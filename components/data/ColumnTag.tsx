import type { SemanticType } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const TAG: Record<SemanticType, { label: string; dot: string }> = {
  temporal: { label: "temporal", dot: "bg-brand" },
  measure_continuous: { label: "medida", dot: "bg-teal" },
  measure_discrete: { label: "medida", dot: "bg-teal" },
  categorical_low: { label: "categoría", dot: "bg-chart-3" },
  categorical_high: { label: "categoría", dot: "bg-chart-3" },
  id: { label: "id", dot: "bg-muted-foreground" },
  boolean: { label: "booleano", dot: "bg-positive" },
  text: { label: "texto", dot: "bg-muted-foreground" },
};

export function ColumnTag({
  type,
  className,
}: {
  type: SemanticType;
  className?: string;
}) {
  const { label, dot } = TAG[type];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}
