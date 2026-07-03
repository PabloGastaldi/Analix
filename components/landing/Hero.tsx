import { Dropzone } from "./Dropzone";
import { FileChips } from "./FileChips";

export function Hero() {
  return (
    <section className="relative flex min-h-[560px] flex-1 items-center overflow-hidden lg:min-h-[760px]">
      {/*
        The dashboard illustration IS the product — shown at full opacity,
        anchored to the right edge and allowed to bleed off-screen so it reads
        as a real app continuing beyond the viewport. Not a background texture.
      */}
      {/*
        Plain <img> on purpose: the hero illustration must preserve its aspect
        ratio while bleeding off the right/top/bottom edges, which next/image's
        layout constraints fight. It's a single, art-directed asset we control.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero-bg.png"
        alt="Ejemplo de un dashboard que Analix genera a partir de un archivo"
        className="pointer-events-none absolute top-1/2 right-0 hidden h-[112%] max-w-none -translate-y-1/2 select-none lg:block"
        style={{ width: "auto" }}
      />

      {/* Legibility wash — only enough to seat the text on the left, not a veil. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, var(--background) 0%, var(--background) 22%, color-mix(in oklab, var(--background) 45%, transparent) 40%, transparent 58%)",
        }}
      />

      {/* Editorial content — hard left, hugging the left edge on wide screens. */}
      <div className="relative w-full px-6 sm:px-10 lg:px-46">
        <div className="flex max-w-xl flex-col gap-6">
          <span className="text-sm font-semibold tracking-wide text-primary">
            Analix
          </span>
          <h1 className="text-5xl font-bold leading-[1.02] tracking-tight sm:text-6xl">
            Tus datos.
            <br />
            Decisiones inteligentes.
          </h1>
          <p className="max-w-sm text-lg text-muted-foreground">
            Subí un CSV o Excel y obtené un dashboard con gráficos, un resumen
            escrito y un chat sobre tus datos. Con números exactos.
          </p>
          <div className="flex max-w-md flex-col gap-4 pt-2">
            <Dropzone />
            <FileChips />
          </div>

          {/*
            Mobile/tablet only: the desktop bleed illustration is hidden below
            lg, so stack a contained product shot under the CTA so the hero
            still shows "this is what you get" instead of bare text.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero-bg.png"
            alt="Ejemplo de un dashboard que Analix genera a partir de un archivo"
            className="mt-2 max-h-72 w-full select-none rounded-card border border-border object-cover object-left-top shadow-card lg:hidden"
          />
        </div>
      </div>
    </section>
  );
}
