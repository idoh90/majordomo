import type { Workout } from '../../types'
import {
  allRuns,
  formatClock,
  formatKm,
  runPaceSeconds,
  runStats,
  runTotalSeconds,
  runsInWeek,
} from '../../lib/runs'
import { relativeDayLabel } from '../../../../core/dates'
import { useShellStore } from '../../../../core/store/shell'
import { Hinted } from '../../../../core/ui/Hint'
import { voice } from '../../../../core/voice'

/** how many past runs the list holds before it stops being "lately" */
const RECENT_LIMIT = 4

interface RunsCardProps {
  workouts: Workout[]
  now: number
}

/**
 * Conditioning, which the weekly goal and the volume landmarks both refuse to
 * count. Distance/time/pace for the calendar week (the week-start the estate is
 * set to), then the last few runs whatever week they fell in.
 */
export function RunsCard({ workouts, now }: RunsCardProps) {
  const weekStart = useShellStore((s) => s.weekStart)
  const nowDate = new Date(now)
  const runs = allRuns(workouts)
  const week = runStats(runsInWeek(runs, nowDate, weekStart))
  const priorWeek = runStats(runsInWeek(runs, nowDate, weekStart, 1))
  const recent = runs.slice(0, RECENT_LIMIT)

  // distance is the only figure worth comparing week to week: a week of one
  // long run and a week of three short ones differ in time, not in effort
  const delta = week.km - priorWeek.km
  const vsLast =
    priorWeek.count === 0
      ? null
      : Math.abs(delta) < 0.05
        ? voice.grounds.runs.vsLastLevel
        : voice.grounds.runs.vsLast({ km: formatKm(Math.abs(delta)), up: delta > 0 })

  return (
    <div className="panel p-4">
      <Hinted tip={voice.hints.grounds.runs}>
        <h3 className="card-title">{voice.grounds.runs.title}</h3>
      </Hinted>

      {runs.length === 0 ? (
        <p className="mt-3 text-sm text-ink-faint">{voice.grounds.runs.empty}</p>
      ) : (
        <>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                {voice.grounds.runs.weekLabel}
              </div>
              <div className="stat-num mt-0.5 flex items-baseline gap-1 leading-none text-ink">
                <span className="text-3xl">{week.count === 0 ? '—' : formatKm(week.km)}</span>
                {week.count > 0 && <span className="text-base text-ink-dim">km</span>}
              </div>
              <div className="mt-1 text-[11px] leading-tight text-ink-faint">
                {week.count === 0
                  ? voice.grounds.runs.quietWeek
                  : voice.grounds.runs.count(week.count)}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <MiniStat
                label={voice.grounds.runs.timeLabel}
                value={week.seconds > 0 ? formatClock(week.seconds) : voice.grounds.runs.paceUnknown}
              />
              <MiniStat
                label={voice.grounds.runs.paceLabel}
                value={
                  week.paceSeconds > 0
                    ? `${formatClock(week.paceSeconds)}${voice.grounds.runUnitPerKm}`
                    : voice.grounds.runs.paceUnknown
                }
              />
            </div>
          </div>

          {vsLast && <p className="mt-2 text-[11px] text-ink-faint">{vsLast}</p>}

          <div className="mt-3 border-t border-line pt-2.5">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">
              {voice.grounds.runs.recent}
            </div>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {recent.map((w) => {
                const km = w.run?.distanceKm ?? 0
                const seconds = runTotalSeconds(w)
                const pace = runPaceSeconds(w)
                return (
                  <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-ink-dim">
                      {relativeDayLabel(w.performedAt, nowDate)}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                      <span className="text-ink">{km > 0 ? `${formatKm(km)} km` : '—'}</span>
                      <span className="text-ink-dim">{seconds > 0 ? formatClock(seconds) : '—'}</span>
                      <span className="w-14 text-right text-xs text-ink-faint">
                        {pace > 0
                          ? `${formatClock(pace)}${voice.grounds.runUnitPerKm}`
                          : voice.grounds.runs.paceUnknown}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-2.5 py-1.5 text-right">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">{label}</div>
      <div className="stat-num mt-0.5 text-base leading-none text-ink">{value}</div>
    </div>
  )
}
