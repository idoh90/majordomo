import { fmtHM } from '../../../core/sleep/lib'
import type { NightPoint } from '../../../core/sleep/lib'
import type { SleepStats } from '../../../core/sleep/types'
import { voice } from '../../../core/voice'

/**
 * THE FORTNIGHT — the ledger strip under the night sheet's form.
 *
 * The point of putting it here rather than only on the Manor's board is that
 * the moment you have just written a night down is the moment the fortnight
 * means something: you can see the one you just typed join the other thirteen.
 *
 * A night with no record draws an EMPTY column, never a short one. The whole
 * honesty of every figure below rests on the difference between "slept badly"
 * and "did not write it down", and a bar chart that renders both as a stub
 * loses it in the one place the reader would notice.
 */
export function NightLedger({
  points,
  stats,
  activeKey,
}: {
  points: NightPoint[]
  stats: SleepStats
  /** the night the form is currently on, lit in the strip */
  activeKey: string
}) {
  const V = voice.night
  const ceiling = Math.max(9, stats.targetH, ...points.map((p) => p.hours))
  const anything = points.some((p) => p.has)

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[9.5px] font-semibold tracking-[0.2em] text-ink-dim">
          {V.sheet.ledger}
        </span>
        {stats.targetH > 0 && (
          <span className="text-[10px] text-ink-faint [font-variant-numeric:tabular-nums]">
            {V.stats.debtNote({ target: stats.targetH })}
          </span>
        )}
      </div>

      {anything ? (
        <>
          <div className="relative mt-2 flex h-[46px] items-end gap-[3px]">
            {/* the target line, drawn across the strip in percent so it lands
                on the same scale the columns are drawn to */}
            {stats.targetH > 0 && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 border-t border-dashed"
                style={{
                  bottom: `${(stats.targetH / ceiling) * 100}%`,
                  borderColor: 'color-mix(in srgb, var(--color-ink) 22%, transparent)',
                }}
              />
            )}
            {points.map((p) => {
              const on = p.dayKey === activeKey
              return (
                <div
                  key={p.dayKey}
                  title={p.has ? fmtHM(p.hours) : V.stats.notWritten}
                  className="relative flex h-full min-w-0 flex-1 items-end"
                >
                  {p.has ? (
                    <div
                      className="w-full rounded-[2px]"
                      style={{
                        height: `${Math.max(4, (p.hours / ceiling) * 100)}%`,
                        background: on
                          ? 'var(--color-w-sleep)'
                          : 'color-mix(in srgb, var(--color-w-sleep) 42%, transparent)',
                      }}
                    />
                  ) : (
                    <div
                      className="w-full rounded-[2px] border border-dashed"
                      style={{
                        height: '100%',
                        borderColor: on
                          ? 'color-mix(in srgb, var(--color-w-sleep) 60%, transparent)'
                          : 'color-mix(in srgb, var(--color-line) 100%, transparent)',
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
            <Figure
              label={V.stats.lastNight}
              value={stats.last ? fmtHM(stats.last.hours) : '—'}
              note={stats.last ? dayName(stats.last.wake) : V.stats.notWritten}
            />
            <Figure
              label={V.stats.average}
              value={stats.covered > 0 ? fmtHM(stats.avgH) : '—'}
              note={V.stats.averageNote({ covered: stats.covered })}
            />
            <Figure
              label={V.stats.debt}
              value={stats.targetH > 0 ? (stats.debtH < 0.1 ? '—' : fmtHM(stats.debtH)) : '—'}
              note={V.stats.debtNote({ target: stats.targetH })}
            />
            <Figure
              label={V.stats.regularity}
              value={stats.regularity === null ? '—' : String(stats.regularity)}
              note={
                stats.regularity === null
                  ? V.stats.tooThin
                  : V.stats.regularityNote({
                      driftMin: stats.driftMin,
                      bed: stats.usual ? hhmm(stats.usual.bedMin) : null,
                      wake: stats.usual ? hhmm(stats.usual.wakeMin) : null,
                    })
              }
            />
          </div>
        </>
      ) : (
        <p className="mt-2 text-[12px] italic text-ink-dim">{V.sheet.ledgerEmpty}</p>
      )}
    </div>
  )
}

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** the morning a night ended on, as the rest of the Manor spells a day */
const dayName = (d: Date): string => `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`

const hhmm = (min: number): string => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-[8.5px] font-semibold tracking-[0.18em] text-ink-faint">
        {label}
      </div>
      <div className="stat-num mt-0.5 text-[14px] leading-none text-ink">{value}</div>
      <div className="mt-1 text-[9.5px] leading-snug text-ink-faint">{note}</div>
    </div>
  )
}
