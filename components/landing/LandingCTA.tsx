/**
 * Landing closing CTA — sends the user back up to the hero dropzone (#top).
 * Paper background, asymmetric statement + a single electric button (not a
 * centered two-button hero). Reuses the electric accent, no gradient wash.
 */
export function LandingCTA() {
  return (
    <section className="border-t-2 border-ink/10 bg-paper text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-6 py-24 lg:flex-row lg:items-end lg:justify-between lg:px-10">
        <div className="flex max-w-xl flex-col gap-4">
          <h2 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Probá con tu propio archivo.
          </h2>
          <p className="text-lg leading-relaxed text-slate">
            Subís, escribís qué querés ver, y listo. Se procesa en tu navegador —
            tus datos no salen de acá.
          </p>
        </div>

        <a
          href="#top"
          className="group inline-flex shrink-0 items-center gap-2 rounded-full bg-electric px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          Subí tu archivo
          <span aria-hidden className="transition-transform group-hover:-translate-y-0.5">
            ↑
          </span>
        </a>
      </div>
    </section>
  );
}
