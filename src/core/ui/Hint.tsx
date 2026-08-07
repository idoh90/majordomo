import { useId, useState, type ReactNode } from 'react'
import { useShellStore } from '../store/shell'
import { voice } from '../voice'
import { Collapsible } from './Collapsible'

/**
 * THE `?` — one line saying what a panel is FOR, folded away until asked for.
 *
 * The app's one recorded piece of outside feedback was that it "looks great but
 * is complicated as hell for a new user", and the gap it names is this: every
 * panel states a figure and none of them says why the figure is worth having.
 *
 * Two decisions are load-bearing:
 *
 *  - **With tips off, this renders its children and NOTHING else** — not a
 *    hidden button, not a wrapper div. The chrome of a house whose owner
 *    already knows their way around must be exactly as it was, and a layout
 *    that changes shape depending on a preference is a layout tested twice.
 *  - **The disclosure is inline, under the heading, through `Collapsible`** —
 *    the house's one fold. A floating bubble would need edge-flipping logic at
 *    two breakpoints; a sheet would hide the very panel it explains.
 *
 * Usage: wrap the panel's whole HEADER, not just its title text — several
 * headers are flex rows carrying their own right-hand controls, and the fold
 * has to land beneath the row rather than inside it.
 *
 *   <Hinted tip={voice.hints.watch.cycle}>
 *     <div className="card-title">{voice.watch.cycle.title}</div>
 *   </Hinted>
 */
export function Hinted({
  tip,
  children,
  className = '',
}: {
  tip: string
  children: ReactNode
  /** spacing for the fold, when the panel's rhythm wants something else */
  className?: string
}) {
  const on = useShellStore((s) => s.panelTips)
  const [open, setOpen] = useState(false)
  const id = useId()

  // the whole point of the switch: off is indistinguishable from before
  if (!on) return <>{children}</>

  return (
    <>
      {/* items-start, not center: a few headers run to two lines, and the mark
          belongs beside the first of them rather than floating at their middle */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={id}
          aria-label={voice.hints.buttonLabel}
          title={voice.hints.buttonLabel}
          className={`mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border text-[10.5px] font-semibold leading-none transition-colors ${
            open
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-line text-ink-faint hover:border-accent/50 hover:text-accent'
          }`}
        >
          ?
        </button>
      </div>
      <Collapsible open={open} className={className}>
        <p
          id={id}
          className="mt-1.5 border-l-2 pl-2.5 text-[11.5px] italic leading-snug text-ink-dim"
          style={{ borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)' }}
        >
          {tip}
        </p>
      </Collapsible>
    </>
  )
}
