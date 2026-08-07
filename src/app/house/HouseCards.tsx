import { useNavStore } from '../../core/store/nav'
import { muscleLabel } from '../../modules/training/data/muscles'
import { Hinted } from '../../core/ui/Hint'
import { voice } from '../../core/voice'
import { Sparkline } from './Sparkline'
import type { HouseModel, HouseRow, WingId } from './house'

const WING_COLOR: Record<WingId, string> = {
  manor: 'var(--color-accent)',
  watch: 'var(--color-w-watch)',
  grounds: 'var(--color-w-grounds)',
  study: 'var(--color-w-study)',
  capital: 'var(--color-w-ledger)',
}

const WING_NAME: Record<WingId, string> = {
  manor: voice.manor.name,
  watch: voice.modules.watch.name,
  grounds: voice.modules.training.name,
  study: voice.modules.study.name,
  capital: voice.modules.capital.name,
}

/** strip the leading article every wing name carries — the rail has no room */
const short = (id: WingId) => WING_NAME[id].replace(/^THE\s+/i, '')

/* ------------------------------------------------------- the wing's signal */

export function SignalCard({ house, wing }: { house: HouseModel; wing: WingId }) {
  const s = voice.house.signal
  const accent = WING_COLOR[wing]

  if (wing === 'watch') {
    const series = house.dutyLoad
    // the week's BOOKED total — the duty ring's denominator, not its numerator
    const thisWeek = house.watchBooked
    const prior = series.slice(0, -1).filter((h) => h > 0)
    const avg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0
    return (
      <Card title={s.dutyLoad} accent={accent}>
        <BigFigure value={`${thisWeek.toFixed(1)} h`} accent={accent} spark={series} />
        <Line>{s.dutyLoadLine({ thisWeek, avg })}</Line>
      </Card>
    )
  }

  if (wing === 'grounds') {
    const r = house.readiness
    return (
      <Card title={s.readiness} accent={accent}>
        <div className="mt-1 flex items-end gap-2">
          <span className="stat-num text-[30px] leading-none" style={{ color: accent }}>
            {r.score}
          </span>
          <span className="mb-1 text-[11px] text-ink-faint">of 100</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-panel-2">
          <div className="h-full rounded-pill" style={{ width: `${r.score}%`, background: accent }} />
        </div>
        <Line>
          {s.readinessLine({
            score: r.score,
            band: r.band,
            limiter: r.limiter ? muscleLabel(r.limiter) : null,
          })}
        </Line>
      </Card>
    )
  }

  if (wing === 'study') {
    const e = house.examRunway
    return (
      <Card title={s.examRunway} accent={accent}>
        {e ? (
          <>
            <BigFigure value={e.days <= 0 ? 'today' : `${e.days} d`} accent={accent} />
            <Line>{s.examRunwayLine(e)}</Line>
          </>
        ) : (
          <Line>{s.idle}</Line>
        )}
      </Card>
    )
  }

  if (wing === 'capital') {
    const b = house.burn
    return (
      <Card title={s.burnRate} accent={accent}>
        {b ? (
          <>
            <BigFigure value={fmtCompactMoney(b.perDay)} accent={accent} />
            <Line>
              {s.burnRateLine({
                perDay: fmtCompactMoney(b.perDay),
                prevPerDay: b.prevPerDay == null ? null : fmtCompactMoney(b.prevPerDay),
              })}
            </Line>
          </>
        ) : (
          <Line>{s.idle}</Line>
        )}
      </Card>
    )
  }

  return null
}

/* ------------------------------------------------------------- the house */

export function HouseCard({ house, exclude }: { house: HouseModel; exclude: WingId }) {
  const rows = house.rows.filter((r) => r.id !== exclude)
  return (
    <section className="panel px-4 py-3.5">
      <Hinted tip={voice.hints.house.rail}>
        <div className="card-title">{voice.house.title}</div>
        {/* the subtitle is load-bearing: it is what licenses five different
            units to sit in one column without any of them being wrong */}
        <div className="mt-0.5 text-[10.5px] italic text-ink-faint">{voice.house.subtitle}</div>
      </Hinted>
      <ul className="mt-3 flex flex-col gap-2.5">
        {rows.map((r) => (
          <Row key={r.id} row={r} />
        ))}
      </ul>
    </section>
  )
}

function Row({ row }: { row: HouseRow }) {
  const color = WING_COLOR[row.id]
  return (
    <li className="flex items-center gap-2">
      <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
      <span className="w-[52px] flex-none truncate font-display text-[9.5px] tracking-[0.14em] text-ink-faint">
        {short(row.id)}
      </span>
      <Sparkline series={row.series} color={color} />
      <span className="ml-auto flex flex-col items-end leading-tight">
        <span className="stat-num text-[12.5px] text-ink">{row.figure}</span>
        <span className="text-[9px] tracking-[0.1em] text-ink-faint">
          {row.figureIsSpend ? voice.house.rowLabel.capitalSpent : voice.house.rowLabel[row.id]}
        </span>
      </span>
      <Delta row={row} />
    </li>
  )
}

/** Colour comes from `good`, never from the sign: on the Watch a smaller
 *  number is the better week, and a shared "up is green" rule would praise
 *  exactly the wrong thing. */
function Delta({ row }: { row: HouseRow }) {
  if (row.delta == null || row.delta === 0) {
    return <span aria-hidden className="w-6 flex-none text-right text-[10px] text-ink-faint">—</span>
  }
  const color =
    row.good == null
      ? 'var(--color-ink-faint)'
      : row.good
        ? 'var(--color-positive)'
        : 'var(--color-danger)'
  const mag = Math.abs(row.delta)
  return (
    <span
      className="w-6 flex-none text-right text-[10px] [font-variant-numeric:tabular-nums]"
      style={{ color }}
    >
      {row.delta > 0 ? '▲' : '▼'}
      {mag >= 10 ? Math.round(mag) : mag.toFixed(mag < 1 ? 1 : 0)}
    </span>
  )
}

/* ----------------------------------------------------------- the pattern */

export function PatternCard({ house }: { house: HouseModel }) {
  const { id, args } = house.pattern
  const L = voice.house.pattern.lines
  const line =
    id === 'train-after-watch'
      ? L.trainAfterWatch({
          title: String(args.title),
          mins: Number(args.mins),
          before: args.before === 'true',
        })
      : id === 'study-untouched'
        ? L.studyUntouched({ subject: String(args.subject) })
        : L.none

  return (
    <section
      className="subcard px-3.5 py-3"
      style={{
        background: 'color-mix(in srgb, var(--color-ember) 7%, var(--color-subcard))',
        borderColor: 'color-mix(in srgb, var(--color-ember) 28%, transparent)',
      }}
    >
      <Hinted tip={voice.hints.house.pattern}>
        <div className="card-title" style={{ color: 'var(--color-ember)' }}>
          {voice.house.pattern.title}
        </div>
      </Hinted>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">{line}</p>
      {id === 'train-after-watch' && (
        <button
          type="button"
          onClick={() => useNavStore.getState().requestView('manor')}
          className="mt-2 inline-flex min-h-11 items-center font-display text-[10.5px] font-semibold tracking-[0.16em] transition-opacity hover:opacity-80 md:min-h-0"
          style={{ color: 'var(--color-ember)' }}
        >
          {voice.house.pattern.action}
        </button>
      )}
    </section>
  )
}

/* ------------------------------------------------------------- furniture */

function Card({
  title,
  accent,
  children,
}: {
  title: string
  accent: string
  children: React.ReactNode
}) {
  return (
    <section
      className="panel panel-lit px-4 py-3.5"
      style={{ ['--lit-accent' as string]: accent }}
    >
      <Hinted tip={voice.hints.house.signal}>
        <div className="card-title">{title}</div>
      </Hinted>
      {children}
    </section>
  )
}

function BigFigure({ value, accent, spark }: { value: string; accent: string; spark?: number[] }) {
  return (
    <div className="mt-1 flex items-end justify-between gap-2">
      <span className="stat-num text-[30px] leading-none" style={{ color: accent }}>
        {value}
      </span>
      {spark && <Sparkline series={spark} color={accent} width={72} height={26} />}
    </div>
  )
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-[11.5px] leading-relaxed text-ink-dim">{children}</p>
}

/** the rail is 252px wide; a full ₪688,667 does not belong in it */
function fmtCompactMoney(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1000) return `₪${(n / 1000).toFixed(1)}K`
  return `₪${Math.round(n)}`
}
