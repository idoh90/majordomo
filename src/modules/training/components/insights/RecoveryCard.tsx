import { useMemo } from 'react'
import type { Workout } from '../../types'
import { useShellStore } from '../../../../core/store/shell'
import { SKINS } from '../../../../core/ui/skins'
import { Hinted } from '../../../../core/ui/Hint'
import { voice } from '../../../../core/voice'
import { recoveryOutlook } from '../../lib/recovery'
import { strainToColor } from '../../lib/strainColor'

/**
 * RECOVERY — the mobile design's hot-muscle rows: name, how worn, and when
 * it settles. Renders nothing while everything is cool. Strain is computed,
 * never stored, so the card is always current.
 */

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export function RecoveryCard({ workouts, now }: { workouts: Workout[]; now: number }) {
  const skin = SKINS[useShellStore((s) => s.skin)]
  // hour-rounded so the minute tick doesn't re-run the scan
  const nowH = Math.floor(now / 3_600_000) * 3_600_000
  const rows = useMemo(
    () => (workouts.length ? recoveryOutlook(workouts, nowH) : []),
    [workouts, nowH],
  )
  if (rows.length === 0) return null

  return (
    <section className="panel px-4 pb-4 pt-3 lg:hidden">
      <Hinted tip={voice.hints.grounds.recovery}>
        <h2 className="card-title">{voice.grounds.recoveryTitle}</h2>
      </Hinted>
      <div className="mt-2.5 flex flex-col gap-2">
        {rows.map((r) => {
          const color = strainToColor(r.strain, skin.heatRamp)
          const settle = r.settlesAt ? new Date(r.settlesAt) : null
          return (
            <div key={r.id} className="card px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[12.5px] font-semibold">{r.label}</span>
                <span
                  className="ml-auto text-[11.5px] [font-variant-numeric:tabular-nums]"
                  style={{ color }}
                >
                  {Math.round(r.strain * 10)}%
                </span>
              </div>
              <div
                className="mt-1.5 h-1 overflow-hidden rounded-full"
                style={{ background: 'color-mix(in srgb, var(--color-line) 70%, transparent)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, r.strain * 10)}%`, background: color }}
                />
              </div>
              {settle && (
                <div className="mt-1 text-[10px] text-ink-dim [font-variant-numeric:tabular-nums]">
                  {voice.grounds.settles({ day: WD[settle.getDay()], time: hhmm(settle) })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
