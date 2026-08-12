import { useState } from 'react'
import { useAuthStore } from '../core/auth/store'
import { offReason } from '../core/sync/gate'
import { useSyncStore } from '../core/sync/store'
import { ConfirmDialog } from '../core/ui/ConfirmDialog'
import { voice } from '../core/voice'
import { useAuthUi } from './authUi'
import {
  replaceLocalFromRegistry,
  replaceRegistryFromLocal,
  resolveFirstSync,
  syncNow,
} from './sync/service'

/**
 * The registry door, as a full screen.
 *
 * Deliberately NOT a wall: it is opened, never imposed. The estate lives in
 * localStorage and the app must open on a plane, so nothing here stands between
 * the user and their own records — signing in is something you go and do, and
 * closing this returns you to an app that works exactly as it did.
 *
 * Plain on purpose (the owner is styling it later); every string still comes
 * from the voice pack, per the standing rule.
 */
export function LoginScreen() {
  const open = useAuthUi((s) => s.open)
  const setOpen = useAuthUi((s) => s.setOpen)
  const status = useAuthStore((s) => s.status)
  const email = useAuthStore((s) => s.email)
  const error = useAuthStore((s) => s.error)
  const signIn = useAuthStore((s) => s.signIn)
  const signOut = useAuthStore((s) => s.signOut)

  if (!open) return null

  const shut = offReason()

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-bg px-5 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label={voice.sync.title}
    >
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.18em] text-ink">
          {voice.sync.title}
        </h1>
        <p className="mt-2 text-sm text-ink-dim">{voice.sync.blurb}</p>

        <div className="mt-8">
          {shut ? (
            <p className="card p-4 text-sm text-ink-dim">
              {shut === 'demo'
                ? voice.sync.offDemo
                : shut === 'storage'
                  ? voice.sync.offStorage
                  : voice.sync.offUnconfigured}
            </p>
          ) : status === 'signedIn' ? (
            <>
              <p className="card p-4 text-sm text-ink">{voice.sync.signedInAs(email ?? '')}</p>
              <CarryState />
              <p className="mt-2 text-xs text-ink-dim">{voice.sync.signOutBlurb}</p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="btn-soft mt-5 w-full py-3.5 text-sm"
              >
                {voice.sync.signOut}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={status === 'loading'}
              onClick={() => void signIn()}
              className="btn-cta w-full py-4 text-base disabled:opacity-30"
            >
              {status === 'loading' ? voice.sync.working : voice.sync.google}
            </button>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-danger">{voice.sync.failed(error)}</p>}

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn-soft mt-10 w-full py-3 text-sm"
        >
          {voice.sync.close}
        </button>
      </div>
    </div>
  )
}

/**
 * The carrying section: what is happening automatically, and the two ways to
 * overrule it.
 *
 * The replacements are deliberately plain buttons rather than anything that
 * could be tapped by accident, and each states which side loses before it is
 * asked to confirm. They are the only place in the app that generates deletions
 * from a comparison instead of from intent — legitimate only because the user
 * declares that intent here, for the whole estate, in as many words.
 */
function CarryState() {
  const busy = useSyncStore((s) => s.busy)
  const dirty = useSyncStore((s) => s.dirty)
  const tombstones = useSyncStore((s) => s.tombstones)
  const lastCarriedAt = useSyncStore((s) => s.lastCarriedAt)
  const syncError = useSyncStore((s) => s.lastError)
  const choice = useSyncStore((s) => s.pendingChoice)

  const [confirmTakeCloud, setConfirmTakeCloud] = useState(false)
  const [confirmTakeLocal, setConfirmTakeLocal] = useState(false)

  const waiting = Object.keys(dirty).length + Object.keys(tombstones).length

  // the two estates have not met — nothing else matters until this is answered
  if (choice) {
    return (
      <div className="mt-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.16em] text-accent">
          {voice.sync.choiceTitle}
        </h3>
        <p className="mt-1 text-sm text-ink-dim">
          {voice.sync.choiceBody(choice.local, choice.cloud)}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <ChoiceButton
            label={voice.sync.choiceMerge}
            hint={voice.sync.choiceMergeHint}
            onClick={() => resolveFirstSync('merge')}
          />
          <ChoiceButton
            label={voice.sync.takeCloud}
            hint={voice.sync.takeCloudHint}
            onClick={() => resolveFirstSync('takeCloud')}
          />
          <ChoiceButton
            label={voice.sync.takeLocal}
            hint={voice.sync.takeLocalHint}
            onClick={() => resolveFirstSync('takeLocal')}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
        {voice.sync.section}
      </h3>
      <p className="mt-2 text-sm text-ink-dim">
        {busy ? voice.sync.carrying : waiting > 0 ? voice.sync.waiting(waiting) : voice.sync.upToDate}
      </p>
      <p className="mt-1 text-xs text-ink-faint">
        {lastCarriedAt
          ? voice.sync.lastCarried(new Date(lastCarriedAt).toLocaleString())
          : voice.sync.neverCarried}
      </p>
      {/* `lastError` carries two different kinds of thing through one channel.
          Transport trouble arrives as a lowercase fragment meant to finish
          `sync.failed`'s sentence ("Could not reach your account: …"); the
          cross-account notice is a finished sentence of its own, and wrapping it
          produced "Could not reach your account: This device belonged to another
          account." — a failure that did not happen, in front of a fact that did.
          Matching on the constant keeps the two apart without a second field. */}
      {syncError && (
        <p className="mt-2 text-xs text-danger">
          {syncError === voice.sync.otherOwner ? syncError : voice.sync.failed(syncError)}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={() => syncNow()}
        className="btn-soft mt-3 w-full py-2.5 text-sm disabled:opacity-40"
      >
        {voice.sync.syncNow}
      </button>

      <p className="mt-5 text-xs text-ink-faint">{voice.sync.autoOn}</p>
      <div className="mt-2 flex flex-col gap-2">
        <ChoiceButton
          label={voice.sync.takeCloud}
          hint={voice.sync.takeCloudHint}
          disabled={busy}
          onClick={() => setConfirmTakeCloud(true)}
        />
        <ChoiceButton
          label={voice.sync.takeLocal}
          hint={voice.sync.takeLocalHint}
          disabled={busy}
          onClick={() => setConfirmTakeLocal(true)}
        />
      </div>

      <ConfirmDialog
        open={confirmTakeCloud}
        title={voice.sync.takeCloudTitle}
        message={voice.sync.takeCloudBody}
        confirmLabel={voice.sync.takeCloudYes}
        onCancel={() => setConfirmTakeCloud(false)}
        onConfirm={() => {
          setConfirmTakeCloud(false)
          replaceLocalFromRegistry()
        }}
      />
      <ConfirmDialog
        open={confirmTakeLocal}
        title={voice.sync.takeLocalTitle}
        message={voice.sync.takeLocalBody}
        confirmLabel={voice.sync.takeLocalYes}
        onCancel={() => setConfirmTakeLocal(false)}
        onConfirm={() => {
          setConfirmTakeLocal(false)
          replaceRegistryFromLocal()
        }}
      />
    </div>
  )
}

/** a labelled choice with its consequence underneath — never a bare verb */
function ChoiceButton({
  label,
  hint,
  onClick,
  disabled,
}: {
  label: string
  hint: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="card p-3 text-left transition-colors hover:border-accent/40 disabled:opacity-40"
    >
      <span className="block text-sm text-ink">{label}</span>
      <span className="mt-0.5 block text-xs leading-snug text-ink-dim">{hint}</span>
    </button>
  )
}

/** the header's way in — a person, so it reads as "who is this estate's" */
export function AccountIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 20a7.5 7.5 0 0 1 15 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
