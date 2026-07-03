"use client";

import { useRef, useState } from "react";
import { useDataStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ColumnTag } from "@/components/data/ColumnTag";
import { cn } from "@/lib/utils";

/**
 * Multi-table workspace list (design §7, Slice 1). Activating a table
 * switches the plan/comment/summary/chat flow's target (`setActiveTable`,
 * which clears derived state per design §1). Inspecting a table shows its
 * profile without activating it. Removing drops the table independently —
 * one failed/removed table never affects the others.
 */
export function TableSwitcher() {
  const tables = useDataStore((s) => s.tables);
  const activeTableName = useDataStore((s) => s.activeTableName);
  const setActiveTable = useDataStore((s) => s.setActiveTable);
  const removeTable = useDataStore((s) => s.removeTable);
  const ingestFile = useDataStore((s) => s.ingestFile);
  const status = useDataStore((s) => s.status);
  const error = useDataStore((s) => s.error);
  const [inspecting, setInspecting] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const adding = status === "loading";

  if (tables.length === 0) return null;

  const inspectedTable = tables.find((table) => table.tableName === inspecting) ?? null;

  // Same per-file ingest as the Hero dropzone (design "Data flow" step 1): one
  // failing file must never block the others.
  function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      void ingestFile(file);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Tus archivos
        </h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={adding}
        >
          {adding ? "Leyendo…" : "Agregar archivo"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          multiple
          className="hidden"
          onChange={(event) => onFiles(event.target.files)}
        />
      </div>

      {status === "error" && error && (
        <p role="alert" className="text-sm font-medium text-negative">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {tables.map((table) => {
          const isActive = table.tableName === activeTableName;
          return (
            <li
              key={table.tableName}
              className={cn(
                "flex items-center justify-between gap-3 rounded-inner border px-3 py-2",
                isActive ? "border-brand bg-accent" : "border-border bg-muted",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveTable(table.tableName)}
                className={cn(
                  "flex flex-1 flex-col items-start gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive && "text-brand",
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {table.fileName}
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {table.profile.rowCount.toLocaleString("es-AR")}
                  </span>{" "}
                  filas ·{" "}
                  <span className="tabular-nums">
                    {table.profile.columns.length}
                  </span>{" "}
                  columnas
                  {table.kind === "join" && " · vista combinada"}
                </span>
                {table.fanOutWarning && isActive && (
                  <span className="text-xs text-negative">{table.fanOutWarning}</span>
                )}
              </button>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setInspecting((current) =>
                      current === table.tableName ? null : table.tableName,
                    )
                  }
                >
                  Inspeccionar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void removeTable(table.tableName)}
                  aria-label={`Quitar ${table.fileName}`}
                >
                  Quitar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {inspectedTable && (
        <div className="flex flex-col gap-2 rounded-inner border border-border bg-muted p-3">
          <span className="text-xs font-medium text-muted-foreground">
            {inspectedTable.fileName}
          </span>
          <div className="flex flex-wrap gap-2">
            {inspectedTable.profile.columns.map((column) => (
              <div key={column.name} className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">
                  {column.name}
                </span>
                <ColumnTag type={column.semanticType} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
