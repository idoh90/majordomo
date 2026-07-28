import { useAuthStore } from '../core/auth/store'
import { offReason } from '../core/sync/gate'
import { useSyncStore } from '../core/sync/store'
import { voice } from '../core/voice'
import { syncNow } from './sync/service'

/**
 * Carrying, as a state rather than a verb.
 *
 * A button that only says "sync" tells you nothing about whether it is working,
 * and a queue that silently stops draining is exactly the failure the durable
 * dirty map exists to survive — so the honest thing to show is the number of
 * records still waiting. Idle and empty is the quiet case; everything else says
 * what it is.
 *
 * Only appears while signed in. There is nothing to carry otherwise, and an
 * inert control is worse than an absent one.
 */
export function SyncButton() {
  const signedIn = useAuthStore((s) => s.status) === 'signedIn'
  const busy = useSyncStore((s) => s.busy)
  const dirty = useSyncStore((s) => s.dirty)
  const tombstones = useSyncStore((s) => s.tombstones)
  const error = useSyncStore((s) => s.lastError)

  if (!signedIn || offReason() !== null) return null

  const waiting = Object.keys(dirty).length + Object.keys(tombstones).length
  const label = busy
    ? voice.sync.carrying
    : error
      ? voice.sync.failed(error)
      : waiting > 0
        ? voice.sync.waiting(waiting)
        : voice.sync.upToDate

  return (
    <button
      type="button"
      aria-label={`${voice.sync.syncNow} — ${label}`}
      title={label}
      onClick={() => syncNow()}
      disabled={busy}
      className={`chip relative flex h-11 w-11 items-center justify-center border border-line bg-panel transition-colors md:h-10 md:w-10 ${
        error ? 'text-danger' : busy ? 'text-accent' : 'text-ink-dim hover:text-ink'
      }`}
    >
      <span className={busy ? 'animate-spin' : undefined}>
        <SyncIcon />
      </span>
      {!busy && waiting > 0 && (
        <span
          aria-hidden
          className="absolute -right-0.5 -top-0.5 min-w-[15px] rounded-full border border-bg bg-accent px-1 text-[9px] font-bold leading-[14px] text-bg"
        >
          {waiting > 99 ? '99+' : waiting}
        </span>
      )}
    </button>
  )
}

function SyncIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 11a8 8 0 0 0-14.3-4.9M4 13a8 8 0 0 0 14.3 4.9"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M20 4.5V11h-6.5M4 19.5V13h6.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
