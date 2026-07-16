import { useState } from 'react'
import type { CalendarEvent } from '../../core/events/types'
import { hoursByKind } from '../../core/events/lib'
import { voice } from '../../core/voice'

/** The Majordomo's one-line week briefing above the grid. On mobile the stat
 *  readout folds behind a chevron so the line never crowds 390px. */
export function BriefingStrip({ weekEvents }: { weekEvents: CalendarEvent[] }) {
  const [expanded, setExpanded] = useState(false)
  const shiftCount = weekEvents.filter((e) => e.kind === 'shift' && !e.allDay).length
  const totals = hoursByKind(weekEvents)
  const stat = voice.manor.briefingStat({
    watchH: totals.shift,
    trainingCount: weekEvents.filter((e) => e.kind === 'training' && !e.allDay).length,
    studyH: totals.study,
  })
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
          {voice.manor.briefing(shiftCount)}
        </span>
        {stat && (
          <span className="ml-auto hidden whitespace-nowrap text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums] md:inline">
            {stat}
          </span>
        )}
        {stat && (
          <span aria-hidden className="flex-none text-[10px] text-ink-dim md:hidden">
            {expanded ? '⌃' : '⌄'}
          </span>
        )}
      </button>
      {stat && expanded && (
        <div className="mt-1.5 pl-9 text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums] md:hidden">
          {stat}
        </div>
      )}
    </div>
  )
}
