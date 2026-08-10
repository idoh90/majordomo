import { addDays, localDayKey, startOfWeek } from '../../core/dates'
import { useShellStore } from '../../core/store/shell'
import { voice } from '../../core/voice'
import type { VentureStatus } from './types'

/** small furniture shared by the wing screen and the board */

export const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
export const fdate = (d: Date) => `${WD[d.getDay()]} ${d.getDate()}`
export const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

export const COPPER = 'var(--color-w-workshop)'

export function StatusPill({ status }: { status: VentureStatus }) {
  const label = voice.workshop.statusName[status]
  const style =
    status === 'building'
      ? {
          borderColor: 'color-mix(in srgb, var(--color-w-workshop) 40%, transparent)',
          background: 'color-mix(in srgb, var(--color-w-workshop) 14%, transparent)',
          color: 'var(--color-ink)',
        }
      : status === 'spark'
        ? {
            borderColor: 'color-mix(in srgb, var(--color-w-workshop) 45%, transparent)',
            background: 'transparent',
            color: COPPER,
          }
        : status === 'shipped'
          ? {
              borderColor: 'color-mix(in srgb, var(--color-positive) 45%, transparent)',
              background: 'color-mix(in srgb, var(--color-positive) 12%, transparent)',
              color: 'var(--color-positive)',
            }
          : {
              borderColor: 'var(--color-line)',
              background: 'transparent',
              color: 'var(--color-ink-faint)',
            }
  return (
    <span
      className="rounded-pill border px-2.5 py-0.5 font-display text-[8.5px] font-semibold tracking-[0.14em]"
      style={style}
    >
      {label}
    </span>
  )
}

/**
 * How far along the board is — struck jobs against hung ones. Sits beside the
 * odometer everywhere, because the two answer different questions: the
 * odometer is what a venture has COST, this is how much of it is DONE.
 * Renders nothing when the board holds no jobs; an empty bar reading 0% would
 * accuse a venture of being nowhere when nothing has been asked of it yet.
 */
export function TaskProgressBar({
  progress,
  className = '',
  bare = false,
}: {
  progress: { done: number; total: number; pct: number }
  className?: string
  /** just the track — for surfaces whose headline already states the figures */
  bare?: boolean
}) {
  if (progress.total === 0) return null
  return (
    <div className={className}>
      {!bare && (
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[8.5px] font-semibold tracking-[0.18em] text-ink-faint">
            {voice.workshop.tasks.label}
          </span>
          <span className="ml-auto text-[11px] text-ink-dim [font-variant-numeric:tabular-nums]">
            {voice.workshop.tasks.count(progress)}
          </span>
          <span
            className="font-display text-[11.5px] font-semibold [font-variant-numeric:tabular-nums]"
            style={{ color: COPPER }}
          >
            {voice.workshop.tasks.pct(progress.pct)}
          </span>
        </div>
      )}
      <div className={`${bare ? '' : 'mt-1'} h-1.5 overflow-hidden rounded-pill bg-panel-2`}>
        <div
          className="h-full rounded-pill transition-[width] duration-300"
          style={{
            width: `${progress.pct}%`,
            background: COPPER,
            boxShadow: progress.pct > 0 ? '0 0 8px var(--glow-workshop)' : undefined,
          }}
        />
      </div>
    </div>
  )
}

export function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 mt-4 block font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
      {children}
    </span>
  )
}

export function SheetActions({
  cta,
  onCancel,
  onSave,
}: {
  cta: string
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="mt-5 flex justify-end gap-2.5">
      <button
        type="button"
        onClick={onCancel}
        className="btn-soft px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.14em]"
      >
        {voice.workshop.sheet.cancel}
      </button>
      <button
        type="button"
        onClick={onSave}
        className="btn-cta px-5 py-2.5 text-[11px] tracking-[0.16em]"
        style={{ background: COPPER, color: 'var(--color-bg)', boxShadow: 'none' }}
      >
        {cta}
      </button>
    </div>
  )
}

export function Stepper({
  label,
  minWidth = 84,
  onDec,
  onInc,
}: {
  label: string
  minWidth?: number
  onDec: () => void
  onInc: () => void
}) {
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={onDec}
        className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-panel-2 text-base text-ink"
      >
        −
      </button>
      <span
        className="text-center font-display text-[17px] font-semibold [font-variant-numeric:tabular-nums]"
        style={{ minWidth }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onInc}
        className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-panel-2 text-base text-ink"
      >
        +
      </button>
    </span>
  )
}

/** venture picker chips shared by the sheets */
export function VentureChips({
  ventures,
  value,
  onPick,
}: {
  ventures: { id: string; name: string }[]
  value: string
  onPick: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ventures.map((v) => {
        const on = v.id === value
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onPick(v.id)}
            className="rounded-pill border px-3.5 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
            style={{
              borderColor: on ? COPPER : 'var(--color-line)',
              background: on
                ? 'color-mix(in srgb, var(--color-w-workshop) 12%, transparent)'
                : 'var(--color-panel-2)',
              color: on ? 'var(--color-ink)' : 'var(--color-ink-dim)',
            }}
          >
            {v.name.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

/** 14-day strip (this week + next), the study sheets' pattern */
export function DayStrip({
  now,
  picked,
  onPick,
}: {
  now: number
  picked: number | null
  onPick: (i: number) => void
}) {
  const strip0 = startOfWeek(new Date(now), useShellStore.getState().weekStart)
  const days = Array.from({ length: 14 }, (_, i) => addDays(strip0, i))
  const todayKey = localDayKey(new Date(now))
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((day, i) => {
        const on = picked === i
        const isToday = localDayKey(day) === todayKey
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className="w-[52px] rounded-[9px] border pb-1.5 pt-2 text-center transition-colors"
            style={{
              borderColor: on ? COPPER : 'var(--color-line)',
              background: on
                ? 'color-mix(in srgb, var(--color-w-workshop) 12%, transparent)'
                : 'var(--color-panel-2)',
            }}
          >
            <span
              className="block text-[9px] tracking-[0.16em]"
              style={{ color: isToday ? COPPER : 'var(--color-ink-dim)' }}
            >
              {WD[day.getDay()]}
            </span>
            <span className="block font-display text-base font-semibold [font-variant-numeric:tabular-nums]">
              {day.getDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** index of today inside the 14-day strip */
export function todayStripIndex(now: number): number {
  const strip0 = startOfWeek(new Date(now), useShellStore.getState().weekStart)
  return Math.max(
    0,
    Math.min(13, Math.round((new Date(now).setHours(0, 0, 0, 0) - strip0.getTime()) / 86_400_000)),
  )
}

/** the pegboard material — a perforated recess, dots from the skin's own ink */
export const PEGBOARD_BG: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(color-mix(in srgb, var(--color-ink) 8%, transparent) 1.5px, transparent 2px)',
  backgroundSize: '22px 22px',
  backgroundPosition: '11px 11px',
}
