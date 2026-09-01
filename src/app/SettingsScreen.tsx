import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  STORE_LABEL,
  applyEstate,
  parseEstate,
  serializeEstate,
  type EstateFile,
  type EstatePreview,
} from '../core/backup'
import { localDayKey } from '../core/dates'
import { useAuthStore } from '../core/auth/store'
import { useSleepStore } from '../core/sleep/store'
import { useShellStore } from '../core/store/shell'
import { offReason } from '../core/sync/gate'
import { disableTelemetry } from '../core/telemetry'
import { ConfirmDialog } from '../core/ui/ConfirmDialog'
import { Sheet } from '../core/ui/Sheet'
import { SKINS, SKIN_IDS } from '../core/ui/skins'
import { voice } from '../core/voice'
import { downloadJson, parseImport, serializeExport } from '../modules/training/lib/backup'
import { ProfileSheet } from '../modules/training/components/ProfileSheet'
import { useWorkoutStore } from '../modules/training/store'
import type { Workout } from '../modules/training/types'
import { useAuthUi } from './authUi'
import { CalendarsSheet } from './gcal/CalendarsSheet'
import { openFrontDoor } from './frontDoor'
import { nudgeWing, useWings } from './wings'
import { entryStage, useOnboarding } from './onboarding/store'

/**
 * THE SETTINGS SCREEN.
 *
 * This was a 208px dropdown, and it stopped working the moment the house grew
 * a second wing's worth of preferences: twelve items in one scrolling column,
 * a skin picker hidden behind a row that opened a sheet on top of a menu, and
 * no room for any of them to say what they did. A setting nobody can explain
 * is a setting nobody will touch.
 *
 * So: a full page, sections that group by concern, and a line under anything
 * whose consequence is not obvious from its name.
 *
 * It sits at z-45 ON PURPOSE — above the tab bar (z-40) so it covers the whole
 * chrome, but below the Sheet layer (z-50), so every sheet it opens lands on
 * top of it rather than behind it. The confirm dialog (z-70) stays above both.
 */
export function SettingsScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const workouts = useWorkoutStore((s) => s.workouts)
  const replaceAll = useWorkoutStore((s) => s.replaceAll)
  const clearAll = useWorkoutStore((s) => s.clearAll)

  const [profileOpen, setProfileOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [estateOpen, setEstateOpen] = useState(false)
  const [calendarsOpen, setCalendarsOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [copied, setCopied] = useState(false)

  const authStatus = useAuthStore((s) => s.status)
  const registryShut = offReason()

  // Esc closes the page, but only when nothing it opened is in front of it —
  // otherwise one key would dismiss the sheet AND the page under it
  useEffect(() => {
    if (!open) return
    const busy = profileOpen || importOpen || estateOpen || calendarsOpen || confirmClear
    if (busy) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, profileOpen, importOpen, estateOpen, calendarsOpen, confirmClear])

  if (!open) return null

  const exportWorkoutsFile = () =>
    downloadJson(`majordomo-training-${localDayKey(new Date())}.json`, serializeExport(workouts))

  /** the whole household — every wing's store, for moving between devices */
  const exportEstate = () =>
    downloadJson(`majordomo-estate-${localDayKey(new Date())}.json`, serializeEstate())

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(serializeExport(workouts))
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // clipboard unavailable — fall back to the download, which always works
      exportWorkoutsFile()
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[45] overflow-y-auto bg-bg"
        role="dialog"
        aria-modal="true"
        aria-label={voice.settings.title}
      >
        <div className="mx-auto w-full max-w-2xl px-4 pb-[calc(40px+env(safe-area-inset-bottom))] lg:px-6">
          {/* sticky, because the page is long and the way out must never be a
              scroll away */}
          <header className="sticky top-0 z-10 -mx-4 mb-4 flex items-center gap-3 px-4 pb-3 pt-[calc(14px+env(safe-area-inset-top))] lg:-mx-6 lg:px-6"
            style={{
              background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <h1 className="font-display text-[17px] font-bold uppercase tracking-[0.24em] text-ink">
              {voice.settings.title}
            </h1>
            <button
              type="button"
              onClick={onClose}
              aria-label={voice.settings.close}
              className="chip ml-auto flex h-11 w-11 items-center justify-center border border-line bg-panel text-ink-dim transition-colors hover:text-ink"
            >
              <CloseIcon />
            </button>
          </header>

          <div className="flex flex-col gap-3.5">
            <Section title={voice.settings.groupAppearance}>
              <ThemePicker />
              <Divider />
              <WeekStart />
            </Section>

            <Section title={voice.settings.groupWings}>
              <WingList />
            </Section>

            <Section title={voice.settings.groupGuidance}>
              <PanelTipsToggle />
              <Divider />
              <Row
                label={voice.onboarding.settingsRerun}
                blurb={voice.settings.rerunBlurb}
                onClick={() => {
                  onClose()
                  useOnboarding.getState().begin(entryStage())
                }}
              />
              <Divider />
              {/* the other way of being introduced to the house, and the only
                  row on this screen that leaves the app — see app/frontDoor.ts
                  for why it navigates rather than swapping the root */}
              <Row
                label={voice.settings.frontDoorLabel}
                blurb={voice.settings.frontDoorBlurb}
                onClick={openFrontDoor}
              />
            </Section>

            {/* a shut registry says why (?demo) or says nothing at all (no
                storage, or a build with none configured): an inert control is
                worse than an absent one */}
            {registryShut === 'demo' ? (
              <Section title={voice.settings.groupAccount}>
                <Note>{voice.sync.demoNote}</Note>
              </Section>
            ) : registryShut ? null : (
              <Section title={voice.settings.groupAccount}>
                <Row
                  label={authStatus === 'signedIn' ? voice.sync.accountItem : voice.sync.connectItem}
                  blurb={voice.sync.blurb}
                  onClick={() => {
                    onClose()
                    useAuthUi.getState().setOpen(true)
                  }}
                />
              </Section>
            )}

            {/* the external-calendar bridge follows the account: a shut
                registry has nowhere to keep the connection, and signed out
                the note names sign-in as the remedy rather than presenting
                an inert control */}
            {registryShut ? null : (
              <Section title={voice.settings.groupCalendars}>
                {authStatus === 'signedIn' ? (
                  <Row
                    label={voice.calendars.settingsLabel}
                    blurb={voice.calendars.settingsBlurb}
                    onClick={() => setCalendarsOpen(true)}
                  />
                ) : (
                  <Note>{voice.calendars.needsAccount}</Note>
                )}
              </Section>
            )}

            <Section title={voice.settings.groupEstate}>
              <Row
                label={voice.backup.estate.exportItem}
                blurb={voice.settings.exportBlurb}
                onClick={exportEstate}
              />
              <Divider />
              <Row
                label={voice.backup.estate.importItem}
                blurb={voice.backup.estate.importBlurb}
                onClick={() => setEstateOpen(true)}
              />
            </Section>

            <Section title={voice.settings.groupLegal}>
              <LinkRow label={voice.settings.termsLabel} blurb={voice.settings.termsBlurb} href="/terms" />
              <Divider />
              <LinkRow
                label={voice.settings.privacyLabel}
                blurb={voice.settings.privacyBlurb}
                href="/privacy"
              />
              <Divider />
              <AnalyticsToggle />
            </Section>

            {/* THE NIGHT sits directly above THE GROUNDS on purpose: the one
                switch in it that changes another wing's numbers changes THAT
                wing's, and a reader who has just turned the coupling on should
                be looking at the section it acts on. */}
            <Section title={voice.night.settings.group}>
              <NightTarget />
              <Divider />
              <SleepCouplingToggle />
              <Divider />
              <MorningPromptToggle />
            </Section>

            <Section title={voice.settings.groupGrounds}>
              <Row
                label={voice.settings.profileLabel}
                blurb={voice.settings.profileBlurb}
                onClick={() => setProfileOpen(true)}
              />
              <Divider />
              <Row
                label={voice.settings.exportWorkouts}
                blurb={voice.settings.exportWorkoutsBlurb}
                onClick={exportWorkoutsFile}
              />
              <Divider />
              <Row
                label={copied ? voice.settings.copied : voice.settings.copyWorkouts}
                onClick={() => void copyJson()}
              />
              <Divider />
              <Row label={voice.settings.importWorkouts} onClick={() => setImportOpen(true)} />
              <Divider />
              <Row
                danger
                label={voice.settings.clearWorkouts}
                onClick={() => setConfirmClear(true)}
              />
            </Section>
          </div>
        </div>
      </div>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} onImport={replaceAll} />
      <EstateImportSheet open={estateOpen} onClose={() => setEstateOpen(false)} />
      <CalendarsSheet open={calendarsOpen} onClose={() => setCalendarsOpen(false)} />

      <ConfirmDialog
        open={confirmClear}
        title={voice.settings.clearWorkoutsTitle}
        message={
          // signed in, this is no longer a local act — say so
          authStatus === 'signedIn'
            ? voice.settings.clearWorkoutsBodySynced(workouts.length)
            : voice.settings.clearWorkoutsBody(workouts.length)
        }
        confirmLabel={voice.settings.clearWorkoutsYes}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false)
          clearAll()
        }}
      />
    </>
  )
}

/* --------------------------------------------------------------- furniture */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel px-4 py-3.5 sm:px-5">
      <div className="card-title">{title}</div>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function Divider() {
  return <div className="my-1 h-px bg-line" />
}

/** a statement, not a control — for a door that is shut on purpose */
function Note({ children }: { children: ReactNode }) {
  return <p className="py-1 text-[12.5px] leading-snug text-ink-faint">{children}</p>
}

/**
 * One setting. The blurb is the whole reason this screen exists: a row reading
 * "Export workouts only" beside "Export the estate" is two identical-sounding
 * doors, and the difference only becomes visible when each says what it does.
 */
function Row({
  label,
  blurb,
  onClick,
  danger,
}: {
  label: string
  blurb?: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-11 w-full items-center gap-3 py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13.5px] transition-colors ${
            danger ? 'text-danger' : 'text-ink group-hover:text-accent'
          }`}
        >
          {label}
        </span>
        {blurb && (
          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">{blurb}</span>
        )}
      </span>
      <span
        aria-hidden
        className={`flex-none transition-colors ${
          danger ? 'text-danger/60' : 'text-ink-faint group-hover:text-accent'
        }`}
      >
        <ChevronIcon />
      </span>
    </button>
  )
}

function Toggle({
  label,
  blurb,
  on,
  onChange,
}: {
  label: string
  blurb?: string
  on: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex min-h-11 w-full items-center gap-3 py-2 text-left"
    >
      {/* label and blurb share the left column, exactly as in Row — a blurb
          under a 44px tap target reads as a stray line, not as its caption */}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-ink">{label}</span>
        {blurb && (
          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">{blurb}</span>
        )}
      </span>
      <Switch on={on} />
    </button>
  )
}

/** the switch itself, borrowed by anything that needs one without a Toggle's
 *  label column (the wing rows carry their own) */
function Switch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className="relative h-5 w-9 flex-none rounded-pill border transition-colors"
      style={{
        borderColor: on ? 'var(--color-accent)' : 'var(--color-line)',
        background: on
          ? 'color-mix(in srgb, var(--color-accent) 22%, transparent)'
          : 'var(--color-panel-2)',
      }}
    >
      <span
        className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-[left]"
        style={{
          left: on ? 'calc(100% - 17px)' : '3px',
          background: on ? 'var(--color-accent)' : 'var(--color-ink-faint)',
        }}
      />
    </span>
  )
}

/* ------------------------------------------------------------------ wings */

/**
 * The navigation, made editable: every wing in the house, in the order both
 * navs read, each with a switch and a pair of nudges.
 *
 * Hidden wings stay IN this list rather than moving to a second one. A wing
 * that is off is not gone — it keeps its records and its place in the running
 * order — and shunting it to the bottom of the page would lose exactly the
 * fact the reader needs to see: where it comes back to when it is switched on
 * again.
 */
function WingList() {
  const { all, visible } = useWings()
  const off = useShellStore((s) => s.wingsOff)
  const setOff = useShellStore((s) => s.setWingOff)

  return (
    <div className="py-1">
      <p className="text-[11.5px] leading-snug text-ink-faint">{voice.settings.wingsBlurb}</p>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-faint">
        {voice.settings.wingsBarNote}
      </p>

      <ul className="mt-2.5 flex flex-col">
        {all.map((w, i) => {
          const hidden = off.includes(w.id)
          return (
            <li key={w.id} className="flex min-h-11 items-center gap-1 py-1">
              <span
                className={`min-w-0 flex-1 truncate font-display text-[12.5px] font-semibold uppercase tracking-[0.14em] ${
                  hidden ? 'text-ink-faint line-through' : 'text-ink'
                }`}
              >
                {w.name}
              </span>

              <Nudge
                label={voice.settings.wingUp(w.name)}
                dir={-1}
                disabled={i === 0}
                onClick={() => nudgeWing(w.id, -1)}
              />
              <Nudge
                label={voice.settings.wingDown(w.name)}
                dir={1}
                disabled={i === all.length - 1}
                onClick={() => nudgeWing(w.id, 1)}
              />

              <button
                type="button"
                role="switch"
                aria-checked={!hidden}
                aria-label={
                  hidden ? voice.settings.wingShow(w.name) : voice.settings.wingHide(w.name)
                }
                onClick={() => setOff(w.id, !hidden)}
                className="ml-2 flex h-11 flex-none items-center pl-1"
              >
                <Switch on={!hidden} />
              </button>
            </li>
          )
        })}
      </ul>

      {visible.length === 0 && (
        <p className="mt-1.5 text-[11.5px] leading-snug text-ink-faint">
          {voice.settings.wingsAllOff}
        </p>
      )}
    </div>
  )
}

function Nudge({
  label,
  dir,
  disabled,
  onClick,
}: {
  label: string
  dir: -1 | 1
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 flex-none items-center justify-center rounded-md border border-line transition-colors ${
        disabled ? 'text-ink-faint/40' : 'text-ink-dim hover:border-accent/40 hover:text-accent'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d={dir === -1 ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/**
 * A Row that is a link, because these targets are PAGES (/terms, /privacy),
 * not sheets — a real anchor gives the browser its own affordances (new tab,
 * copy address) that a button faking a navigation would take away. Same
 * classes as Row so the two read as one list.
 */
function LinkRow({ label, blurb, href }: { label: string; blurb?: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="group flex min-h-11 w-full items-center gap-3 py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] text-ink transition-colors group-hover:text-accent">
          {label}
        </span>
        {blurb && (
          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">{blurb}</span>
        )}
      </span>
      <span aria-hidden className="flex-none text-ink-faint transition-colors group-hover:text-accent">
        <ChevronIcon />
      </span>
    </a>
  )
}

/** the usage-analytics switch. Turning it OFF goes through disableTelemetry —
 *  one last `telemetry_off`, a flush, then silence; turning it back on is just
 *  the flag, and counting resumes on the next action. */
function AnalyticsToggle() {
  const off = useShellStore((s) => s.telemetryOff)
  const setOff = useShellStore((s) => s.setTelemetryOff)
  return (
    <Toggle
      label={voice.settings.analyticsToggle}
      blurb={voice.settings.analyticsBlurb}
      on={!off}
      onChange={(next) => {
        if (next) setOff(false)
        else disableTelemetry()
      }}
    />
  )
}

/* ------------------------------------------------------------- appearance */

/* ------------------------------------------------------------- the night */

/**
 * Hours a night, as a stepper rather than a slider: it is a number people know
 * about themselves ("eight", "seven and a half"), not one they hunt for by
 * feel. Zero is a real answer and says so — it takes the target line off every
 * chart and stops the ledger keeping score at all, which is the honest setting
 * for someone who wants the hours recorded and does not want to be marked
 * against them.
 */
function NightTarget() {
  const targetH = useSleepStore((s) => s.targetH)
  const setTarget = useSleepStore((s) => s.setTarget)
  const V = voice.night.settings
  return (
    <div className="py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] text-ink">{V.targetLabel}</span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-faint">
            {V.targetBlurb}
          </span>
        </span>
        <span className="flex flex-none items-center gap-1.5">
          <button
            type="button"
            aria-label={`${V.targetLabel} down`}
            onClick={() => setTarget(Math.max(0, targetH - 0.5))}
            className="card flex h-9 w-9 items-center justify-center text-[15px] leading-none transition-colors hover:border-accent"
          >
            −
          </button>
          <span className="stat-num w-[64px] text-center text-[14px] text-ink">
            {targetH > 0 ? `${targetH} h` : V.targetNone}
          </span>
          <button
            type="button"
            aria-label={`${V.targetLabel} up`}
            onClick={() => setTarget(Math.min(14, targetH + 0.5))}
            className="card flex h-9 w-9 items-center justify-center text-[15px] leading-none transition-colors hover:border-accent"
          >
            +
          </button>
        </span>
      </div>
    </div>
  )
}

function SleepCouplingToggle() {
  const on = useSleepStore((s) => s.coupling)
  const set = useSleepStore((s) => s.setCoupling)
  return (
    <Toggle
      label={voice.night.settings.couplingLabel}
      blurb={voice.night.settings.couplingBlurb}
      on={on}
      onChange={set}
    />
  )
}

function MorningPromptToggle() {
  const on = useSleepStore((s) => s.morningPrompt)
  const set = useSleepStore((s) => s.setMorningPrompt)
  return (
    <Toggle
      label={voice.night.settings.promptLabel}
      blurb={voice.night.settings.promptBlurb}
      on={on}
      onChange={set}
    />
  )
}

/* -------------------------------------------------------------- guidance */

function PanelTipsToggle() {
  const on = useShellStore((s) => s.panelTips)
  const set = useShellStore((s) => s.setPanelTips)
  return (
    <Toggle
      label={voice.hints.settingsToggle}
      blurb={voice.hints.settingsBlurb}
      on={on}
      onChange={set}
    />
  )
}

/**
 * The skins, inline. They used to sit behind a row that opened a sheet ON TOP
 * of a dropdown — two layers deep to change a colour you can only judge by
 * looking at the app behind them. Here they apply on tap with the page itself
 * repainting underneath.
 */
function ThemePicker() {
  const skin = useShellStore((s) => s.skin)
  const setSkin = useShellStore((s) => s.setSkin)

  return (
    <div className="py-1">
      <div className="text-[13.5px] text-ink">{voice.settings.themeLabel}</div>
      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">{voice.skinPickerBlurb}</p>
      <div className="mt-2.5 flex flex-col gap-1.5" role="radiogroup" aria-label={voice.settings.themeLabel}>
        {SKIN_IDS.map((id) => {
          const s = SKINS[id]
          const active = id === skin
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSkin(id)}
              className={`card flex items-center gap-3 p-2.5 text-left transition-colors ${
                active ? 'border-accent bg-accent/10' : 'hover:border-accent/40'
              }`}
            >
              {/* swatch strip: bg / panel / accent / ink */}
              <span
                className="flex h-8 w-12 shrink-0 overflow-hidden rounded-md border border-line"
                aria-hidden
              >
                {s.swatches.map((c, i) => (
                  <span key={i} className="h-full flex-1" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0">
                <span
                  className={`block font-display text-[13px] font-bold uppercase tracking-[0.1em] ${
                    active ? 'text-accent' : 'text-ink'
                  }`}
                >
                  {s.name}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] text-ink-dim">
                  {s.tagline}
                </span>
              </span>
              {active && (
                <span className="ml-auto shrink-0 text-accent" aria-hidden>
                  <CheckIcon />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WeekStart() {
  const weekStart = useShellStore((s) => s.weekStart)
  const setWeekStart = useShellStore((s) => s.setWeekStart)
  return (
    <div className="py-1">
      <div className="text-[13.5px] text-ink">{voice.settings.weekStartLabel}</div>
      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
        {voice.settings.weekStartBlurb}
      </p>
      <div className="mt-2 flex gap-1.5">
        {(
          [
            [0, voice.settings.weekSun],
            [1, voice.settings.weekMon],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setWeekStart(v)}
            className={`min-h-11 flex-1 rounded-pill border px-3 py-2 text-[12.5px] transition-colors ${
              weekStart === v
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line text-ink-dim hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- sheets */

function ImportSheet({
  open,
  onClose,
  onImport,
}: {
  open: boolean
  onClose: () => void
  onImport: (workouts: Workout[]) => void
}) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = text.trim() ? parseImport(text) : null

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setText(String(reader.result ?? ''))
      setError(null)
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
    e.target.value = ''
  }

  const doImport = () => {
    if (!parsed || !parsed.ok) return
    onImport(parsed.workouts)
    setText('')
    setError(null)
    onClose()
  }

  const close = () => {
    setText('')
    setError(null)
    onClose()
  }

  return (
    <Sheet open={open} onClose={close}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">Import backup</h2>
      <p className="mb-4 text-sm text-ink-dim">
        Pick an exported file or paste its JSON. This <span className="text-ink">replaces</span>{' '}
        everything currently stored on this device.
      </p>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="btn-soft w-full py-3 text-sm"
      >
        Choose backup file
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFile}
      />

      <div className="my-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] text-ink-faint">
        <div className="h-px flex-1 bg-line" />
        or paste
        <div className="h-px flex-1 bg-line" />
      </div>

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
        placeholder='{"app":"majordomo-training", …}'
        rows={5}
        className="card w-full resize-none p-3 font-mono text-xs text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
      />

      {(error || (parsed && !parsed.ok)) && (
        <p className="mt-2 text-sm text-danger">
          {error ?? (parsed && !parsed.ok ? parsed.error : '')}
        </p>
      )}
      {parsed?.ok && (
        <p className="mt-2 text-sm text-ink-dim">
          Found <span className="font-semibold text-accent">{parsed.workouts.length}</span> workout
          {parsed.workouts.length === 1 ? '' : 's'} — ready to import.
        </p>
      )}

      <button
        type="button"
        disabled={!parsed?.ok}
        onClick={doImport}
        className="btn-cta mt-4 w-full py-3 text-base disabled:opacity-30"
      >
        Replace &amp; Import
      </button>
    </Sheet>
  )
}

/**
 * The estate import — the whole household from one file. The blobs land
 * verbatim and the app reloads: the stores rehydrated long ago, so only a
 * fresh boot can be trusted to read the new estate.
 */
function EstateImportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ file: EstateFile; preview: EstatePreview } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const parsed = parseEstate(String(reader.result ?? ''))
      if (!parsed.ok) {
        setError(parsed.error)
        setPending(null)
        return
      }
      setError(null)
      setPending({ file: parsed.file, preview: parsed.preview })
    }
    reader.onerror = () => setError('Could not read that file.')
    reader.readAsText(file)
    e.target.value = ''
  }

  const close = () => {
    setError(null)
    setPending(null)
    onClose()
  }

  const stores = pending?.preview.keys.map((k) => STORE_LABEL[k] ?? k) ?? []

  return (
    <>
      <Sheet open={open} onClose={close}>
        <h2 className="mb-1 font-display text-xl font-bold tracking-wide">
          {voice.backup.estate.importTitle}
        </h2>
        <p className="mb-4 text-sm text-ink-dim">{voice.backup.estate.importBlurb}</p>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-soft w-full py-3 text-sm"
        >
          {voice.backup.estate.chooseFile}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleFile}
        />

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {pending && (
          <div className="mt-4">
            <div className="text-[10px] tracking-[0.2em] text-ink-faint">
              {voice.backup.estate.carries}
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              {pending.preview.keys.map((k) => (
                <div key={k} className="card flex items-center gap-2.5 px-3.5 py-2 text-[13px]">
                  <span
                    className="h-1.5 w-1.5 flex-none rounded-full"
                    style={{ background: 'var(--color-accent)' }}
                  />
                  {STORE_LABEL[k] ?? k}
                </div>
              ))}
            </div>
            {pending.preview.exportedAt && (
              <div className="mt-2 text-[11px] italic text-ink-dim">
                {voice.backup.estate.takenOn(new Date(pending.preview.exportedAt).toLocaleString())}
              </div>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={pending !== null && open}
        title={voice.backup.estate.confirmTitle}
        message={voice.backup.estate.confirmBody(stores.join(', '))}
        confirmLabel={voice.backup.estate.confirmYes}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return
          applyEstate(pending.file)
          // the stores read localStorage once, at module load — only a reload
          // reflects the new estate
          window.location.reload()
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------ icons */

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
