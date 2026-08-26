import './rule.css'

/* ---------------------------------------------------------------------------
   The fold line.

   The page's one permitted brass rule: a hairline, a tick comb on the hero's
   own pitch, and two corner ticks. It marks where the argument stops being
   words and becomes the instrument.

   It draws left to right once on load — scaleX on a wrapper, so nothing
   reflows. Reduced motion gets it already drawn.
--------------------------------------------------------------------------- */
export default function BrassRule() {
  return (
    <div className="relative mx-auto max-w-[1100px] px-5 sm:px-8" aria-hidden="true">
      <div className="rule-draw relative">
        <div className="border-t border-ember/45" />
        <div
          className="h-[5px] sm:h-1.5"
          style={{
            background:
              'repeating-linear-gradient(90deg, color-mix(in srgb, var(--color-ember) 40%, transparent) 0 1px, transparent 1px var(--rule-pitch))',
          }}
        />
        <span
          className="pointer-events-none absolute -top-1 left-0 h-2.5 w-2.5"
          style={{
            borderLeft: '1px solid color-mix(in srgb, var(--color-ember) 70%, transparent)',
            borderTop: '1px solid color-mix(in srgb, var(--color-ember) 70%, transparent)',
          }}
        />
        <span
          className="pointer-events-none absolute -top-1 right-0 h-2.5 w-2.5"
          style={{
            borderRight: '1px solid color-mix(in srgb, var(--color-ember) 70%, transparent)',
            borderTop: '1px solid color-mix(in srgb, var(--color-ember) 70%, transparent)',
          }}
        />
      </div>
    </div>
  )
}
