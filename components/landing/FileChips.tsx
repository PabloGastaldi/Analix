const FORMATS = ["CSV", "XLSX", "XLS"];

export function FileChips() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Formatos:</span>
      {FORMATS.map((format) => (
        <span
          key={format}
          className="rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs font-medium text-muted-foreground"
        >
          {format}
        </span>
      ))}
    </div>
  );
}
