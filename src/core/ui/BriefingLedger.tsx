import { createContext, useContext, useState, type ReactNode } from 'react'
import { Collapsible } from './Collapsible'
import { CollapseChevron } from './CollapseToggle'
import { Hinted } from './Hint'
import { voice } from '../voice'
import type { BriefingChip } from '../voice/types'

/**
 * THE BRIEFING — the Manor's bottom area, as one panel.
 *
 * Every wing used to render its own BriefingPanel below the calendar: four
 * copies of the same anatomy (monogram, scope label, chips, prose), stacked,
 * ~650 px of it, all of it open all of the time. The repetition was the cost —
 * the facts were fine, the frame around each one was paid for four times.
 *
 * So the frame is paid for once. The panel is the frame; a wing is a ROW in
 * it, and the row is the numbers — a wing dot, the wing's name, its three
 * figures. Press the row and the Majordomo says the rest. Less than half the
 * height, and strictly more words than before once opened, because a fold that
 * nobody has to scroll past can afford a third line.
 *
 * Two decisions worth knowing:
 *
 * - It is an ACCORDION. Opening one row closes the last, so the bottom of the
 *   Manor has exactly one height per state and can never grow back into the
 *   stack this replaced. Rows start closed — the chevron is the affordance and
 *   the figures are already on the row, so nothing is hidden that the reader
 *   has not been shown a number for.
 * - The rows are still rendered BY THE WINGS, through `ConsoleModule.Briefing`.
 *   The panel holds no knowledge of which wings exist; it holds the frame and
 *   the open state, and the registry decides the rest. A wing that returns
 *   null (an empty Ledger, a Study with no subjects) simply isn't a row, and
 *   when every wing declines the panel takes itself off the screen.
 *
 * The wing screens keep BriefingPanel — there the briefing leads the screen
 * and there is only one of it, so there is nothing to consolidate.
 */

type LedgerCtx = {
  openId: string | null
  toggle: (id: string) => void
}

const Ctx = createContext<LedgerCtx | null>(null)

export function BriefingLedger({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null)

  const ctx: LedgerCtx = {
    openId,
    toggle: (id) => setOpenId((cur) => (cur === id ? null : id)),
  }

  return (
    <Ctx.Provider value={ctx}>
      {/* An empty panel takes itself off the screen, and it does it in CSS
          (`.briefing-ledger:not(:has(.briefing-row))`) rather than by counting
          rows in React. Counting would mean each row telling its parent it
          exists during the parent's own render pass, which React refuses, and
          doing it in an effect instead paints one frame of an empty frame
          first. The wings decide whether they have anything to say; the panel
          just isn't there when none of them do. */}
      <section
        className="panel panel-lit briefing-ledger mt-4"
        style={{ '--lit-accent': 'var(--color-accent)' } as React.CSSProperties}
      >
        {/* the padding is OUTSIDE the hint, not on the row inside it: Hinted
            drops its explanation as a sibling of what it wraps, so a padded
            row would leave the explanation flush against the panel's edge */}
        <div className="px-4 pt-3.5 pb-3 sm:px-5">
          <Hinted tip={voice.hints.house.briefingLedger}>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] border border-accent/55 bg-accent/12 font-display text-[15px] font-bold text-accent"
                style={{ boxShadow: '0 0 14px var(--glow-accent)' }}
              >
                M
              </span>
              <span className="card-title">{voice.briefing.label}</span>
              <span className="ml-auto hidden text-[10.5px] italic text-ink-faint sm:block">
                {voice.briefing.subtitle}
              </span>
            </div>
          </Hinted>
        </div>
        {children}
      </section>
    </Ctx.Provider>
  )
}

/**
 * One wing's line in that panel. Rendered by the wing, so the wing keeps
 * owning its own figures and its own copy — this is anatomy only.
 */
export function BriefingRow({
  id,
  accent,
  scope,
  chips,
  headline,
  detail,
  aside,
  extra,
  blurFigures = false,
}: {
  /** the wing's id — the accordion's key, nothing else reads it */
  id: string
  /** a CSS colour value — a wing token, e.g. 'var(--color-w-watch)' */
  accent: string
  scope: string
  chips: BriefingChip[]
  headline: string
  detail?: string
  /** the third line, shown only here: the figures worth the press */
  aside?: string | null
  extra?: ReactNode
  /** the Ledger's privacy toggle — see BriefingPanel */
  blurFigures?: boolean
}) {
  const ctx = useContext(Ctx)
  // a row rendered outside the panel still works, on its own state. Nothing
  // does that today; it is here so a wing screen can reach for the row shape
  // later without the panel coming with it.
  const [loose, setLoose] = useState(false)
  const open = ctx ? ctx.openId === id : loose
  const toggle = () => (ctx ? ctx.toggle(id) : setLoose((x) => !x))

  const blur = blurFigures
    ? 'blur-[6px] transition-[filter] duration-150 hover:blur-none'
    : ''

  return (
    <div className="briefing-row border-t border-line">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={open ? voice.briefing.rowCollapse(scope) : voice.briefing.rowExpand(scope)}
        className="group flex w-full flex-wrap items-center gap-x-3.5 gap-y-2.5 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-ink/[0.035] sm:px-5 md:min-h-[54px] md:flex-nowrap md:gap-x-4"
      >
        <span
          aria-hidden
          className="order-1 h-2 w-2 flex-none rounded-full"
          style={{
            background: accent,
            boxShadow: `0 0 10px color-mix(in srgb, ${accent} 55%, transparent)`,
          }}
        />
        <span
          className="order-2 min-w-0 flex-1 truncate font-display text-[11.5px] font-semibold tracking-[0.18em] md:w-32 md:flex-none"
          style={{ color: `color-mix(in srgb, ${accent} 62%, var(--color-ink-dim))` }}
        >
          {scope}
        </span>
        {/* order swaps at md: on a phone the chevron closes the first line and
            the figures wrap beneath it; on desktop the figures come first and
            the chevron is pushed to the far right of the same line */}
        <span className="order-3 ml-auto flex-none md:order-4">
          <CollapseChevron expanded={open} />
        </span>
        <span className="order-4 flex w-full items-start gap-3 pl-5 md:order-3 md:w-auto md:flex-1 md:gap-4 md:pl-0">
          {chips.map((c) => (
            <span key={c.label} className="flex min-w-0 flex-1 flex-col gap-0.5 md:max-w-[168px]">
              <span className="truncate font-display text-[9px] font-semibold tracking-[0.18em] text-ink-faint">
                {c.label}
              </span>
              <span className={`stat-num truncate text-[15px] leading-none text-ink ${blur}`}>
                {c.value}
              </span>
            </span>
          ))}
        </span>
      </button>

      <Collapsible open={open}>
        <div className="px-4 pb-4 pl-9 sm:px-5 sm:pl-[46px]">
          <p className={`max-w-[920px] text-[14.5px] leading-snug text-ink ${blur}`}>{headline}</p>
          {detail && (
            <p className={`mt-1.5 max-w-[920px] text-[12.5px] leading-relaxed text-ink-dim ${blur}`}>
              {detail}
            </p>
          )}
          {aside && (
            <p
              className={`mt-1.5 max-w-[920px] text-[12.5px] leading-relaxed text-ink-faint ${blur}`}
            >
              {aside}
            </p>
          )}
          {extra && <div className="mt-2.5">{extra}</div>}
        </div>
      </Collapsible>
    </div>
  )
}
