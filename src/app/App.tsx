import { useEffect, useMemo, useState } from 'react'
import type { ConsoleModule } from '../core/module'
import { useShellStore } from '../core/store/shell'
import { SKINS, applySkin } from '../core/ui/skins'
import { useNow } from '../core/useNow'
import { storageAvailable } from '../core/storage'
import { useTrainingUi } from '../modules/training/uiStore'
import { AmbientLayer } from '../core/ui/AmbientLayer'
import { voice } from '../core/voice'
import { CONSOLES } from './consoles'
import { SettingsMenu } from './SettingsMenu'

export default function App() {
  const skin = useShellStore((s) => s.skin)
  const now = useNow()
  const storageOk = useMemo(() => storageAvailable(), [])

  // 'menu' or a console id. In DEV, ?console=<id> opens a console directly, and
  // the training screenshot params (?sheet/?detail/?map/?debugmap) imply training.
  const [view, setView] = useState<string>(() => {
    if (!import.meta.env.DEV) return 'menu'
    const params = new URLSearchParams(window.location.search)
    const c = params.get('console')
    if (c && CONSOLES.some((x) => x.id === c)) return c
    const trainingParams = ['sheet', 'detail', 'map', 'debugmap']
    if (trainingParams.some((k) => params.has(k))) return 'training'
    return 'menu'
  })

  useEffect(() => applySkin(skin), [skin])

  const active = CONSOLES.find((c) => c.id === view) ?? null

  return (
    <>
      <AmbientLayer />
      {SKINS[skin].statusStrip && <TacOpsStrip now={now} />}
      <div className="mx-auto min-h-dvh w-full max-w-[1200px] px-4 pb-28 lg:px-8 lg:pb-10">
        {!storageOk && (
          <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-ink">
            Browser storage is blocked (private mode?) — workouts won't survive a reload.
          </div>
        )}

        <AppHeader
          now={now}
          onAdd={
            active?.id === 'training'
              ? () => useTrainingUi.getState().requestAddSheet()
              : undefined
          }
        />

        {/* daily briefing — every console contributes its own lines */}
        {CONSOLES.map((c) => c.Briefing && <c.Briefing key={c.id} />)}

        {active ? (
          <>
            <button
              type="button"
              onClick={() => setView('menu')}
              className="chip mt-4 inline-flex items-center gap-1.5 border border-line bg-panel px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-dim transition-colors hover:text-ink"
            >
              <BackIcon />
              Consoles
            </button>
            <active.Screen />
          </>
        ) : (
          <main className="mt-4 grid gap-4 sm:grid-cols-2">
            {CONSOLES.map((c) => (
              <ConsoleTile key={c.id} mod={c} onOpen={() => setView(c.id)} />
            ))}
          </main>
        )}
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- menu */

function ConsoleTile({ mod, onOpen }: { mod: ConsoleModule; onOpen: () => void }) {
  const offline = mod.status === 'offline'
  return (
    <button
      type="button"
      disabled={offline}
      onClick={onOpen}
      className={`card p-5 text-left transition-colors ${
        offline ? 'opacity-40' : 'hover:border-accent/40'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-accent">
          {mod.Icon && <mod.Icon />}
          <span className="card-title truncate">{mod.name}</span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-ink-faint">
          <span className={`h-1.5 w-1.5 rounded-full ${offline ? 'bg-ink-faint' : 'bg-accent'}`} />
          {offline ? 'offline' : 'online'}
        </span>
      </div>
      {mod.tagline && <span className="mt-1 block text-[11px] text-ink-faint">{mod.tagline}</span>}
      <span className="mt-4 block">
        <mod.Tile />
      </span>
    </button>
  )
}

/* ---------------------------------------------------------------- header */

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MO = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MO_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/** Per-skin header treatment, matching each design direction's masthead. */
function AppHeader({ now, onAdd }: { now: number; onAdd?: () => void }) {
  // branch on the header *variant* so light siblings share their dark twin's layout
  const skin = SKINS[useShellStore((s) => s.skin)].header
  const d = new Date(now)

  // the Log button only exists while the Training console is open
  const logButton = onAdd ? (
    <button
      type="button"
      onClick={onAdd}
      className="btn-log btn-cta hidden items-center gap-2 px-5 py-2 text-sm lg:inline-flex"
    >
      <PlusIcon />
      Log Workout
    </button>
  ) : null

  if (skin === 'noir') {
    return (
      <header className="relative pb-5 pt-6 text-center">
        <div className="absolute right-0 top-6 flex items-center gap-2.5">
          {logButton}
          <SettingsMenu />
        </div>
        <div className="text-[9px] uppercase tracking-[0.42em] text-ink-faint">
          Personal training dossier
        </div>
        <h1 className="mt-2 font-display text-4xl text-ink">
          {voice.wordmark.lead}
          {voice.wordmark.accent && (
            <>
              {' '}
              <span className="italic text-accent">{voice.wordmark.accent}</span>
            </>
          )}
        </h1>
        <div className="mt-3.5 flex items-center gap-3">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[9.5px] uppercase tracking-[0.3em] text-ink-faint">
            {WD_LONG[d.getDay()]}, {d.getDate()} {MO_LONG[d.getMonth()]} {d.getFullYear()}
          </span>
          <span className="h-px flex-1 bg-line" />
        </div>
      </header>
    )
  }

  if (skin === 'ironworks') {
    return (
      <header className="py-5">
        <div className="flex items-start justify-between">
          <h1 className="font-display text-3xl uppercase leading-[1.02] text-ink sm:text-4xl">
            {voice.wordmark.lead}
            {voice.wordmark.accent && (
              <>
                <br />
                <span className="text-accent">{voice.wordmark.accent}</span>
              </>
            )}
          </h1>
          <div className="flex items-center gap-2.5">
            {logButton}
            <SettingsMenu />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="bg-ink px-2 py-0.5 text-[9px] font-extrabold tracking-[0.18em] text-bg">
            {WD[d.getDay()]} {d.getDate()} {MO[d.getMonth()]}
          </span>
          <span className="h-0.5 flex-1 bg-accent" />
          <span className="text-[9px] font-bold tracking-[0.18em] text-ink-faint">
            WK {isoWeek(d)}
          </span>
        </div>
      </header>
    )
  }

  if (skin === 'ghost') {
    return (
      <header className="flex items-center justify-between py-6">
        <div>
          <h1 className="font-display text-sm font-medium uppercase tracking-[0.42em] text-ink">
            {voice.wordmark.lead}
            {voice.wordmark.accent && (
              <>
                {' '}
                <span className="text-accent">{voice.wordmark.accent}</span>
              </>
            )}
          </h1>
          <div className="mt-2 text-[9.5px] font-light tracking-[0.3em] text-ink-faint">
            {WD[d.getDay()]} {d.getDate()} {MO[d.getMonth()]} {d.getFullYear()} · {hhmm(d)}
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {logButton}
          <SettingsMenu />
        </div>
      </header>
    )
  }

  if (skin === 'tacops') {
    return (
      <header className="flex items-center justify-between py-5">
        <div>
          <h1 className="font-display text-xl font-bold uppercase tracking-[0.14em] text-ink sm:text-2xl">
            {voice.wordmark.lead}
            {voice.wordmark.accent && (
              <>
                {' '}
                <span className="text-accent">{voice.wordmark.accent}</span>
              </>
            )}
          </h1>
          <div className="mt-1 text-[9px] tracking-[0.22em] text-ink-faint">
            {'//'} OPERATOR: SINGLE-USER {'//'} NO UPLINK
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {logButton}
          <SettingsMenu />
        </div>
      </header>
    )
  }

  // classic (default)
  return (
    <header className="flex items-center justify-between py-5">
      <div>
        <h1 className="font-display text-xl font-bold uppercase tracking-[0.16em] sm:text-2xl">
          {voice.wordmark.lead}
          {voice.wordmark.accent && (
            <>
              {' '}
              <span className="text-accent">{voice.wordmark.accent}</span>
            </>
          )}
        </h1>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-px w-6 bg-gradient-to-r from-accent to-transparent" />
          <span className="font-display text-[10px] font-semibold tracking-[0.3em] text-ink-faint">
            {WD[d.getDay()]} · {MO[d.getMonth()]} {d.getDate()} · {d.getFullYear()}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        {logButton}
        <SettingsMenu />
      </div>
    </header>
  )
}

/** Tac-Ops terminal status strip pinned above the header. */
function TacOpsStrip({ now }: { now: number }) {
  const d = new Date(now)
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')} ${hhmm(d)}`
  return (
    <div className="flex items-center justify-between border-b border-line px-4 py-1.5 text-[9px] tracking-[0.14em] text-ink-faint lg:px-8">
      <span>TAC-OPS v3.1</span>
      <span className="text-accent">■ SYS NOMINAL</span>
      <span>{stamp}</span>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 5 8 12l7 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
