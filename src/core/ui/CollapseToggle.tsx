/**
 * THE COLLAPSE TOGGLE — the one chevron the whole estate folds behind.
 *
 * Every panel that hides something on mobile used to draw its own affordance,
 * and they all drifted the same way: a bare `⌄` at 10px in `text-ink-dim`,
 * pinned to the far right of a header row. The tap target was fine; the thing
 * you were meant to aim at was invisible. Two of them were also inert glyphs
 * that only *looked* like controls, which is worse than nothing.
 *
 * So the affordance is now a tinted chip, not a character: accent border and
 * fill from the same `chip-tint` vocabulary the figures use, a stroked chevron
 * that ROTATES rather than swapping glyph (the swap was the reason the two
 * directions never read as the same control), and an optional word beside it.
 * It holds no copy of its own — labels are the caller's business, per the
 * BriefingPanel doctrine, so every string still comes out of the voice pack.
 *
 * Sizing is deliberate: the chip is 28px so it is visible, the button around
 * it clears 44px so it is hittable, and the negative margin keeps that height
 * from pushing the header row apart. Same size on desktop — a control that is
 * hard to see is hard to see at any width.
 *
 * It comes in two pieces on purpose. Half the panels in the estate make their
 * WHOLE header row the button, and a button inside a button is not markup a
 * browser will honour — so `CollapseChevron` is the bare visual, and
 * `CollapseToggle` is that visual with its own button around it. Panels that
 * already own a button reach for the chevron; standalone affordances take the
 * toggle. Neither one holds copy.
 */
export function CollapseToggle({
  expanded,
  onToggle,
  label,
  hint,
  upward = false,
  className = '',
}: {
  expanded: boolean
  onToggle: () => void
  /** optional word beside the chevron, e.g. 'ALL 16' — from the voice pack */
  label?: string
  /** the accessible name; say what pressing it will do, not what state it is in */
  hint: string
  /** for a panel anchored to the BOTTOM of the screen, where "more" lives
   *  upward: the closed chevron points up and rotates down to close */
  upward?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={hint}
      /* a labelled toggle is already wide enough to hit; a bare chevron is 28px
         of chip and would leave a 32px target without the extra padding */
      className={`group -my-2 flex h-11 flex-none items-center gap-2 ${
        label ? 'px-0.5' : 'px-2'
      } ${className}`}
    >
      {label && <CollapseLabel>{label}</CollapseLabel>}
      <CollapseChevron expanded={expanded} upward={upward} />
    </button>
  )
}

/** the chevron alone, for a panel whose whole header row is already a button */
export function CollapseChevron({
  expanded,
  upward = false,
  className = '',
}: {
  expanded: boolean
  upward?: boolean
  className?: string
}) {
  const rotated = upward ? !expanded : expanded
  return (
    <span
      aria-hidden
      className={`chip-tint inline-flex h-7 w-7 flex-none items-center justify-center text-accent transition-colors duration-150 group-hover:text-ink ${className}`}
    >
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-[15px] w-[15px] transition-transform duration-200 ${
          rotated ? 'rotate-180' : ''
        }`}
      >
        <path d="M5 7.5 10 13l5-5.5" />
      </svg>
    </span>
  )
}

/** the word beside the chevron — dims and lifts with it */
export function CollapseLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-dim transition-colors duration-150 group-hover:text-ink">
      {children}
    </span>
  )
}
