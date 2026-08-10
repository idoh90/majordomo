import type { ConsoleModule } from '../../core/module'
import { useEventsStore } from '../../core/events/store'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { voice } from '../../core/voice'
import { countdownLabel, watchStats } from './lib'
import { WatchBriefing } from './Briefing'
import { WatchScreen } from './WatchScreen'

/** Tile stat: countdown to the next watch. */
function Tile() {
  const events = useEventsStore((s) => s.events)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()
  const stats = watchStats(events, now, weekStart)
  return (
    <>
      <span className="stat-num text-2xl leading-tight text-ink">
        {stats.next ? countdownLabel(stats.next, now) : '—'}
      </span>
      <span className="block text-[11px] leading-tight text-ink-faint">
        {stats.next ? 'until the next watch' : voice.watch.noneAhead}
      </span>
    </>
  )
}

function Icon() {
  // watch face at 19:00 — the night shift begins
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l-3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const watchConsole: ConsoleModule = {
  id: 'watch',
  name: voice.modules.watch.name,
  status: 'online',
  tagline: voice.modules.watch.tagline,
  Icon,
  Tile,
  Screen: WatchScreen,
  // on the Manor the briefing is a ROW in the one consolidated panel; the wing
  // screen keeps the full panel, where there is only one of it to consolidate
  Briefing: () => <WatchBriefing variant="row" />,
}
