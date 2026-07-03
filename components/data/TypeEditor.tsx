"use client";

import type { SemanticType } from "@/lib/schemas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OPTIONS: { value: SemanticType; label: string }[] = [
  { value: "temporal", label: "Temporal" },
  { value: "measure_continuous", label: "Medida (continua)" },
  { value: "measure_discrete", label: "Medida (discreta)" },
  { value: "categorical_low", label: "Categoría" },
  { value: "categorical_high", label: "Categoría (muchas)" },
  { value: "id", label: "ID" },
  { value: "boolean", label: "Booleano" },
  { value: "text", label: "Texto" },
];

export function TypeEditor({
  value,
  onChange,
}: {
  value: SemanticType;
  onChange: (type: SemanticType) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SemanticType)}>
      <SelectTrigger className="h-7 w-full text-xs" aria-label="Corregir tipo de columna">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
