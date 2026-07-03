const PRACTICES: { title: string; body: string; good: string; bad: string }[] = [
  {
    title: "Headers limpios en la primera fila",
    body: "Una sola fila de encabezados, con nombres cortos y claros.",
    good: "fecha · region · ventas",
    bad: "títulos partidos en dos filas",
  },
  {
    title: "Una fila por registro",
    body: "Cada fila, un caso. Sin subtotales ni filas de resumen en el medio.",
    good: "1 venta = 1 fila",
    bad: "una fila “TOTAL” intercalada",
  },
  {
    title: "Fechas en un solo formato",
    body: "Elegí uno y mantenelo en toda la columna, de arriba a abajo.",
    good: "2024-01-05",
    bad: "5/1/24 · 05-ene · 2024.01.05",
  },
  {
    title: "Sin celdas combinadas",
    body: "Cada celda con su propio valor; las combinadas rompen la lectura.",
    good: "cada celda con su dato",
    bad: "una celda combinada entre filas",
  },
  {
    title: "Una cosa por columna",
    body: "No mezcles dos datos en una celda; separalos en columnas distintas.",
    good: "nombre | region",
    bad: "“Juan – Norte” en una celda",
  },
  {
    title: "Números limpios",
    body: "En columnas numéricas, solo el número. Sin símbolos ni texto.",
    good: "1290.50",
    bad: "“$ 1.290,50 aprox”",
  },
];

/** Small good/bad evidence chip. */
function Chip({ tone, children }: { tone: "good" | "bad"; children: string }) {
  const isGood = tone === "good";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        aria-hidden
        className={`grid size-4 place-items-center rounded-full text-[10px] font-bold ${
          isGood ? "bg-positive text-ink" : "bg-negative text-white"
        }`}
      >
        {isGood ? "✓" : "✕"}
      </span>
      <span className={isGood ? "text-white" : "text-white/45 line-through"}>
        {children}
      </span>
    </span>
  );
}

/**
 * Landing section 3 — "Buenas prácticas". Inverted-contrast section (ink
 * background, paper text) — the strong visual beat of the page. Two-column
 * grid of practices, each with a good/bad data chip. Flat bordered blocks with
 * an electric hover edge, never soft floating cards.
 */
export function DataPractices() {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto w-full max-w-6xl px-6 py-28 lg:px-10">
        <div className="flex max-w-2xl flex-col gap-5">
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-electric-2">
            Para que salga afilado
          </span>
          <h2 className="font-display text-4xl leading-[1.05] sm:text-5xl">
            Entra ordenado, sale <span className="text-electric-gradient">afilado</span>.
          </h2>
          <p className="text-lg leading-relaxed text-white/60">
            El tablero es tan bueno como los datos que le das. Estas seis cosas hacen
            la diferencia entre un resultado exacto y uno confuso:
          </p>
        </div>

        <ul className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-[20px] border-2 border-white/15 bg-white/15 md:grid-cols-2">
          {PRACTICES.map((practice) => (
            <li
              key={practice.title}
              className="flex flex-col gap-3 bg-ink p-6 transition-colors hover:bg-white/[0.04]"
            >
              <h3 className="text-lg font-semibold text-white">{practice.title}</h3>
              <p className="text-sm leading-relaxed text-white/55">{practice.body}</p>
              <div className="mt-1 flex flex-col gap-1.5">
                <Chip tone="good">{practice.good}</Chip>
                <Chip tone="bad">{practice.bad}</Chip>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
