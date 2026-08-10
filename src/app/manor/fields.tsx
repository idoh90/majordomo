import { useState } from 'react'
import type { EventKind } from '../../core/events/types'
import { voice } from '../../core/voice'
import { KIND_META } from './kinds'

/**
 * Form primitives shared by the Manor's editors — the event edit sheet and
 * quick-add's free-form row. Local to the Manor on purpose: core is extracted
 * on contact by a SECOND console, and no other wing books an hour yet.
 */

/** a −/value/+ row on the app's 0.5 h grid; the value is pre-formatted */
export function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string
  value: string
  onDec: () => void
  onInc: () => void
}) {
  return (
    <div className="mt-3">
      <span className="text-[10px] tracking-[0.2em] text-ink-dim">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onDec}
          className="card h-11 w-12 flex-none text-[16px] leading-none transition-colors hover:border-accent"
          aria-label={`${label} down`}
        >
          −
        </button>
        <div className="card flex h-11 flex-1 items-center justify-center text-[13.5px] font-semibold [font-variant-numeric:tabular-nums]">
          {value}
        </div>
        <button
          type="button"
          onClick={onInc}
          className="card h-11 w-12 flex-none text-[16px] leading-none transition-colors hover:border-accent"
          aria-label={`${label} up`}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** every kind a free-form block may claim, in wing order */
const KINDS: EventKind[] = ['shift', 'sleep', 'training', 'study', 'workshop', 'marker']

/**
 * What quick-add hands back. `ventureId` is the one field that changes what
 * gets WRITTEN rather than how it looks: with it the block is the Workshop's
 * (its own source and `proj:` ref, and a fulfillment record), without it the
 * block is a plain manual entry. A workshop-KIND block chosen from the custom
 * form carries no venture and lands unfiled — the wing's AWAITING REPORT queue
 * is where it gets claimed, exactly as an unfiled study block is.
 */
export interface QuickAddPick {
  kind: EventKind
  title: string
  hours: number
  ventureId?: string
}

/**
 * Quick-add's bench row: choose the venture, choose the hours. This exists
 * because the hours a venture takes are the wing's whole point, and until now
 * the only doors to them were inside the Workshop itself — so an hour you
 * planned while looking at your week had to be entered somewhere else.
 */
export function BenchForm({
  ventures,
  fits,
  onBook,
  onBack,
}: {
  ventures: { id: string; name: string }[]
  fits: (hours: number) => boolean
  onBook: (v: QuickAddPick) => void
  onBack: () => void
}) {
  const [ventureId, setVentureId] = useState(ventures[0]?.id ?? '')
  const [hours, setHours] = useState(2)
  const roomFor = fits(hours)
  const venture = ventures.find((v) => v.id === ventureId) ?? null
  const accent = 'var(--color-w-workshop)'

  return (
    <div>
      <div className="mt-3">
        <span className="text-[10px] tracking-[0.2em] text-ink-dim">
          {voice.manor.bench.ventureLabel}
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ventures.map((v) => {
            const on = v.id === ventureId
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={on}
                onClick={() => setVentureId(v.id)}
                className="chip px-2.5 py-1 text-[10px] tracking-[0.08em] transition-colors"
                style={{
                  borderColor: on ? accent : 'var(--color-line)',
                  background: on
                    ? 'color-mix(in srgb, var(--color-w-workshop) 12%, transparent)'
                    : 'transparent',
                  color: on ? 'var(--color-ink)' : 'var(--color-ink-dim)',
                }}
              >
                {v.name}
              </button>
            )
          })}
        </div>
      </div>
      <Stepper
        label={voice.manor.eventSheet.durationLabel}
        value={`${hours.toFixed(1)} h`}
        onDec={() => setHours((h) => Math.max(0.5, h - 0.5))}
        onInc={() => setHours((h) => Math.min(24, h + 0.5))}
      />
      {!roomFor && (
        <div className="mt-2 text-[11px] italic" style={{ color: 'var(--color-danger)' }}>
          {voice.manor.custom.wontFit}
        </div>
      )}
      <button
        type="button"
        disabled={!venture || !roomFor}
        onClick={() =>
          venture &&
          onBook({ kind: 'workshop', title: venture.name, hours, ventureId: venture.id })
        }
        className="btn-cta mt-3 h-11 w-full font-display text-[12.5px] font-semibold tracking-[0.18em] disabled:opacity-40"
        style={{ background: accent, color: 'var(--color-bg)', boxShadow: 'none' }}
      >
        {voice.manor.bench.book}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-2 w-full text-[11px] text-ink-dim transition-colors hover:text-ink"
      >
        {voice.manor.custom.back}
      </button>
    </div>
  )
}

/**
 * Quick-add's free-form row: a title, a kind and a duration, for the hours the
 * six templates don't cover ("Dentist · 0.5 h"). Shared by the desktop popover
 * and the mobile sheet so there is one form, not two.
 *
 * `marker` is the default because it is the model's word for a block no wing
 * owns. Its LABEL still reads "THE LEDGER" — the kind labels are wing names,
 * so none of the five is neutral. That is a chip-anatomy question for the
 * visual revamp, not something to fork the events model over here.
 */
export function CustomEventForm({
  fits,
  onBook,
  onBack,
}: {
  /** would a block of `hours` fit the chosen slot? */
  fits: (hours: number) => boolean
  onBook: (v: QuickAddPick) => void
  onBack: () => void
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<EventKind>('marker')
  const [hours, setHours] = useState(1)
  const roomFor = fits(hours)
  const ready = title.trim() !== '' && roomFor

  return (
    <div>
      <TitleField value={title} onChange={setTitle} autoFocus />
      <div className="mt-3">
        <span className="text-[10px] tracking-[0.2em] text-ink-dim">
          {voice.manor.custom.kindLabel}
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const on = kind === k
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => setKind(k)}
                className="chip flex items-center gap-1.5 px-2 py-1 text-[9.5px] tracking-[0.1em] transition-colors"
                style={{
                  borderColor: on
                    ? KIND_META[k].color
                    : 'color-mix(in srgb, var(--color-line) 100%, transparent)',
                  color: on ? KIND_META[k].color : 'var(--color-ink-dim)',
                }}
              >
                <span
                  className="h-[6px] w-[6px] flex-none rounded-full"
                  style={{ background: KIND_META[k].color, opacity: on ? 1 : 0.5 }}
                />
                {KIND_META[k].label}
              </button>
            )
          })}
        </div>
      </div>
      <Stepper
        label={voice.manor.eventSheet.durationLabel}
        value={`${hours.toFixed(1)} h`}
        onDec={() => setHours((h) => Math.max(0.5, h - 0.5))}
        onInc={() => setHours((h) => Math.min(24, h + 0.5))}
      />
      {!roomFor && (
        <div className="mt-2 text-[11px] italic" style={{ color: 'var(--color-danger)' }}>
          {voice.manor.custom.wontFit}
        </div>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={() => onBook({ kind, title: title.trim(), hours })}
        className="btn-cta mt-3 h-11 w-full font-display text-[12.5px] font-semibold tracking-[0.18em] disabled:opacity-40"
      >
        {voice.manor.custom.book}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="mt-2 w-full text-[11px] text-ink-dim transition-colors hover:text-ink"
      >
        {voice.manor.custom.back}
      </button>
    </div>
  )
}

/** the labelled title input, so every editor spells it the same way */
export function TitleField({
  value,
  onChange,
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  return (
    <label className="mt-3 block">
      <span className="text-[10px] tracking-[0.2em] text-ink-dim">
        {voice.manor.eventSheet.titleLabel}
      </span>
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(ev) => onChange(ev.target.value)}
        className="card mt-1.5 h-11 w-full px-3.5 text-[13.5px] outline-none focus:border-accent"
      />
    </label>
  )
}
