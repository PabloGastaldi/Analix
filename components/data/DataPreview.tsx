"use client";

import { useDataStore } from "@/lib/store";
import { ColumnTag } from "@/components/data/ColumnTag";
import { TypeEditor } from "@/components/data/TypeEditor";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function renderCell(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/40">—</span>;
  }
  return String(value);
}

export function DataPreview() {
  const activeTable = useDataStore((s) => s.activeTable());
  const updateColumnType = useDataStore((s) => s.updateColumnType);
  const reset = useDataStore((s) => s.reset);

  if (!activeTable) return null;
  const { profile, previewRows, fileName } = activeTable;
  const columns = profile.columns;

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-muted-foreground">
            Así leímos tus datos
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {fileName ?? "Tu archivo"}
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="tabular-nums font-medium text-foreground">
              {profile.rowCount.toLocaleString("es-AR")}
            </span>{" "}
            filas ·{" "}
            <span className="tabular-nums font-medium text-foreground">
              {columns.length}
            </span>{" "}
            columnas · vista previa de las primeras {previewRows.length}
          </p>
        </div>
        <Button variant="outline" onClick={reset}>
          Empezar de nuevo
        </Button>
      </header>

      <div className="overflow-x-auto rounded-card border border-border bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.name}
                  className="min-w-44 align-top"
                >
                  <div className="flex flex-col gap-2 py-3">
                    <span className="font-medium text-foreground">
                      {column.name}
                    </span>
                    <ColumnTag type={column.semanticType} />
                    <TypeEditor
                      value={column.semanticType}
                      onChange={(type) => updateColumnType(column.name, type)}
                    />
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell
                    key={column.name}
                    className="max-w-64 truncate font-mono text-xs tabular-nums"
                  >
                    {renderCell(row[column.name])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
