const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Subí tu archivo",
    body: "CSV o Excel. Se lee en tu navegador; los datos no viajan a ningún servidor.",
  },
  {
    n: "02",
    title: "Decile qué querés ver",
    body: "Escribí en tus palabras: “ventas por región, últimos 6 meses”. La IA planifica, el motor calcula.",
  },
  {
    n: "03",
    title: "Explorá y compartí",
    body: "Gráficos, un resumen escrito y un chat sobre tus datos. Descargá el tablero en PNG o PDF.",
  },
];

/**
 * Landing section 2 — "Cómo funciona". Big Calistoga numerals in a stepped
 * (diagonally offset) rhythm instead of the round-icon 3-grid. Paper
 * background; alternates layout with the asymmetric section above.
 */
export function HowItWorks() {
  return (
    <section className="border-t-2 border-ink/10 bg-paper text-ink">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 lg:px-10">
        <div className="flex flex-col gap-4">
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-electric">
            Cómo funciona
          </span>
          <h2 className="max-w-2xl font-display text-4xl leading-[1.05] sm:text-5xl">
            Tres pasos. Cero fórmulas.
          </h2>
        </div>

        <ol className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-3 lg:gap-8 lg:[--step-offset:2.5rem]">
          {STEPS.map((step, index) => (
            <li
              key={step.n}
              className="flex flex-col gap-4 border-t-2 border-ink pt-5"
              // Diagonal stepping on wide screens — each step nudged lower.
              style={{ marginTop: `calc(var(--step-offset, 0px) * ${index})` }}
            >
              <span className="font-display text-6xl leading-none text-electric-gradient">
                {step.n}
              </span>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="text-base leading-relaxed text-slate">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
