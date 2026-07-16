import { useEffect, useMemo, useState } from 'react'
import { useNavStore } from '../core/store/nav'
import { useShellStore } from '../core/store/shell'
import { PRESET_SKIN_IDS, SKINS, applySkin } from '../core/ui/skins'
import { AmbientLayer } from '../core/ui/AmbientLayer'
import { voice } from '../core/voice'
import { useNow } from '../core/useNow'
import { storageAvailable } from '../core/storage'
import { useTrainingUi } from '../modules/training/uiStore'
import { CONSOLES } from './consoles'
import { ManorScreen } from './manor/ManorScreen'
import { SettingsMenu } from './SettingsMenu'
import { TabBar } from './TabBar'

export default function App() {
  const skin = useShellStore((s) => s.skin)
  const now = useNow()
  const storageOk = useMemo(() => storageAvailable(), [])

  // 'manor' (home) or a wing id. In DEV, ?view=<id> (or the legacy ?console=)
  // deep-links a view, and the training screenshot params
  // (?sheet/?detail/?map/?debugmap) imply the Grounds.
  const [view, setView] = useState<string>(() => {
    if (!import.meta.env.DEV) return 'manor'
    const params = new URLSearchParams(window.location.search)
    const v = params.get('view') ?? params.get('console')
    if (v && (v === 'manor' || CONSOLES.some((x) => x.id === v))) return v
    const trainingParams = ['sheet', 'detail', 'map', 'debugmap']
    if (trainingParams.some((k) => params.has(k))) return 'training'
    return 'manor'
  })

  useEffect(() => applySkin(skin), [skin])

  // wings request navigation through the core mailbox (they can't import app/)
  const requestedView = useNavStore((s) => s.requestedView)
  useEffect(() => {
    if (!requestedView) return
    if (requestedView === 'manor' || CONSOLES.some((c) => c.id === requestedView)) {
      setView(requestedView)
    }
    useNavStore.getState().consumeView()
  }, [requestedView])

  const active = CONSOLES.find((c) => c.id === view) ?? null

  return (
    <>
      <AmbientLayer />
      <div className="mx-auto min-h-dvh w-full max-w-[1280px] px-4 pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-10 lg:px-8">
        {!storageOk && (
          <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-ink">
            {voice.storageWarning}
          </div>
        )}

        <AppHeader
          now={now}
          view={view}
          onNav={setView}
          onAdd={
            view === 'training'
              ? () => useTrainingUi.getState().requestAddSheet()
              : undefined
          }
        />

        {active ? <active.Screen /> : <ManorScreen />}
      </div>

      <TabBar view={view} onNav={setView} />
    </>
  )
}

/* ---------------------------------------------------------------- header */

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

/** The one header: wordmark + clock line, view tabs, preset dots, gear. */
function AppHeader({
  now,
  view,
  onNav,
  onAdd,
}: {
  now: number
  view: string
  onNav: (view: string) => void
  onAdd?: () => void
}) {
  const skin = useShellStore((s) => s.skin)
  const setSkin = useShellStore((s) => s.setSkin)
  const d = new Date(now)

  // the Manor first, then every registered wing — a new wing means a new tab
  const tabs = [
    { id: 'manor', label: voice.manor.name },
    ...CONSOLES.map((c) => ({ id: c.id, label: c.name })),
  ]

  // the Log button only exists while the Grounds is open
  const logButton = onAdd ? (
    <button
      type="button"
      onClick={onAdd}
      className="btn-log btn-cta hidden items-center gap-2 px-5 py-2 text-sm md:inline-flex"
    >
      <PlusIcon />
      Log Workout
    </button>
  ) : null

  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3 py-4 md:py-5">
      <div>
        <div className="font-display text-[15px] font-bold uppercase leading-none tracking-[0.3em] text-ink md:text-[21px]">
          {voice.wordmark.lead}
          {voice.wordmark.accent && (
            <>
              {' '}
              <span className="text-accent">{voice.wordmark.accent}</span>
            </>
          )}
        </div>
        <div className="mt-1.5 text-[11px] uppercase tracking-[0.06em] text-ink-dim [font-variant-numeric:tabular-nums]">
          {WD_LONG[d.getDay()]} {d.getDate()} {MO_LONG[d.getMonth()]} {d.getFullYear()} ·{' '}
          {hhmm(d)}
        </div>
      </div>

      {/* header tabs are desktop chrome — the mobile tab bar owns navigation below md */}
      <nav className="hidden flex-wrap gap-x-5 gap-y-1 sm:ml-2 md:flex" aria-label="Views">
        {tabs.map((t) => {
          const on = view === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onNav(t.id)}
              className={`pb-1.5 pt-1 font-display text-sm font-semibold uppercase tracking-[0.22em] transition-colors ${
                on
                  ? 'text-accent shadow-[inset_0_-2px_0_var(--color-accent)]'
                  : 'text-ink-dim hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <span className="hidden text-[9.5px] tracking-[0.18em] text-ink-dim md:inline">
          {voice.presetLabel}
        </span>
        <div className="hidden items-center gap-2 md:flex">
          {PRESET_SKIN_IDS.map((id) => (
            <button
              key={id}
              type="button"
              title={SKINS[id].name}
              aria-label={`${SKINS[id].name} preset`}
              onClick={() => setSkin(id)}
              className="h-4 w-4 rounded-full border-2 transition-colors"
              style={{
                background: SKINS[id].swatches[2],
                borderColor: skin === id ? 'var(--color-ink)' : 'transparent',
              }}
            />
          ))}
        </div>
        {logButton}
        <SettingsMenu />
      </div>
    </header>
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
