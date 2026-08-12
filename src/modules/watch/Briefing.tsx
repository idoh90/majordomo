import { addDays, dayNameLabel, startOfWeek, timeLabel } from '../../core/dates'
import { eventsInRange, weeklyHoursSeries } from '../../core/events/lib'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { BriefingPanel } from '../../core/ui/BriefingPanel'
import { voice } from '../../core/voice'
import type { WatchBriefingFacts } from '../../core/voice/types'
import { cycleStats, watchStats } from './lib'

/** A watch that ends on a later calendar day than it began — the 19:00 → 08:00
 *  shape, whatever hours it was actually posted with. */
function isNight(startIso: string, endIso: string): boolean {
  const s = new Date(startIso)
  const e = new Date(endIso)
  return s.getDate() !== e.getDate() || s.getMonth() !== e.getMonth()
}

/**
 * Every figure comes from watchStats — the same call the duty ring reads — so
 * the strip and the ring can never disagree about how many hours have been
 * stood. Exported as a hook because the Manor's brief writes the same facts
 * into prose: two derivations of one week is how two screens start lying.
 */
export function useWatchBriefingFacts(): WatchBriefingFacts {
  const events = useEventsStore((s) => s.events)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const stats = watchStats(events, now, weekStart)
  const nowDate = new Date(now)

  const logged = stats.weekShifts.filter((e) => new Date(e.end).getTime() <= now).length
  const nights = stats.weekShifts.filter((e) => isNight(e.start, e.end)).length

  const w0 = startOfWeek(nowDate, weekStart)
  const sleepH = weeklyHoursSeries(events, ['sleep'], 1, nowDate, weekStart, 'startAnchored')[0]
  const nextWeek = eventsInRange(events, addDays(w0, 7), addDays(w0, 14))
  const nextWeekCount = nextWeek.filter((e) => e.kind === 'shift' && !e.allDay).length

  let next: WatchBriefingFacts['next'] = null
  if (stats.next) {
    const ms = Math.max(0, new Date(stats.next.start).getTime() - now)
    next = {
      dayLabel: dayNameLabel(stats.next.start, nowDate),
      night: isNight(stats.next.start, stats.next.end),
      h: Math.floor(ms / 3_600_000),
      m: Math.floor((ms % 3_600_000) / 60_000),
      at: timeLabel(stats.next.start),
    }
  }

  return {
    doneH: stats.doneH,
    expectedH: stats.expectedH,
    logged,
    remaining: stats.weekShifts.length - logged,
    nights,
    days: stats.weekShifts.length - nights,
    sleepH,
    next,
    weeklyH: weeklyHoursSeries(events, ['shift'], 8, nowDate, weekStart, 'startAnchored'),
    aheadCount: stats.ahead.length,
    nextWeekCount,
    // the same figure the Cycle card prints, from the same call — a gap stated
    // twice from two derivations is a gap stated wrongly once
    turnaroundH: cycleStats(events, now, weekStart).turnaroundH,
  }
}

/** The Watch's briefing panel, on its own wing. */
export function WatchBriefing({ className = '' }: { className?: string } = {}) {
  const facts = useWatchBriefingFacts()
  const p = voice.watch.briefingPanel

  return (
    <BriefingPanel
      className={className}
      accent="var(--color-w-watch)"
      scope={voice.modules.watch.name}
      chips={p.chips(facts)}
      headline={p.headline(facts)}
      detail={p.detail(facts)}
      aside={p.aside(facts)}
    />
  )
}
