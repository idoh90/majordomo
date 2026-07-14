import { useRef, useState, type ChangeEvent } from 'react'
import type { Workout } from '../modules/training/types'
import { downloadJson, parseImport, serializeExport } from '../modules/training/lib/backup'
import { localDayKey } from '../core/dates'
import { SKINS, SKIN_IDS } from '../core/ui/skins'
import { voice } from '../core/voice'
import { useShellStore } from '../core/store/shell'
import { useWorkoutStore } from '../modules/training/store'
import { ConfirmDialog } from '../core/ui/ConfirmDialog'
import { ProfileSheet } from '../modules/training/components/ProfileSheet'
import { Sheet } from '../core/ui/Sheet'

export function SettingsMenu() {
  const workouts = useWorkoutStore((s) => s.workouts)
  const weekStart = useShellStore((s) => s.weekStart)
  const setWeekStart = useShellStore((s) => s.setWeekStart)
  const ambient = useShellStore((s) => s.ambient)
  const setAmbient = useShellStore((s) => s.setAmbient)
  const replaceAll = useWorkoutStore((s) => s.replaceAll)
  const clearAll = useWorkoutStore((s) => s.clearAll)

  const [menuOpen, setMenuOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  // ?sheet=skin — dev screenshot aid, same family as ?sheet=add/effort/when
  const [skinOpen, setSkinOpen] = useState(
    () =>
      import.meta.env.DEV && new URLSearchParams(window.location.search).get('sheet') === 'skin',
  )
  const [importOpen, setImportOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [copied, setCopied] = useState(false)

  const exportFile = () => {
    downloadJson(`majordomo-training-${localDayKey(new Date())}.json`, serializeExport(workouts))
    setMenuOpen(false)
  }

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(serializeExport(workouts))
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
        setMenuOpen(false)
      }, 900)
    } catch {
      // clipboard unavailable — fall back to download
      exportFile()
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Settings"
        onClick={() => setMenuOpen((v) => !v)}
        className="chip border border-line bg-panel p-2.5 text-ink-dim transition-colors hover:text-ink"
      >
        <GearIcon />
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-30" onPointerDown={() => setMenuOpen(false)} />
          <div className="menu-panel absolute right-0 top-12 z-40 w-52 animate-[step-in_140ms_ease-out] overflow-hidden">
            <MenuItem
              onClick={() => {
                setMenuOpen(false)
                setProfileOpen(true)
              }}
            >
              Profile &amp; nutrition
            </MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false)
                setSkinOpen(true)
              }}
            >
              App skin…
            </MenuItem>
            <div className="border-t border-line" />
            <div className="px-3.5 py-2.5">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Week starts
              </div>
              <div className="flex gap-1">
                {([[0, 'Sun'], [1, 'Mon']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setWeekStart(v)}
                    className={`flex-1 rounded-pill border px-2 py-1 text-xs transition-colors ${
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
            <div className="px-3.5 py-2.5">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                Ambient motion
              </div>
              <div className="flex gap-1">
                {([[true, 'On'], [false, 'Off']] as const).map(([v, label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setAmbient(v)}
                    className={`flex-1 rounded-pill border px-2 py-1 text-xs transition-colors ${
                      ambient === v
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-line text-ink-dim hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-line" />
            <MenuItem onClick={exportFile}>Export backup file</MenuItem>
            <MenuItem onClick={copyJson}>{copied ? 'Copied ✓' : 'Copy backup JSON'}</MenuItem>
            <MenuItem
              onClick={() => {
                setMenuOpen(false)
                setImportOpen(true)
              }}
            >
              Import backup…
            </MenuItem>
            <div className="border-t border-line" />
            <MenuItem
              danger
              onClick={() => {
                setMenuOpen(false)
                setConfirmClear(true)
              }}
            >
              Clear all data
            </MenuItem>
          </div>
        </>
      )}

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />

      <SkinSheet open={skinOpen} onClose={() => setSkinOpen(false)} />

      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} onImport={replaceAll} />

      <ConfirmDialog
        open={confirmClear}
        title="Clear all data?"
        message={`This deletes all ${workouts.length} workout${workouts.length === 1 ? '' : 's'} stored on this device. Export a backup first if you want to keep them.`}
        confirmLabel="Clear all"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false)
          clearAll()
        }}
      />
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`block w-full px-3.5 py-2.5 text-left text-sm hover:bg-panel-2 ${
        danger ? 'text-danger' : 'text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** Skin picker — all five design directions, applied live on tap. */
function SkinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const skin = useShellStore((s) => s.skin)
  const setSkin = useShellStore((s) => s.setSkin)

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">App skin</h2>
      <p className="mb-4 text-sm text-ink-dim">{voice.skinPickerBlurb}</p>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="App skin">
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
              className={`card flex items-center gap-3 p-3 text-left transition-colors ${
                active ? 'border-accent bg-accent/10' : 'hover:border-accent/40'
              }`}
            >
              {/* swatch strip: bg / panel / accent / ink */}
              <span
                className="flex h-9 w-14 shrink-0 overflow-hidden rounded-md border border-line"
                aria-hidden
              >
                {s.swatches.map((c, i) => (
                  <span key={i} className="h-full flex-1" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0">
                <span
                  className={`block font-display text-sm font-bold uppercase tracking-[0.1em] ${
                    active ? 'text-accent' : 'text-ink'
                  }`}
                >
                  {s.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-dim">{s.tagline}</span>
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
      <button type="button" onClick={onClose} className="btn-cta mt-4 w-full py-3 text-sm">
        Done
      </button>
    </Sheet>
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
        <p className="mt-2 text-sm text-danger">{error ?? (parsed && !parsed.ok ? parsed.error : '')}</p>
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

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
