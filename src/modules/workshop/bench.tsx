import { useEffect, useState } from 'react'
import { useNavStore } from '../../core/store/nav'
import { voice } from '../../core/voice'
import { useWorkshopStore } from './store'
import { useWorkshopUi } from './uiStore'

/**
 * The live bench — the estate's first and only stopwatch. The clock itself is
 * `bench.startedAt` in the persisted store; these components only ever RENDER
 * elapsed time, so the 1 s ticker stays scoped to whichever of them is
 * mounted and the rest of the app keeps its minute-grain `useNow`.
 */

function useElapsed(startedAt: number | null): number {
  const [, tick] = useState(0)
  useEffect(() => {
    if (startedAt === null) return
    const id = setInterval(() => tick((n) => n + 1), 1_000)
    return () => clearInterval(id)
  }, [startedAt])
  return startedAt === null ? 0 : Math.max(0, Date.now() - startedAt)
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 1:42:07 — the running control's clock */
function hms(ms: number): string {
  const s = Math.floor(ms / 1_000)
  return `${Math.floor(s / 3_600)}:${pad2(Math.floor(s / 60) % 60)}:${pad2(s % 60)}`
}

/** 1:42 — the chip's clock */
function hm(ms: number): string {
  const m = Math.floor(ms / 60_000)
  return `${Math.floor(m / 60)}:${pad2(m % 60)}`
}

const glow = {
  border: '1px solid color-mix(in srgb, var(--color-w-workshop) 55%, transparent)',
  background:
    'linear-gradient(180deg, color-mix(in srgb, var(--color-w-workshop) 20%, transparent), color-mix(in srgb, var(--color-w-workshop) 10%, transparent))',
  boxShadow: '0 0 17px var(--glow-workshop)',
}

/**
 * The chip riding the app's chrome on every screen while the bench is live —
 * the reason a timer cannot be forgotten overnight. Tap returns to the board.
 * Renders nothing while idle, so the header costs nothing to carry it.
 */
export function BenchChip() {
  const bench = useWorkshopStore((s) => s.bench)
  const elapsed = useElapsed(bench?.startedAt ?? null)
  if (!bench) return null
  return (
    <button
      type="button"
      onClick={() => {
        useWorkshopUi.getState().requestBoard(bench.ventureId)
        useNavStore.getState().requestView('workshop')
      }}
      className="rounded-pill px-2.5 py-1 font-display text-[9px] font-semibold tracking-[0.12em] [font-variant-numeric:tabular-nums]"
      style={{ ...glow, color: 'var(--color-w-workshop)' }}
    >
      {voice.workshop.atTheBench} · {hm(elapsed)}
    </button>
  )
}

/**
 * The timer where the work happens: TO THE BENCH when idle (filled copper, no
 * glow — glow is a state, not a paint), the live clock + DOWN TOOLS when
 * running. `onStart` is the idle press; the caller decides which venture that
 * means (the board knows, the wing screen asks).
 */
export function BenchControl({
  onStart,
  onStopped,
  compact = false,
}: {
  onStart: () => void
  /** receives the butler's line for the stop that just happened */
  onStopped: (toast: string) => void
  compact?: boolean
}) {
  const bench = useWorkshopStore((s) => s.bench)
  const elapsed = useElapsed(bench?.startedAt ?? null)

  if (!bench) {
    return (
      <button
        type="button"
        onClick={onStart}
        className={`btn-cta tracking-[0.16em] ${compact ? 'px-4 py-2.5 text-[11px]' : 'w-full px-6 py-3 text-[13px] sm:w-auto'}`}
        style={{ background: 'var(--color-w-workshop)', color: 'var(--color-bg)', boxShadow: 'none' }}
      >
        {voice.workshop.toTheBench}
      </button>
    )
  }

  const stop = () => {
    const r = useWorkshopStore.getState().stopBench()
    const t = voice.workshop.toast
    if (r.kind === 'logged') onStopped(t.benchStop({ h: r.h, m: r.m }))
    else if (r.kind === 'short') onStopped(t.benchShort)
    else if (r.kind === 'sandbox') onStopped(t.benchSandbox)
  }

  return (
    <button
      type="button"
      onClick={stop}
      className={`flex items-center rounded-xl ${compact ? 'gap-2.5 px-3 py-1.5' : 'gap-3.5 px-4 py-2'}`}
      style={glow}
    >
      <span className="flex flex-col items-start">
        <span
          className="font-display text-[8px] font-semibold tracking-[0.18em]"
          style={{ color: 'var(--color-w-workshop)' }}
        >
          {voice.workshop.atTheBench}
        </span>
        <span
          className={`stat-num font-display font-semibold leading-tight [font-variant-numeric:tabular-nums] ${compact ? 'text-[16px]' : 'text-[20px]'}`}
        >
          {hms(elapsed)}
        </span>
      </span>
      <span
        aria-hidden
        className={compact ? 'h-5 w-px' : 'h-6 w-px'}
        style={{ background: 'color-mix(in srgb, var(--color-w-workshop) 35%, transparent)' }}
      />
      <span
        className="font-display text-[10px] font-bold tracking-[0.15em]"
        style={{ color: 'var(--color-w-workshop)' }}
      >
        {voice.workshop.downTools}
      </span>
    </button>
  )
}
