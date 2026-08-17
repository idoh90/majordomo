import { useState } from 'react'
import { voice } from '../../core/voice'
import { useOnboarding } from '../onboarding/store'
import { InstallGuide } from './InstallGuide'

/**
 * The walk's last stop, on a phone: the house can be an icon.
 *
 * Deliberately the SAME card the walk has used at every other stop — bottom
 * anchored, one line, dots gone, one way on — because it is one more stop and
 * not a new kind of screen. What it opens is the ordinary tutorial sheet, the
 * same one settings offers later, so nobody learns the steps twice in two
 * different shapes.
 *
 * Both buttons advance. This is an offer at the end of a tour, and a tour that
 * cannot be finished without installing something would be the first wall the
 * house had ever put up.
 */
export function InstallStage() {
  const advance = useOnboarding((s) => s.advance)
  const [guide, setGuide] = useState(false)
  const t = voice.onboarding.install

  return (
    <>
      <div className="pointer-events-none fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-50 flex justify-center md:inset-x-0 md:bottom-6">
        <div
          className="menu-panel pointer-events-auto w-full max-w-[440px] border-l-[3px] px-4 py-3.5"
          style={{ borderLeftColor: 'var(--color-accent)' }}
          role="dialog"
          aria-live="polite"
        >
          <p className="min-h-10 text-[13.5px] leading-snug text-ink">{t.line}</p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={advance}
              className="min-h-11 text-[12.5px] text-ink-faint transition-colors hover:text-ink-dim"
            >
              {t.skip}
            </button>
            <button
              type="button"
              onClick={() => setGuide(true)}
              className="btn-cta ml-auto px-6 py-2.5 text-[13px]"
            >
              {t.cta}
            </button>
          </div>
        </div>
      </div>

      {/* closing the sheet moves the walk on: the stop has been had, whether or
          not the icon was actually added — which is the browser's business and
          in one case (iOS) not observable from here at all */}
      <InstallGuide
        open={guide}
        onClose={() => {
          setGuide(false)
          advance()
        }}
      />
    </>
  )
}
