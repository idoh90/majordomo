import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { Sheet } from '../../core/ui/Sheet'
import { voice } from '../../core/voice'
import { DAY_MIN, hhmmOfMin } from './lib'
import { useWatchStore } from './store'
import type { ShiftTemplate } from './types'

/* ------------------------------------------------------------------ shape */

interface Shape {
  startMin: number
  endMin: number
}

/** 'HH:MM' → minutes since midnight; null when the browser hands back '' */
function parseHHMM(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * The end the user meant. A watch typed as 21:00 → 05:00 ends tomorrow, and
 * that is the ONLY reading of an end at or before the start — so the wrap is
 * applied here and stated out loud in the form, never left to be discovered
 * on the calendar.
 */
function resolveEnd(startMin: number, endRaw: number): number {
  return endRaw > startMin ? endRaw : endRaw + DAY_MIN
}

const shapeHours = (s: Shape) => (s.endMin - s.startMin) / 60

/* ------------------------------------------------------------------ fields */

function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 mt-4 block font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
      {children}
    </span>
  )
}

/**
 * The two clocks, shared by a custom post and the shape list.
 *
 * Native time inputs rather than the Manor's steppers: a stepper nudges a
 * value that already exists, and typing 21:00 from a 09:00 default is
 * twenty-four taps. `color-scheme` is left to the skin — the light bundles
 * declare it, and hard-coding dark here would black out the picker on paper.
 */
function ShapeFields({
  startRaw,
  endRaw,
  onStart,
  onEnd,
}: {
  startRaw: string
  endRaw: string
  onStart: (v: string) => void
  onEnd: (v: string) => void
}) {
  const start = parseHHMM(startRaw)
  const endValue = parseHHMM(endRaw)
  const shape =
    start !== null && endValue !== null && endValue !== start
      ? { startMin: start, endMin: resolveEnd(start, endValue) }
      : null

  return (
    <>
      <div className="flex gap-3">
        <label className="flex-1">
          <SheetLabel>{voice.watch.sheet.startLabel}</SheetLabel>
          <input
            type="time"
            value={startRaw}
            onChange={(e) => onStart(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 font-display text-[17px] text-ink outline-none [font-variant-numeric:tabular-nums] focus:border-accent/60"
          />
        </label>
        <label className="flex-1">
          <SheetLabel>{voice.watch.sheet.endLabel}</SheetLabel>
          <input
            type="time"
            value={endRaw}
            onChange={(e) => onEnd(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 font-display text-[17px] text-ink outline-none [font-variant-numeric:tabular-nums] focus:border-accent/60"
          />
        </label>
      </div>
      <div className="mt-2.5 min-h-[34px] text-[12.5px] text-ink-dim">
        {shape ? (
          <>
            <span className="[font-variant-numeric:tabular-nums]">
              {voice.watch.sheet.hoursLine(shapeHours(shape))}
            </span>
            {shape.endMin > DAY_MIN && (
              <span className="mt-0.5 block italic">{voice.watch.sheet.nextDay}</span>
            )}
          </>
        ) : (
          <span className="italic" style={{ color: 'var(--color-danger)' }}>
            {voice.watch.sheet.invalid}
          </span>
        )}
      </div>
    </>
  )
}

/** the shape a fields pair currently describes, or null while it is unusable */
function readShape(startRaw: string, endRaw: string): Shape | null {
  const start = parseHHMM(startRaw)
  const end = parseHHMM(endRaw)
  if (start === null || end === null || end === start) return null
  return { startMin: start, endMin: resolveEnd(start, end) }
}

function SheetActions({
  cta,
  disabled,
  onCancel,
  onSave,
}: {
  cta: string
  disabled?: boolean
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
        {voice.watch.sheet.cancel}
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={disabled}
        className="btn-cta px-5 py-2.5 text-[11px] tracking-[0.16em] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {cta}
      </button>
    </div>
  )
}

/* ------------------------------------------------------- a one-off watch */

const CUSTOM_SEED = { start: '09:00', end: '17:00' }

/**
 * Post a watch of any shape on the picked day, and keep the shape if it is
 * worth keeping. The keep box is part of the form rather than an offer made
 * afterwards: a toast with an action is a four-second window to notice.
 */
export function CustomPostSheet({
  open,
  onClose,
  dayLabel,
  onPost,
  butler,
}: {
  open: boolean
  onClose: () => void
  /** the day this watch would land on, e.g. 'THU 12' */
  dayLabel: string
  /** false when the watch was refused — the draft stays put */
  onPost: (shape: Shape, title: string) => boolean
  butler: (msg: string) => void
}) {
  const [startRaw, setStartRaw] = useState(CUSTOM_SEED.start)
  const [endRaw, setEndRaw] = useState(CUSTOM_SEED.end)
  const [keep, setKeep] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setStartRaw(CUSTOM_SEED.start)
    setEndRaw(CUSTOM_SEED.end)
    setKeep(false)
    setName('')
  }, [open])

  const shape = readShape(startRaw, endRaw)
  // a creation form has no store row to differ from, so the seed stands in
  const dirty =
    startRaw !== CUSTOM_SEED.start || endRaw !== CUSTOM_SEED.end || keep || name.trim() !== ''

  const submit = () => {
    if (!shape) return
    const trimmed = name.trim()
    if (keep && !trimmed) {
      butler(voice.watch.toast.nameFirst)
      return
    }
    // post FIRST: a refused watch must not leave a shape behind, and a typed
    // 21:00 → 05:00 must survive the refusal that sends the user back to it
    if (!onPost(shape, keep ? trimmed : voice.watch.customEventTitle)) return
    if (keep) {
      useWatchStore.getState().addTemplate({ name: trimmed, ...shape })
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} dirty={dirty}>
      <div className="flex items-baseline gap-3">
        <h2 className="card-title">{voice.watch.sheet.customTitle}</h2>
        <span className="ml-auto text-[12px] text-ink-dim [font-variant-numeric:tabular-nums]">
          {dayLabel}
        </span>
      </div>
      <ShapeFields
        startRaw={startRaw}
        endRaw={endRaw}
        onStart={setStartRaw}
        onEnd={setEndRaw}
      />

      <button
        type="button"
        onClick={() => setKeep((k) => !k)}
        aria-pressed={keep}
        className="chip mt-3 inline-flex items-center gap-2 px-3 py-2 text-[12.5px] transition-colors"
        style={{
          borderColor: keep ? 'var(--color-accent)' : undefined,
          color: keep ? 'var(--color-accent)' : undefined,
        }}
      >
        <span
          className="flex h-4 w-4 items-center justify-center rounded-[4px] border text-[10px] leading-none"
          style={{ borderColor: keep ? 'var(--color-accent)' : 'var(--color-line)' }}
        >
          {keep ? '✓' : ''}
        </span>
        {voice.watch.sheet.keep}
      </button>

      {keep && (
        <div className="animate-[fade-in_160ms_ease-out]">
          <SheetLabel>{voice.watch.sheet.nameLabel}</SheetLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={voice.watch.sheet.namePlaceholder}
            className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent/60"
          />
        </div>
      )}

      <SheetActions
        cta={voice.watch.sheet.post}
        disabled={!shape || (keep && name.trim() === '')}
        onCancel={onClose}
        onSave={submit}
      />
    </Sheet>
  )
}

/* ------------------------------------------------------------ the shapes */

/**
 * The shape list. Editing one rewrites nothing already posted — a shape is a
 * stamp, and the watches it printed are ink.
 */
export function TemplatesSheet({
  open,
  onClose,
  butler,
}: {
  open: boolean
  onClose: () => void
  butler: (msg: string) => void
}) {
  const templates = useWatchStore((s) => s.templates)
  const [editing, setEditing] = useState<ShiftTemplate | 'new' | null>(null)
  const [confirming, setConfirming] = useState<ShiftTemplate | null>(null)

  useEffect(() => {
    if (!open) {
      setEditing(null)
      setConfirming(null)
    }
  }, [open])

  return (
    <>
      <Sheet open={open && editing === null} onClose={onClose}>
        <h2 className="card-title">{voice.watch.sheet.manageTitle}</h2>
        {templates.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">{voice.watch.sheet.empty}</p>
        ) : (
          <div className="mt-2 flex flex-col">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setEditing(t)}
                  className="flex min-w-0 flex-1 items-baseline gap-3 text-left"
                >
                  <span className="truncate text-[13px] font-semibold">{t.name}</span>
                  <span className="text-[12.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
                    {hhmmOfMin(t.startMin)} → {hhmmOfMin(t.endMin)}
                  </span>
                  <span className="ml-auto font-display text-[14px] font-semibold [font-variant-numeric:tabular-nums]">
                    {((t.endMin - t.startMin) / 60).toFixed(1)} h
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(t)}
                  aria-label={`Retire ${t.name}`}
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-[8px] border border-line text-ink-dim transition-colors hover:text-ink"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="btn-soft px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.14em]"
          >
            {voice.watch.sheet.cancel}
          </button>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="btn-cta px-5 py-2.5 text-[11px] tracking-[0.16em]"
          >
            {voice.watch.sheet.newTemplate}
          </button>
        </div>
      </Sheet>

      <ShapeEditSheet
        open={open && editing !== null}
        template={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        butler={butler}
      />

      <ConfirmDialog
        open={confirming !== null}
        title={voice.watch.sheet.deleteTitle}
        message={confirming ? voice.watch.sheet.deleteBody(confirming.name) : undefined}
        confirmLabel={voice.watch.sheet.deleteYes}
        onConfirm={() => {
          if (confirming) {
            useWatchStore.getState().deleteTemplate(confirming.id)
            butler(voice.watch.toast.retired)
          }
          setConfirming(null)
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  )
}

/** add or amend one shape */
function ShapeEditSheet({
  open,
  template,
  onClose,
  butler,
}: {
  open: boolean
  /** null when adding */
  template: ShiftTemplate | null
  onClose: () => void
  butler: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [startRaw, setStartRaw] = useState(CUSTOM_SEED.start)
  const [endRaw, setEndRaw] = useState(CUSTOM_SEED.end)

  const seed = template
    ? { name: template.name, start: hhmmOfMin(template.startMin), end: hhmmOfMin(template.endMin) }
    : { name: '', start: CUSTOM_SEED.start, end: CUSTOM_SEED.end }

  useEffect(() => {
    if (!open) return
    setName(seed.name)
    setStartRaw(seed.start)
    setEndRaw(seed.end)
    // seed derives from `template`, which is in the deps; re-seeding on each
    // opening is deliberate — a stale draft must never greet the next row
  }, [open, template])

  const shape = readShape(startRaw, endRaw)
  const dirty = name !== seed.name || startRaw !== seed.start || endRaw !== seed.end

  const save = () => {
    if (!shape) return
    const trimmed = name.trim()
    if (!trimmed) {
      butler(voice.watch.toast.nameFirst)
      return
    }
    const store = useWatchStore.getState()
    if (template) {
      store.updateTemplate(template.id, { name: trimmed, ...shape })
      butler(voice.watch.toast.amended)
    } else {
      store.addTemplate({ name: trimmed, ...shape })
      butler(voice.watch.toast.kept)
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} dirty={dirty}>
      <h2 className="card-title">
        {template ? voice.watch.sheet.manageTitle : voice.watch.sheet.newTemplate}
      </h2>
      <SheetLabel>{voice.watch.sheet.nameLabel}</SheetLabel>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={voice.watch.sheet.namePlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent/60"
      />
      <ShapeFields startRaw={startRaw} endRaw={endRaw} onStart={setStartRaw} onEnd={setEndRaw} />
      <SheetActions
        cta={voice.watch.sheet.save}
        disabled={!shape || name.trim() === ''}
        onCancel={onClose}
        onSave={save}
      />
    </Sheet>
  )
}
