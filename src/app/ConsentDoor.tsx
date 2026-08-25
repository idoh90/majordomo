import { TERMS_VERSION, useShellStore } from '../core/store/shell'
import { trackConsentAccepted } from '../core/telemetry'
import { voice } from '../core/voice'
import { Wordmark } from './onboarding/WelcomeStage'

/**
 * The consent door — the app's one deliberate wall.
 *
 * Everything else here is a door ("a door, never a wall" is the sign-in
 * doctrine), but terms that nobody provably agreed to protect nobody, so this
 * screen renders INSTEAD of the shell — App() returns it before Shell exists,
 * so there is no header, no tab bar and no login behind it to tab or
 * screen-read into — and it offers exactly one way forward. No dismiss, no
 * Esc: pressing AGREE & ENTER is the acceptance the Terms name.
 *
 * Order inside accept() is load-bearing: the stamp lands first, because the
 * telemetry predicate reads it — consent_accepted is the first event a device
 * is ever allowed to send, and it must not be swallowed by its own gate.
 *
 * Shown whenever this device's stamp is below TERMS_VERSION (so bumping that
 * constant after a material change to the documents re-runs this door for
 * everyone), and in DEV only behind `?consent` — the Manor harness and every
 * screenshot param drive bare URLs and must never meet a wall.
 */
export function ConsentDoor() {
  const accept = () => {
    useShellStore.getState().setTermsAccepted(TERMS_VERSION)
    trackConsentAccepted()
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-bg px-5 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))]"
      role="dialog"
      aria-modal="true"
      aria-label={voice.consent.title}
    >
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center">
        <Wordmark />
        <h1 className="mt-8 font-display text-[17px] font-bold uppercase leading-none tracking-[0.18em] text-ink">
          {voice.consent.title}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink">{voice.consent.body}</p>
        <div className="mt-5 flex flex-col gap-2.5">
          <a
            href="/terms"
            target="_blank"
            rel="noopener"
            className="text-sm font-semibold text-accent underline underline-offset-4"
          >
            {voice.consent.termsLink}
          </a>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener"
            className="text-sm font-semibold text-accent underline underline-offset-4"
          >
            {voice.consent.privacyLink}
          </a>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-ink-dim">{voice.consent.analyticsLine}</p>
        <button type="button" onClick={accept} className="btn-cta mt-9 w-full py-4 text-base">
          {voice.consent.agree}
        </button>
      </div>
    </div>
  )
}
