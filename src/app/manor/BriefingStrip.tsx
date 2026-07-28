import { useState } from 'react'
import type { CalendarEvent } from '../../core/events/types'
import { hoursByKind } from '../../core/events/lib'
import { Collapsible } from '../../core/ui/Collapsible'
import { CollapseChevron } from '../../core/ui/CollapseToggle'
import { voice } from '../../core/voice'
import { useHeadsUps } from './useHeadsUps'

/** The Majordomo's briefing above the grid: greeting + week line + heads-up
 *  prose (now-relative — paging the calendar doesn't change what he knows).
 *  On mobile the stat readout and the heads-ups fold behind a chevron so the
 *  line never crowds 390px.
 *
 *  The strip is MIXED-SCOPE on purpose and stays that way: greeting, week line
 *  and stats follow the viewed week; the heads-ups stay now-relative. What was
 *  missing is any sign of which is which, so a now-relative line ("0 sessions
 *  of 4 this week, with the week nearly out") read as a description of a grid
 *  showing some other week. Two quiet tags label the scopes; nothing about
 *  what is computed changes. */
export function BriefingStrip({
  weekEvents,
  offWeekLabel,
}: {
  weekEvents: CalendarEvent[]
  /** the viewed week's range when it is NOT the current week, else null */
  offWeekLabel: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const { greeting, headsUps } = useHeadsUps()
  const shiftCount = weekEvents.filter((e) => e.kind === 'shift' && !e.allDay).length
  const totals = hoursByKind(weekEvents)
  const stat = voice.manor.briefingStat({
    watchH: totals.shift,
    trainingCount: weekEvents.filter((e) => e.kind === 'training' && !e.allDay).length,
    studyH: totals.study,
  })
  const hasMore = Boolean(stat) || headsUps.length > 0
  const briefingLine = [greeting, voice.manor.briefing(shiftCount)].filter(Boolean).join(' ')
  return (
    <div
      className="mt-3.5 rounded-[10px] border border-line px-4 py-2.5"
      style={{ background: 'color-mix(in srgb, var(--color-panel) 85%, transparent)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        className="group flex min-h-11 w-full items-center gap-3 py-1 text-left md:pointer-events-none md:min-h-0 md:py-0"
      >
        <span
          className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border font-display text-xs font-bold"
          style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
          aria-hidden
        >
          M
        </span>
        {/* paged off the current week: say so, or "this week" in the line
            below is a claim about a week you are not looking at */}
        {offWeekLabel && (
          <span
            className="chip flex-none whitespace-nowrap px-2 py-0.5 text-[9.5px] tracking-[0.14em]"
            style={{
              color: 'var(--color-accent)',
              border: '1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)',
            }}
          >
            {voice.manor.briefingScope.viewing} · {offWeekLabel}
          </span>
        )}
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px]">
          {briefingLine}
        </span>
        {stat && (
          <span className="ml-auto hidden whitespace-nowrap text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums] md:inline">
            {stat}
          </span>
        )}
        {hasMore && <CollapseChevron expanded={expanded} className="md:hidden" />}
      </button>
      {/* the heads-ups: prose lines on desktop, folded on mobile. Tagged
          TODAY because they are now-relative whatever week is on the grid. */}
      {headsUps.length > 0 && (
        <div className="mt-1.5 hidden pl-9 md:flex md:items-baseline md:gap-2">
          <NowTag />
          <div className="text-[12.5px] leading-relaxed text-ink-dim">
            {headsUps.map((h) => h.text).join(' ')}
          </div>
        </div>
      )}
      {/* mobile's copy stacks what desktop lays out in a row, so the two stay
          separate markup; the fold is the mobile one, hidden outright above it */}
      <Collapsible
        open={expanded}
        className="md:hidden"
        innerClassName="flex flex-col gap-1 pl-9 pt-1.5"
      >
        {headsUps.length > 0 && <NowTag />}
        {headsUps.map((h) => (
          <div key={h.id} className="text-[12.5px] leading-relaxed text-ink-dim">
            {h.text}
          </div>
        ))}
        {stat && (
          <div className="text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
            {stat}
          </div>
        )}
      </Collapsible>
    </div>
  )
}

/** marks a block as now-relative rather than about the week on the grid */
function NowTag() {
  return (
    <span
      className="flex-none self-start font-display text-[8.5px] font-semibold tracking-[0.2em] text-ink-faint"
      style={{ borderBottom: '1px solid color-mix(in srgb, var(--color-ink-faint) 45%, transparent)' }}
    >
      {voice.manor.briefingScope.now}
    </span>
  )
}
