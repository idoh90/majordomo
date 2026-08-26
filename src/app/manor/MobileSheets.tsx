import { useEffect, useMemo, useState } from 'react'
import type { CalendarEvent, EventKind } from '../../core/events/types'
import { hoursOf, isAbroad } from '../../core/events/lib'
import { localDayKey } from '../../core/dates'
import { useNavStore } from '../../core/store/nav'
import { Sheet } from '../../core/ui/Sheet'
import { voice } from '../../core/voice'
import { useWorkshopStore } from '../../modules/workshop/store'
import { BenchForm, CustomEventForm, Stepper, TitleField, type QuickAddPick } from './fields'
import { KIND_META, eventMeta, hhmm } from './kinds'
import { isPencilledNight } from '../../core/sleep/lib'
import { useManorUi } from './uiStore'
import type { NearWatch } from './nearWatch'

/**
 * The Manor's mobile bottom sheets (the design's thumb-zone surfaces).
 * Desktop keeps its in-grid popovers; below md these take over. Mounted only
 * on mobile (useIsMobile in WeekGrid) so the Sheet scroll-lock never fires
 * for a desktop popover.
 */

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/** which wing opens an event of this kind, and the view id to request */
const OPEN_IN: Partial<Record<EventKind, { view: string; name: () => string }>> = {
  shift: { view: 'watch', name: () => voice.modules.watch.name },
  training: { view: 'training', name: () => voice.modules.training.name },
  study: { view: 'study', name: () => voice.modules.study.name },
}

/* ------------------------------------------------------------- quick add */

export function MobileQuickAddSheet({
  open,
  when,
  fits,
  onPick,
  onClose,
}: {
  open: boolean
  when: Date | null
  /** would a block of `hours` fit the tapped slot? */
  fits: (hours: number) => boolean
  onPick: (tpl: QuickAddPick) => void
  onClose: () => void
}) {
  const [screen, setScreen] = useState<'templates' | 'custom' | 'bench'>('templates')
  // the shelf, minus what is finished — you do not book hours against a
  // venture you have already shipped. Filtered in a memo, NOT in the selector:
  // a selector returning a fresh array is a new snapshot on every render, and
  // zustand's store subscription then re-renders forever.
  const allVentures = useWorkshopStore((s) => s.ventures)
  const ventures = useMemo(
    () => allVentures.filter((v) => !v.archived && v.status !== 'shipped'),
    [allVentures],
  )
  // each opening starts on the fast path, whatever the last one ended on
  useEffect(() => {
    if (open) setScreen('templates')
  }, [open])
  const free = fits(0.5)
  return (
    <Sheet open={open} onClose={onClose}>
      {when && (
        <div className="pb-1">
          <div className="flex items-baseline gap-2.5 pt-1">
            <span className="font-display text-xs font-semibold tracking-[0.24em] text-ink-dim">
              {voice.manor.quickAddTitle}
            </span>
            <span className="text-[13px] font-bold [font-variant-numeric:tabular-nums]">
              {WD[when.getDay()]} {when.getDate()} · {hhmm(when)}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto p-1 text-[14px] text-ink-dim transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
          {screen === 'custom' ? (
            <CustomEventForm fits={fits} onBook={onPick} onBack={() => setScreen('templates')} />
          ) : screen === 'bench' ? (
            <BenchForm
              ventures={ventures}
              fits={fits}
              onBook={onPick}
              onBack={() => setScreen('templates')}
            />
          ) : (
            <>
              <div className="mt-2.5 flex flex-col gap-1.5">
                {voice.manor.templates.map((tpl) => {
                  const meta = KIND_META[tpl.kind]
                  // fit-checked against its own hours — see the desktop popover
                  const room = fits(tpl.hours)
                  return (
                    <button
                      key={tpl.title}
                      type="button"
                      disabled={!room}
                      onClick={() => onPick(tpl)}
                      className="card flex h-[46px] w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-semibold transition-colors disabled:opacity-40"
                    >
                      <span
                        className="h-2 w-2 flex-none rounded-full"
                        style={{ background: meta.color }}
                      />
                      {tpl.title}
                      <span className="ml-auto text-[11px] font-normal text-ink-dim [font-variant-numeric:tabular-nums]">
                        {room ? `${tpl.hours.toFixed(1)} h` : voice.manor.custom.wontFit}
                      </span>
                    </button>
                  )
                })}
                {ventures.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setScreen('bench')}
                    className="card flex h-[46px] w-full items-center gap-2.5 px-3.5 text-left text-[13px] font-semibold transition-colors"
                  >
                    <span
                      className="h-2 w-2 flex-none rounded-full"
                      style={{ background: 'var(--color-w-workshop)' }}
                    />
                    {voice.manor.bench.row}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setScreen('custom')}
                  className="card flex h-[46px] w-full items-center gap-2.5 border-dashed px-3.5 text-left text-[13px] font-semibold text-ink-dim transition-colors"
                >
                  {voice.manor.custom.row}
                </button>
              </div>
              <div
                className="mt-2.5 text-[11px] italic"
                style={{ color: free ? 'var(--color-ink-dim)' : 'var(--color-danger)' }}
              >
                {free ? voice.manor.slotClear : voice.manor.occupied}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

/* ----------------------------------------------------------- event sheet */

export function MobileEventSheet({
  open,
  event,
  hotNames,
  near,
  onClose,
  onDelete,
  onMove,
  onEdit,
}: {
  open: boolean
  event: CalendarEvent | null
  /** muscles still hot on this event's day (training events only) */
  hotNames: string[]
  near: NearWatch | null
  onClose: () => void
  onDelete: () => void
  onMove: () => void
  onEdit: () => void
}) {
  const e = event
  const meta = e ? eventMeta(e) : null
  const openIn = e ? OPEN_IN[e.kind] : undefined
  // a mirror from an external calendar: shown in full, handled not at all —
  // REMOVE/MOVE/Edit give way to one provenance line
  const locked = e ? isAbroad(e) : false
  return (
    <Sheet open={open} onClose={onClose}>
      {e && meta && (
        <div className="relative pb-1">
          {/* the kind's accent on the sheet's left edge */}
          <span
            aria-hidden
            className="absolute -left-5 bottom-0 top-0 w-[3px] rounded-full"
            style={{ background: meta.color }}
          />
          <div className="flex items-center gap-2.5 pt-1">
            <span className="h-2 w-2 flex-none rounded-full" style={{ background: meta.color }} />
            <span className="text-[15px] font-bold">{e.title}</span>
            {!locked && (
              <button
                type="button"
                onClick={onDelete}
                className="ml-auto p-1 text-[10px] font-semibold tracking-[0.16em] text-danger transition-colors hover:brightness-125"
              >
                {voice.manor.removeLabel.toUpperCase()}
              </button>
            )}
          </div>
          <EventTimeLine e={e} />
          <div className="mt-2 flex items-center gap-2">
            <span
              className="chip px-2.5 py-0.5 text-[9.5px] tracking-[0.12em]"
              style={{
                color: meta.color,
                border: `1px solid color-mix(in srgb, ${meta.color} 50%, transparent)`,
              }}
            >
              {meta.label}
            </span>
            <span className="text-[11px] text-ink-dim [font-variant-numeric:tabular-nums]">
              {hoursOf(e).toFixed(1)} h
            </span>
          </div>
          {e.kind === 'training' && hotNames.length > 0 && (
            <div className="mt-2.5 text-[11.5px]" style={{ color: 'var(--color-w-grounds)' }}>
              {voice.manor.strain.tooltip({ names: hotNames, forecast: false })}
            </div>
          )}
          {near && (
            <div className="mt-1 text-[11.5px] text-danger">
              ▲ {voice.manor.nearWatchLine(near)}
            </div>
          )}
          {locked ? (
            <div className="mt-3 text-[11.5px] italic leading-relaxed text-ink-dim">
              {voice.calendars.abroadLine}
            </div>
          ) : (
            <>
              {/* A night's own sheet, not the generic time editor — the hours
                  are only half of it, and a pencilled block wants confirming
                  rather than correcting. It takes the primary position here
                  because on a phone this sheet IS the popover, and MOVE is
                  rarely what you want with a night that already happened. */}
              {e.kind === 'sleep' && (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    useManorUi.getState().requestNight(localDayKey(e.end))
                  }}
                  className="btn-cta mt-3.5 h-12 w-full font-display text-[13.5px] font-semibold tracking-[0.18em]"
                  style={{
                    background: 'var(--color-w-sleep)',
                    color: 'var(--color-bg)',
                    boxShadow: 'none',
                  }}
                >
                  ☾ {isPencilledNight(e) ? voice.night.prompt.pencilCta : voice.night.openLabel}
                </button>
              )}
              <button
                type="button"
                onClick={onMove}
                className={`${e.kind === 'sleep' ? 'card mt-2 h-11' : 'btn-cta mt-3.5 h-12'} w-full font-display text-[13.5px] font-semibold tracking-[0.18em]`}
              >
                {voice.manor.eventSheet.move}
              </button>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onEdit}
                  className="card h-11 flex-1 px-3 text-[12.5px] transition-colors hover:border-accent"
                >
                  {voice.manor.eventSheet.edit}
                </button>
                {openIn && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      useNavStore.getState().requestView(openIn.view)
                    }}
                    className="card h-11 flex-[1.5] px-3 text-[12.5px] transition-colors hover:border-accent"
                  >
                    {voice.manor.eventSheet.openIn(openIn.name())}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}

function EventTimeLine({ e }: { e: CalendarEvent }) {
  const s = new Date(e.start)
  const en = new Date(e.end)
  const cross = localDayKey(s) !== localDayKey(en)
  return (
    <>
      <div className="mt-1.5 text-[12.5px] [font-variant-numeric:tabular-nums]">
        {cross
          ? `${WD[s.getDay()]} ${s.getDate()} · ${hhmm(s)} → ${WD[en.getDay()]} ${hhmm(en)}`
          : `${WD[s.getDay()]} ${s.getDate()} · ${hhmm(s)} → ${hhmm(en)}`}
      </div>
      {cross && (
        <div className="mt-0.5 text-[11px] italic text-ink-dim">{voice.manor.crossesMidnight}</div>
      )}
    </>
  )
}

/* ------------------------------------------------------------ edit sheet */

/** The event editor. Named without "Mobile" because it is BOTH platforms' —
 *  Sheet renders a bottom sheet below md and a centered modal above it, so the
 *  desktop popover's Edit action opens this same clash-checked pipeline rather
 *  than a second implementation of it. */
export function EventEditSheet({
  open,
  event,
  onSave,
  onClose,
}: {
  open: boolean
  event: CalendarEvent | null
  /** returns false when the corrected slot is occupied (sheet stays open) */
  onSave: (id: string, title: string, start: Date, durH: number) => boolean
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [startMin, setStartMin] = useState(0) // minutes since the event day's midnight
  const [durH, setDurH] = useState(1)

  // seed the form each time a different event opens
  useEffect(() => {
    if (!open || !event) return
    const s = new Date(event.start)
    setTitle(event.title)
    setStartMin(s.getHours() * 60 + s.getMinutes())
    setDurH(hoursOf(event))
  }, [open, event])

  if (!event) return <Sheet open={false} onClose={onClose}>{null}</Sheet>

  const day = new Date(event.start)
  const startDate = new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    Math.floor(startMin / 60),
    startMin % 60,
  )

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="pb-1">
        <div className="pt-1 font-display text-xs font-semibold tracking-[0.24em] text-ink-dim">
          {voice.manor.eventSheet.editTitle}
        </div>
        <TitleField value={title} onChange={setTitle} />
        <Stepper
          label={voice.manor.eventSheet.startLabel}
          value={`${WD[startDate.getDay()]} ${startDate.getDate()} · ${hhmm(startDate)}`}
          onDec={() => setStartMin((m) => Math.max(0, m - 30))}
          onInc={() => setStartMin((m) => Math.min(23.5 * 60, m + 30))}
        />
        <Stepper
          label={voice.manor.eventSheet.durationLabel}
          // live end readout: hhmm of the computed end, so a block that runs
          // past midnight says so instead of looking like it was truncated
          value={`${durH.toFixed(1)} h · → ${hhmm(new Date(startDate.getTime() + durH * 3_600_000))}`}
          onDec={() => setDurH((d) => Math.max(0.5, d - 0.5))}
          onInc={() => setDurH((d) => Math.min(24, d + 0.5))}
        />
        <button
          type="button"
          disabled={title.trim() === ''}
          onClick={() => {
            if (onSave(event.id, title.trim(), startDate, durH)) onClose()
          }}
          className="btn-cta mt-4 h-12 w-full font-display text-[13.5px] font-semibold tracking-[0.18em] disabled:opacity-40"
        >
          {voice.manor.eventSheet.save}
        </button>
      </div>
    </Sheet>
  )
}

