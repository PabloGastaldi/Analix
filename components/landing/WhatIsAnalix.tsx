import { DataFlowGraphic } from "./DataFlowGraphic";
import { SectionLabel } from "./SectionLabel";

/**
 * Landing section 1 — "Qué es". Asymmetric editorial layout: a Calistoga
 * statement on the left, the animated signature data-flow graphic on the right.
 * Paper background, no decorative gradients (design system).
 */
export function WhatIsAnalix() {
  return (
    <section className="bg-paper text-ink">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-24 lg:grid-cols-12 lg:gap-16 lg:px-10">
        <div className="flex flex-col gap-6 lg:col-span-7">
          <SectionLabel>Qué es Analix</SectionLabel>
          <h2 className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Una planilla entra.
            <br />
            Un <span className="text-type-accent">tablero</span> sale.
          </h2>
          <p className="max-w-xl text-lg leading-relaxed text-slate">
            Analix convierte tu CSV o Excel en un tablero con gráficos, un resumen
            escrito y un chat para preguntarle a tus datos. Vos escribís en tus
            palabras qué querés ver; la IA lo traduce a consultas y un motor real las
            calcula.
          </p>
          <p className="max-w-xl text-lg font-medium leading-relaxed text-ink">
            Los números salen de la base, no de la imaginación de un modelo. Y tus
            datos nunca salen del navegador.
          </p>
        </div>

        <div className="lg:col-span-5">
          <DataFlowGraphic />
        </div>
      </div>
    </section>
  );
}
