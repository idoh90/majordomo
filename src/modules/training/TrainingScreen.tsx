import { useEffect, useMemo, useState } from 'react'
import type { Workout } from './types'
import { useNow } from '../../core/useNow'
import { GroundsBriefing } from './Briefing'
import { AddWorkoutSheet } from './components/add/AddWorkoutSheet'
import { BodyMap } from './components/bodymap/BodyMap'
import { WorkoutCalendar } from './components/history/WorkoutCalendar'
import { WorkoutDetailSheet } from './components/history/WorkoutDetailSheet'
import { WorkoutList } from './components/history/WorkoutList'
import { NutritionCard } from './components/insights/NutritionCard'
import { MuscleLedger } from './components/insights/MuscleLedger'
import { RecoveryCard } from './components/insights/RecoveryCard'
import { ScheduledCard } from './components/insights/ScheduledCard'
import { StatTiles } from './components/insights/StatTiles'
import { TopMusclesChart } from './components/insights/TopMusclesChart'
import { WeeklyChart } from './components/insights/WeeklyChart'
import { WeeklyGoalCard } from './components/insights/WeeklyGoalCard'
import { computeStrains } from './lib/strain'
import { useWorkoutStore } from './store'
import { useTrainingUi } from './uiStore'

export function TrainingScreen() {
  const workouts = useWorkoutStore((s) => s.workouts)
  const now = useNow()
  const strains = useMemo(() => computeStrains(workouts, now), [workouts, now])

  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Workout | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const detailWorkout = detailId ? (workouts.find((w) => w.id === detailId) ?? null) : null

  const openEdit = (w: Workout) => {
    setEditing(w)
    setSheetOpen(true)
  }

  // the shell header's Log button posts a one-shot request through the mailbox
  const addSheetRequested = useTrainingUi((s) => s.addSheetRequested)
  useEffect(() => {
    if (!addSheetRequested) return
    setEditing(null)
    setSheetOpen(true)
    useTrainingUi.getState().clearAddSheetRequest()
  }, [addSheetRequested])

  // DEV screenshot aids: ?sheet=add opens the blank flow; ?sheet=effort opens
  // the newest workout in edit mode (starts on the sliders step); ?sheet=when
  // additionally expands the calendar; ?detail opens the newest workout detail
  const devWhenOpen =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('sheet') === 'when'
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const params = new URLSearchParams(window.location.search)
    const sheet = params.get('sheet')
    const first = useWorkoutStore.getState().workouts[0]
    if (sheet === 'add') setSheetOpen(true)
    if ((sheet === 'effort' || sheet === 'when') && first) {
      setEditing(first)
      setSheetOpen(true)
    }
    if (params.has('detail') && first) setDetailId(first.id)
  }, [])

  return (
    <>
      <GroundsBriefing strains={strains} className="mt-4" />
      <main className="mt-4 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,4fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <BodyMap workouts={workouts} strains={strains} now={now} />
          {/* mobile: the design's RECOVERY rows under the hero map (desktop
              reads the same truth off the map + detail sheets) */}
          <RecoveryCard workouts={workouts} now={now} />
          {/* the map's data twin, sharing its strain map so the two cannot
              disagree; it sits in the left column beside the figures it
              describes, and on mobile it follows them directly */}
          <MuscleLedger workouts={workouts} strains={strains} now={now} />
          <WorkoutCalendar workouts={workouts} now={now} onOpen={(w) => setDetailId(w.id)} />
        </div>
        <div className="flex flex-col gap-4">
          <WeeklyGoalCard workouts={workouts} now={now} />
          <ScheduledCard now={now} />
          <NutritionCard workouts={workouts} now={now} />
          <StatTiles workouts={workouts} now={now} />
          <div className="grid gap-4 sm:grid-cols-2">
            <WeeklyChart workouts={workouts} now={now} />
            <TopMusclesChart workouts={workouts} now={now} />
          </div>
          <WorkoutList
            workouts={workouts}
            now={now}
            onEdit={openEdit}
            onOpen={(w) => setDetailId(w.id)}
          />
        </div>
      </main>

      <AddWorkoutSheet
        open={sheetOpen}
        editing={editing}
        onClose={() => setSheetOpen(false)}
        devWhenOpen={devWhenOpen}
      />

      <WorkoutDetailSheet
        workout={detailWorkout}
        now={now}
        onClose={() => setDetailId(null)}
        onEdit={(w) => {
          setDetailId(null)
          openEdit(w)
        }}
      />
    </>
  )
}

