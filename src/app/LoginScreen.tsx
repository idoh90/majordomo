import { useAuthStore } from '../core/auth/store'
import { offReason } from '../core/sync/gate'
import { voice } from '../core/voice'
import { useAuthUi } from './authUi'

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

        {!shut && <p className="mt-6 text-xs italic text-ink-dim">{voice.sync.notYet}</p>}

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
