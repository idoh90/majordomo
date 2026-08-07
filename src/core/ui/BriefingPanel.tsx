import { useState, type ReactNode } from 'react'
import { Collapsible } from './Collapsible'
import { CollapseToggle } from './CollapseToggle'
import { Hinted } from './Hint'
import { voice } from '../voice'
import type { BriefingChip } from '../voice/types'

/**
 * The briefing, as every wing renders it: a monogram, a scope label, the
 * figures as chips, then one composed line and one detail line.
 *
 * Numbers first, butler second — the chips carry the facts so the prose never
 * has to be read to learn the state, and the composed line is allowed to be a
 * sentence because nothing depends on it. Copy is the caller's business: this
 * component holds no strings but its own scope label, and every wing's lines
 * come out of the voice pack as fixed templates. Nothing here is generated.
 *
 * Collapse is done in CSS, not by measuring the viewport: desktop always shows
 * the detail line, mobile shows it only when opened. A JS breakpoint read
 * would be one more thing to get wrong on a resize, and the Manor's strip
 * already established the pattern.
 */
export function BriefingPanel({
  accent,
  monogram = 'M',
  scope,
  chips,
  headline,
  detail,
  extra,
  blurFigures = false,
  className = '',
}: {
  /** a CSS colour value — a wing token, e.g. 'var(--color-w-watch)' */
  accent: string
  monogram?: string
  /** the wing's name; the panel prefixes it with THE BRIEFING */
  scope: string
  chips: BriefingChip[]
  headline: string
  detail?: string
  /** anything the wing wants under the detail line (deltas, a readiness tile) */
  extra?: ReactNode
  /** the Ledger's privacy toggle. Prose can't blur one number at a time the
   *  way <Amount> does, so the whole line goes soft and clears on hover —
   *  coarser than the toggle elsewhere, but it still hides what it promised. */
  blurFigures?: boolean
  /** spacing is the caller's business — on the Manor these sit in a gapped
   *  column, on a wing the strip leads the screen and needs its own margin */
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = Boolean(detail) || Boolean(extra)
  const blur = blurFigures
    ? 'blur-[6px] transition-[filter] duration-150 hover:blur-none'
    : ''
  return (
    <section
      className={`panel panel-lit px-4 py-3.5 sm:px-5 ${className}`}
      style={{ '--lit-accent': accent } as React.CSSProperties}
    >
      <div className="flex items-start gap-3 sm:gap-3.5">
        <span
          aria-hidden
          className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] border font-display text-[15px] font-bold sm:h-[38px] sm:w-[38px] sm:text-[19px]"
          style={{
            borderColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
            background: `color-mix(in srgb, ${accent} 12%, transparent)`,
            color: accent,
            boxShadow: `0 0 14px color-mix(in srgb, ${accent} 22%, transparent)`,
          }}
        >
          {monogram}
        </span>

        <div className="min-w-0 flex-1">
          <Hinted tip={voice.hints.house.briefing}>
            <div className="flex items-center gap-2">
              <span
                className="card-title min-w-0 truncate"
                style={{ color: `color-mix(in srgb, ${accent} 62%, var(--color-ink-dim))` }}
              >
                {voice.briefing.label} · {scope}
              </span>
              {/* Desktop used to render a second, inert '⌃' here to balance the
                  row. It looked exactly like the control beside it and did
                  nothing when pressed, so it is gone rather than enlarged. */}
              {hasMore && (
                <CollapseToggle
                  expanded={expanded}
                  onToggle={() => setExpanded((x) => !x)}
                  hint={expanded ? voice.briefing.collapse : voice.briefing.expand}
                  className="ml-auto md:hidden"
                />
              )}
            </div>
          </Hinted>

          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {chips.map((c) => (
                <span
                  key={c.label}
                  className="chip-tint inline-flex items-baseline gap-1.5 px-2.5 py-1"
                  style={{ '--chip-accent': accent } as React.CSSProperties}
                >
                  <span className="font-display text-[9px] font-semibold tracking-[0.18em] text-ink-faint">
                    {c.label}
                  </span>
                  <span className={`stat-num text-[12.5px] leading-none text-ink ${blur}`}>
                    {c.value}
                  </span>
                </span>
              ))}
            </div>
          )}

          <p className={`mt-2.5 text-[15px] leading-snug text-ink ${blur}`}>{headline}</p>

          {/* One copy of the detail, not two. It used to be written out twice
              — a desktop-only block and a mobile-only block behind `expanded`
              — because a mounted-and-unmounted branch was the only way to
              fold it. The fold keeps it mounted, so the same markup can serve
              both widths and can animate on the way out as well as in. */}
          {hasMore && (
            <Collapsible open={expanded} mobileOnly>
              {detail && (
                <p className={`mt-1.5 text-[12.5px] leading-relaxed text-ink-dim ${blur}`}>
                  {detail}
                </p>
              )}
              {extra && <div className="mt-2">{extra}</div>}
            </Collapsible>
          )}
        </div>
      </div>
    </section>
  )
}
