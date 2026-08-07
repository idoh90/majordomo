import { Hinted } from '../../core/ui/Hint'
import { voice } from '../../core/voice'
import type { CycleStats } from './lib'

/**
 * THE CYCLE — the shape of the week's duty, which the estate has always had
 * the figures for and never stated: how many of the watches were nights, how
 * much sleep it pencilled around them, the tightest gap between two, and where
 * the week's hundred and sixty-eight hours actually went.
 */
export function CycleCard({ stats }: { stats: CycleStats }) {
  const total = stats.onDutyH + stats.pencilledH + stats.ownH
  const pct = (h: number) => (total > 0 ? (h / total) * 100 : 0)
  const posted = stats.nights + stats.days

  return (
    <section className="panel p-5">
      <Hinted tip={voice.hints.watch.cycle}>
        <div className="card-title">{voice.watch.cycle.title}</div>
      </Hinted>

      {posted === 0 ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">{voice.watch.cycle.empty}</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Figure label={voice.watch.cycle.nights} value={String(stats.nights)} />
            <Figure label={voice.watch.cycle.days} value={String(stats.days)} />
            <Figure
              label={voice.watch.cycle.pencilled}
              value={`${stats.pencilledH.toFixed(1)} h`}
            />
            <Figure
              label={voice.watch.cycle.turnaround}
              value={stats.turnaroundH === null ? '—' : `${stats.turnaroundH.toFixed(1)} h`}
              /* the one figure here that can be alarming on its own */
              alarm={stats.turnaroundH !== null && stats.turnaroundH < 8}
            />
          </div>

          <div className="mt-5">
            <div className="card-title">{voice.watch.cycle.splitTitle}</div>
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-pill bg-panel-2">
              <span style={{ width: `${pct(stats.onDutyH)}%`, background: 'var(--color-w-watch)' }} />
              <span
                style={{
                  width: `${pct(stats.pencilledH)}%`,
                  background: 'color-mix(in srgb, var(--color-ink-dim) 55%, transparent)',
                }}
              />
              <span
                style={{
                  width: `${pct(stats.ownH)}%`,
                  background: 'color-mix(in srgb, var(--color-positive) 45%, transparent)',
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-dim [font-variant-numeric:tabular-nums]">
              <Key color="var(--color-w-watch)" label={voice.watch.cycle.onDuty} h={stats.onDutyH} />
              <Key
                color="color-mix(in srgb, var(--color-ink-dim) 55%, transparent)"
                label={voice.watch.cycle.pencilled}
                h={stats.pencilledH}
              />
              <Key
                color="color-mix(in srgb, var(--color-positive) 45%, transparent)"
                label={voice.watch.cycle.own}
                h={stats.ownH}
              />
            </div>
          </div>

          <p className="mt-4 text-[12.5px] leading-relaxed text-ink-dim">
            {voice.watch.cycle.line({
              nights: stats.nights,
              days: stats.days,
              pencilledH: stats.pencilledH,
              turnaroundH: stats.turnaroundH,
              ownH: stats.ownH,
            })}
          </p>
        </>
      )}
    </section>
  )
}

function Figure({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-[0.16em] text-ink-faint">{label}</div>
      <div
        className="stat-num mt-1 text-[22px] leading-none"
        style={{ color: alarm ? 'var(--color-danger)' : 'var(--color-ink)' }}
      >
        {value}
      </div>
    </div>
  )
}

function Key({ color, label, h }: { color: string; label: string; h: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
      {label} {h.toFixed(1)} h
    </span>
  )
}
