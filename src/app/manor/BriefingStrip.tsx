import type { CalendarEvent } from '../../core/events/types'
import { hoursByKind } from '../../core/events/lib'
import { voice } from '../../core/voice'

/** The Majordomo's one-line week briefing above the grid. */
export function BriefingStrip({ weekEvents }: { weekEvents: CalendarEvent[] }) {
  const shiftCount = weekEvents.filter((e) => e.kind === 'shift' && !e.allDay).length
  const totals = hoursByKind(weekEvents)
  const stat = voice.manor.briefingStat({
    watchH: totals.shift,
    trainingCount: weekEvents.filter((e) => e.kind === 'training' && !e.allDay).length,
    studyH: totals.study,
  })
  return (
    <div
      className="mt-3.5 flex items-center gap-3 rounded-[10px] border border-line px-4 py-2.5"
      style={{ background: 'color-mix(in srgb, var(--color-panel) 85%, transparent)' }}
    >
      <span
        className="inline-flex h-6 w-6 flex-none items-center justify-center rounded-full border font-display text-xs font-bold"
        style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
        aria-hidden
      >
        M
      </span>
      <span className="text-[13.5px]">{voice.manor.briefing(shiftCount)}</span>
      {stat && (
        <span className="ml-auto whitespace-nowrap text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
          {stat}
        </span>
      )}
    </div>
  )
}
