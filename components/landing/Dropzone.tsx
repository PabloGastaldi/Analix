"use client";

import { useCallback, useRef, useState } from "react";
import { useDataStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 15V3" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function Dropzone() {
  const ingestFile = useDataStore((s) => s.ingestFile);
  const status = useDataStore((s) => s.status);
  const error = useDataStore((s) => s.error);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const loading = status === "loading";

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return;
      // Ingest independently per file (design §"Data flow" step 1): one
      // failing file must never block the others.
      for (const file of Array.from(files)) {
        void ingestFile(file);
      }
    },
    [ingestFile],
  );

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onFiles(event.dataTransfer.files);
        }}
        disabled={loading}
        className={cn(
          "group flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed border-border bg-card/70 p-8 text-center transition-colors",
          "hover:border-primary/60 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          dragging && "border-primary bg-accent",
          loading && "cursor-progress opacity-80",
        )}
      >
        <span
          className={cn(
            "flex size-12 items-center justify-center rounded-full bg-accent text-primary transition-transform",
            loading ? "animate-pulse" : "group-hover:-translate-y-0.5",
          )}
        >
          <UploadIcon className="size-6" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="font-medium text-foreground">
            {loading
              ? "Leyendo tus datos…"
              : "Arrastrá tu archivo o hacé clic para subirlo"}
          </span>
          <span className="text-sm text-muted-foreground">
            Se procesa en tu navegador. Tus datos no salen de acá.
          </span>
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        multiple
        className="hidden"
        onChange={(event) => onFiles(event.target.files)}
      />

      {error && (
        <p role="alert" className="text-sm font-medium text-negative">
          {error}
        </p>
      )}
    </div>
  );
}
