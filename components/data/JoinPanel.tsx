"use client";

import { useEffect, useState } from "react";
import { useDataStore } from "@/lib/store";
import type { JoinRelationship, JoinType } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Confirmed-join proposal panel (design §7, Slice 2). Renders only when
 * `detectAndProposeJoin` found ≥1 candidate and the model returned an
 * inferred relationship. Shows the inferred join in plain language with its
 * overlap evidence, and lets the user confirm / correct (swap key columns
 * among candidates, toggle join type) / reject. Never auto-applies — nothing
 * is built until `confirmJoin` runs.
 */
export function JoinPanel() {
  const tables = useDataStore((s) => s.tables);
  const candidateKeys = useDataStore((s) => s.candidateKeys);
  const joinProposal = useDataStore((s) => s.joinProposal);
  const joinProposalStatus = useDataStore((s) => s.joinProposalStatus);
  const joinProposalError = useDataStore((s) => s.joinProposalError);
  const detectAndProposeJoin = useDataStore((s) => s.detectAndProposeJoin);
  const confirmJoin = useDataStore((s) => s.confirmJoin);
  const rejectJoinProposal = useDataStore((s) => s.rejectJoinProposal);

  const proposedRelationship = joinProposal?.relationships[0] ?? null;
  const [selected, setSelected] = useState<JoinRelationship | null>(proposedRelationship);
  // Tracks which proposal `selected` was last derived from, so a fresh
  // proposal resets the user's in-progress correction (swap/toggle) without
  // calling setState from inside an effect (React "adjust state during
  // render" pattern instead of useEffect + setState).
  const [derivedFrom, setDerivedFrom] = useState<JoinRelationship | null>(proposedRelationship);
  if (proposedRelationship !== derivedFrom) {
    setDerivedFrom(proposedRelationship);
    setSelected(proposedRelationship);
  }

  // Re-run detection whenever the set of tables changes (new file ingested,
  // one removed) — off the ingest critical path, per design §"Data flow" step 4.
  useEffect(() => {
    if (tables.length >= 2) {
      void detectAndProposeJoin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.length]);

  if (tables.length < 2) return null;
  if (joinProposalStatus === "detecting" || joinProposalStatus === "proposing") {
    return (
      <section className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-card">
        <p className="text-sm text-muted-foreground">Buscando relaciones entre tus archivos…</p>
      </section>
    );
  }

  if (!selected || candidateKeys.length === 0) return null;

  const candidate = candidateKeys.find(
    (key) =>
      key.leftTable === selected.leftTable &&
      key.leftColumn === selected.leftColumn &&
      key.rightTable === selected.rightTable &&
      key.rightColumn === selected.rightColumn,
  );

  const overlapPercent = candidate ? Math.round(candidate.overlap * 100) : null;
  const fanOut = selected.cardinality !== "one-to-one";

  function updateJoinType(joinType: JoinType) {
    setSelected((current) => (current ? { ...current, joinType } : current));
  }

  function selectCandidate(next: (typeof candidateKeys)[number]) {
    setSelected((current) =>
      current
        ? {
            ...current,
            leftTable: next.leftTable,
            leftColumn: next.leftColumn,
            rightTable: next.rightTable,
            rightColumn: next.rightColumn,
            cardinality: next.cardinality,
          }
        : current,
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Encontramos una posible relación
        </h2>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {selected.leftTable}.{selected.leftColumn}
          </span>{" "}
          se relaciona con{" "}
          <span className="font-medium text-foreground">
            {selected.rightTable}.{selected.rightColumn}
          </span>
          {overlapPercent !== null && (
            <>
              {" "}
              — <span className="tabular-nums">{overlapPercent}%</span> de coincidencia
            </>
          )}
          {candidate?.estimated && " (aproximado, sobre una muestra)"}
        </p>
        {selected.rationale && (
          <p className="text-xs text-muted-foreground">{selected.rationale}</p>
        )}
      </div>

      {candidateKeys.length > 1 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Otras columnas candidatas
          </span>
          <div className="flex flex-wrap gap-1">
            {candidateKeys.map((key) => {
              const isSelected =
                key.leftTable === selected.leftTable &&
                key.leftColumn === selected.leftColumn &&
                key.rightTable === selected.rightTable &&
                key.rightColumn === selected.rightColumn;
              return (
                <button
                  key={`${key.leftTable}.${key.leftColumn}-${key.rightTable}.${key.rightColumn}`}
                  type="button"
                  onClick={() => selectCandidate(key)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs font-medium",
                    isSelected
                      ? "border-brand bg-accent text-brand"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  {key.leftTable}.{key.leftColumn} ↔ {key.rightTable}.{key.rightColumn}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Tipo de unión</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => updateJoinType("inner")}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium",
              selected.joinType === "inner"
                ? "border-brand bg-accent text-brand"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            Solo coincidencias
          </button>
          <button
            type="button"
            onClick={() => updateJoinType("left")}
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium",
              selected.joinType === "left"
                ? "border-brand bg-accent text-brand"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            Mantener todo de {selected.leftTable}
          </button>
        </div>
      </div>

      {fanOut && (
        <p className="text-xs text-negative">
          Esta relación repite filas de un lado por cada coincidencia del otro — los totales
          pueden estar inflados por filas duplicadas.
        </p>
      )}

      {joinProposalStatus === "error" && joinProposalError && (
        <p role="alert" className="text-sm font-medium text-negative">
          {joinProposalError}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" onClick={() => void confirmJoin(selected)}>
          Confirmar
        </Button>
        <Button type="button" variant="outline" onClick={rejectJoinProposal}>
          Descartar
        </Button>
      </div>
    </section>
  );
}
