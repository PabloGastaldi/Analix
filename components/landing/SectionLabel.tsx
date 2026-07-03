/**
 * Editorial section marker — a short electric rule + a sentence-case label.
 * Deliberately not the all-caps, wide-tracked, colored eyebrow (an overused
 * pattern); reads as a magazine section cue instead.
 */
export function SectionLabel({
  children,
  onDark = false,
}: {
  children: string;
  onDark?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="h-px w-8 bg-electric" />
      <span
        className={`text-sm font-medium ${onDark ? "text-white/60" : "text-slate"}`}
      >
        {children}
      </span>
    </div>
  );
}
