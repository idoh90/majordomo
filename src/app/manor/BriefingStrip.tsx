import { useState } from 'react'
import type { CalendarEvent } from '../../core/events/types'
import { hoursByKind } from '../../core/events/lib'
import { voice } from '../../core/voice'
import { useHeadsUps } from './useHeadsUps'

/** The Majordomo's briefing above the grid: greeting + week line + heads-up
 *  prose (now-relative — paging the calendar doesn't change what he knows).
 *  On mobile the stat readout and the heads-ups fold behind a chevron so the
 *  line never crowds 390px. */
export function BriefingStrip({ weekEvents }: { weekEvents: CalendarEvent[] }) {
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
        className="flex w-full items-center gap-3 text-left md:pointer-events-none"
      >
        <span
          className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border font-display text-xs font-bold"
          style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
          aria-hidden
        >
          M
        </span>
        <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px]">
          {briefingLine}
        </span>
        {stat && (
          <span className="ml-auto hidden whitespace-nowrap text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums] md:inline">
            {stat}
          </span>
        )}
        {hasMore && (
          <span aria-hidden className="flex-none text-[10px] text-ink-dim md:hidden">
            {expanded ? '⌃' : '⌄'}
          </span>
        )}
      </button>
      {/* the heads-ups: prose lines on desktop, folded on mobile */}
      {headsUps.length > 0 && (
        <div className="mt-1.5 hidden pl-9 text-[12.5px] leading-relaxed text-ink-dim md:block">
          {headsUps.map((h) => h.text).join(' ')}
        </div>
      )}
      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1 pl-9 md:hidden">
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
        </div>
      )}
    </div>
  )
}
