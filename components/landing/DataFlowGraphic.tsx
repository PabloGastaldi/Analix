import type { CSSProperties } from "react";

/** Bar heights (px within the 200-tall plot) + staggered rise delay. */
const BARS: { x: number; h: number; delay: string }[] = [
  { x: 250, h: 60, delay: "1000ms" },
  { x: 286, h: 104, delay: "1150ms" },
  { x: 322, h: 78, delay: "1300ms" },
  { x: 358, h: 150, delay: "1450ms" },
];

/**
 * Signature graphic: rows of raw data on the left flow along an electric line
 * into a rising bar chart on the right. Stroke draws in, bars rise with a
 * stagger; both freeze under `prefers-reduced-motion` (globals.css). Pure SVG +
 * CSS — no client JS. Framed with a hard offset, not a soft floating shadow.
 */
export function DataFlowGraphic() {
  return (
    <div className="offset-block rounded-[20px] border-2 border-ink bg-white p-5">
      <svg
        viewBox="0 0 420 300"
        className="h-auto w-full"
        role="img"
        aria-label="Datos crudos que se transforman en un gráfico de barras"
      >
        {/* Raw data rows (the CSV) */}
        <g>
          {[40, 78, 116, 154].map((y, index) => (
            <g key={y}>
              <rect x="24" y={y} width="14" height="14" rx="3" fill="var(--ink)" />
              <rect
                x="48"
                y={y + 2}
                width={index % 2 === 0 ? 84 : 64}
                height="10"
                rx="5"
                fill="#0a0a0f"
                opacity="0.18"
              />
            </g>
          ))}
        </g>

        {/* Electric flow line from the rows into the chart */}
        <path
          className="flow-line"
          style={{ ["--flow-len" as keyof CSSProperties]: 1 } as CSSProperties}
          pathLength={1}
          d="M150 100 C 196 100, 196 200, 236 200"
          fill="none"
          stroke="var(--electric)"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* Rising bars */}
        <g>
          {BARS.map((bar, index) => (
            <rect
              key={bar.x}
              className="rise-bar"
              style={{ animationDelay: bar.delay }}
              x={bar.x}
              y={230 - bar.h}
              width="24"
              height={bar.h}
              rx="4"
              fill={index === BARS.length - 1 ? "var(--electric)" : "var(--electric-2)"}
            />
          ))}
          {/* Baseline */}
          <line x1="240" y1="232" x2="396" y2="232" stroke="var(--ink)" strokeWidth="2" />
        </g>
      </svg>
    </div>
  );
}
