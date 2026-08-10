import { useEffect, useMemo } from 'react'
import type { ConsoleModule } from '../../core/module'
import { voice } from '../../core/voice'
import { useNow } from '../../core/useNow'
import { useShellStore } from '../../core/store/shell'
import { GroundsBriefing } from './Briefing'
import { reconcileWorkoutBlocks } from './lib/blocks'
import { thisWeekCount } from './lib/insights'
import { computeStrains } from './lib/strain'
import { useWorkoutStore } from './store'
import { TrainingScreen } from './TrainingScreen'

/** The Grounds' briefing strip, plus the DEV strain handle it has always
 *  owned — this mounts wherever the Manor renders, so __strains stays live
 *  on every view. The strain map is computed once here and handed down so
 *  the strip and the summary can never describe two different bodies.
 *  It also hosts the logged-session heal pass, on the Study's precedent:
 *  mounting wherever the Manor renders is what makes a workout logged on
 *  another device show up on this one's week without opening the wing. */
function Briefing() {
  const workouts = useWorkoutStore((s) => s.workouts)
  const now = useNow()
  const nowH = Math.floor(now / 3_600_000) * 3_600_000
  const strains = useMemo(() => computeStrains(workouts, nowH), [workouts, nowH])

  useEffect(() => {
    reconcileWorkoutBlocks(workouts)
  }, [workouts])

  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__strains = strains
  }

  // The strip now says everything the old prose summary said — workouts, what
  // is still hot, the day's fuel — so rendering both made the Manor repeat
  // itself. DailySummary is left in place rather than deleted: its carb/fat
  // split and per-muscle wording are a feature of the Grounds, and where the
  // design omits an old feature the old feature wins.
  return <GroundsBriefing strains={strains} variant="row" />
}

/** Menu-tile stat: sessions this calendar week vs the weekly goal. */
function Tile() {
  const workouts = useWorkoutStore((s) => s.workouts)
  const weeklyGoal = useWorkoutStore((s) => s.weeklyGoal)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()
  const count = thisWeekCount(workouts, new Date(now), weekStart)
  return (
    <>
      <span className="stat-num text-2xl leading-tight text-ink">
        {weeklyGoal > 0 ? `${count} / ${weeklyGoal}` : String(count)}
      </span>
      <span className="block text-[11px] leading-tight text-ink-faint">
        {count === 1 && weeklyGoal <= 0 ? 'session this week' : 'sessions this week'}
      </span>
    </>
  )
}

function Icon() {
  // vitals pulse — conditioning & recovery
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2 12h4l2.5-6 4 12 2.5-6H22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export const trainingConsole: ConsoleModule = {
  id: 'training',
  name: voice.modules.training.name,
  status: 'online',
  tagline: voice.modules.training.tagline,
  Icon,
  Tile,
  Screen: TrainingScreen,
  Briefing,
}
