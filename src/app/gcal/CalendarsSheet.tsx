import { useEffect, useState } from 'react'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { Sheet } from '../../core/ui/Sheet'
import { voice } from '../../core/voice'
import { connectGoogle, disconnectGoogle, refreshGcalStatus, syncGcalNow } from './service'
import { useGcalStore } from './store'

/**
 * The Google Calendar sheet — settings → CALENDARS. One door in
 * (connect/reconnect walk the same consent flow), two taps (each direction
 * its own switch), one button for "now, please", and a disconnect that says
 * both truths before it acts: the mirrors leave the Manor, the Majordomo
 * calendar already at Google stays.
 */
export function CalendarsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connected = useGcalStore((s) => s.connected)
  const pullOn = useGcalStore((s) => s.pullOn)
  const pushOn = useGcalStore((s) => s.pushOn)
  const setPullOn = useGcalStore((s) => s.setPullOn)
  const setPushOn = useGcalStore((s) => s.setPushOn)
  const busy = useGcalStore((s) => s.busy)
  const lastError = useGcalStore((s) => s.lastError)
  const notice = useGcalStore((s) => s.notice)
  const lastSyncAt = useGcalStore((s) => s.lastSyncAt)
  const needsReconnect = useGcalStore((s) => s.needsReconnect)
  const [confirming, setConfirming] = useState(false)

  // each opening re-asks the register — another device may have connected or
  // disconnected since; offline, the cached answer stands
  useEffect(() => {
    if (open) void refreshGcalStatus()
  }, [open])

  return (
    <>
      <Sheet open={open} onClose={onClose}>
        <div className="pb-1">
          <div className="flex items-center gap-2.5 pt-1">
            <span className="font-display text-xs font-semibold tracking-[0.24em] text-ink-dim">
              {voice.calendars.sheetTitle}
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

          {connected === null ? (
            <>
              <p className="mt-2.5 text-[12.5px] leading-snug text-ink-dim">
                {voice.calendars.blurb}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void connectGoogle()}
                className="btn-cta mt-4 h-12 w-full font-display text-[13.5px] font-semibold tracking-[0.18em] disabled:opacity-40"
              >
                {busy ? voice.calendars.working : voice.calendars.connect}
              </button>
            </>
          ) : (
            <>
              <p className="mt-2.5 text-[12.5px] text-ink">
                {voice.calendars.connectedAs(connected.email ?? '—')}
              </p>

              {needsReconnect && (
                <>
                  <p className="mt-2 text-[11.5px] leading-snug text-danger">
                    {voice.calendars.reconnectNote}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void connectGoogle()}
                    className="btn-cta mt-2.5 h-11 w-full font-display text-[13px] font-semibold tracking-[0.18em] disabled:opacity-40"
                  >
                    {busy ? voice.calendars.working : voice.calendars.reconnect}
                  </button>
                </>
              )}

              <div className="mt-3">
                <SheetToggle
                  label={voice.calendars.pullToggle}
                  blurb={voice.calendars.pullBlurb}
                  on={pullOn}
                  onChange={setPullOn}
                />
                <div className="my-1 h-px bg-line" />
                <SheetToggle
                  label={voice.calendars.pushToggle}
                  blurb={voice.calendars.pushBlurb}
                  on={pushOn}
                  onChange={setPushOn}
                />
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={syncGcalNow}
                className="card mt-3 h-11 w-full px-3 text-[12.5px] transition-colors hover:border-accent disabled:opacity-40"
              >
                {busy ? voice.calendars.syncing : voice.calendars.syncNow}
              </button>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                {lastSyncAt
                  ? voice.calendars.lastSynced(new Date(lastSyncAt).toLocaleString())
                  : voice.calendars.neverSynced}
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="mt-3 flex w-full items-center justify-center rounded-lg border py-2 text-[11.5px] font-semibold tracking-[0.12em] text-danger transition-colors hover:bg-panel-2 disabled:opacity-40"
                style={{ borderColor: 'color-mix(in srgb, var(--color-danger) 40%, transparent)' }}
              >
                {voice.calendars.disconnect}
              </button>
            </>
          )}

          {notice && !lastError && (
            <p className="mt-2.5 text-[11.5px] italic text-ink-dim">{notice}</p>
          )}
          {lastError && <p className="mt-2.5 text-[11.5px] text-danger">{lastError}</p>}
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirming}
        title={voice.calendars.disconnectTitle}
        message={voice.calendars.disconnectBody}
        confirmLabel={voice.calendars.disconnectYes}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          void disconnectGoogle()
        }}
      />
    </>
  )
}

/** the settings screen's Toggle, restated for a sheet (its furniture is
 *  deliberately local to that file) */
function SheetToggle({
  label,
  blurb,
  on,
  onChange,
}: {
  label: string
  blurb: string
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
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-ink-faint">{blurb}</span>
      </span>
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
    </button>
  )
}
