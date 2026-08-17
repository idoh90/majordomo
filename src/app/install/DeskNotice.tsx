import { useState } from 'react'
import { useShellStore } from '../../core/store/shell'
import { voice } from '../../core/voice'
import { useIsMobile } from '../useIsMobile'
import { useOnboarding } from '../onboarding/store'
import { InstallGuide } from './InstallGuide'
import { handheld, useInstall } from './install'

/**
 * THE NOTE ABOUT THE SMALL SCREEN — said once per device, on the Manor, and
 * never again.
 *
 * It is a statement, not an apology and not a wall: the phone runs everything,
 * and the week grid, the pegboard wall and the body map are simply built for
 * the room a desk has. Saying so once is respect; saying so on every visit
 * would be nagging, which is why UNDERSTOOD writes a flag rather than closing
 * a component.
 *
 * The same card is where the home-screen tutorial is offered, because the two
 * belong to one thought — you are on a phone, here is what that means, and
 * here is the one thing worth doing about it. The offer is dropped on a device
 * already running from its icon: there is nothing left to suggest.
 *
 * It waits for the first-time setup to finish. The setup is a full-bleed
 * overlay and ends with the install stage saying much the same thing; a notice
 * queued behind it would be the third time in ninety seconds.
 */
export function DeskNotice() {
  const mobile = useIsMobile()
  const seen = useShellStore((s) => s.deskNoticeSeen)
  const onboarding = useOnboarding((s) => s.stage)
  const installed = useInstall((s) => s.installed)
  const [guide, setGuide] = useState(false)

  if (!mobile || !handheld() || seen || onboarding !== null) return null
  const t = voice.install.desk

  const dismiss = () => useShellStore.getState().setDeskNoticeSeen(true)

  return (
    <>
      <section
        className="mt-3 rounded-xl border px-4 py-3.5"
        style={{
          borderColor: 'color-mix(in srgb, var(--color-accent) 32%, transparent)',
          background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
        }}
        role="note"
      >
        <div className="text-[9px] tracking-[0.18em] text-ink-faint">{t.title}</div>
        <p className="mt-1.5 text-[13px] leading-snug text-ink-dim">{t.line}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!installed && (
            <button
              type="button"
              onClick={() => setGuide(true)}
              className="btn-soft flex-1 py-2 font-display text-[10px] font-bold tracking-[0.14em]"
            >
              {t.guide}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="flex-1 py-2 font-display text-[10px] font-bold tracking-[0.14em] text-ink-faint transition-colors hover:text-ink-dim"
          >
            {t.dismiss}
          </button>
        </div>
      </section>

      {/* reading the tutorial IS acknowledging the notice — closing it puts
          both away, so the card does not sit there waiting to be dismissed a
          second time */}
      <InstallGuide
        open={guide}
        onClose={() => {
          setGuide(false)
          dismiss()
        }}
      />
    </>
  )
}
