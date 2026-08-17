import { useState } from 'react'
import { Sheet } from '../../core/ui/Sheet'
import { voice } from '../../core/voice'
import { platform, promptInstall, useInstall } from './install'

/**
 * The home-screen tutorial — the onboarding walk's manner, in a sheet: state
 * what it buys you, then the beats, numbered, in the order the hand does them.
 *
 * The beats are per PLATFORM and there is no way around that: iOS buries this
 * in the share sheet and exposes no API, Android hands the whole thing over in
 * one tap through `beforeinstallprompt`, and a desktop browser puts an icon in
 * the address bar. Showing everyone all three would be the same as showing
 * them none.
 *
 * Where the one-tap button exists it goes FIRST and the steps stay underneath
 * rather than being replaced by it: the prompt is single-use and browsers
 * decline to show it for reasons of their own, so a tutorial that had put all
 * its weight on the button would have nothing left to say.
 */
export function InstallGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = voice.install
  const held = useInstall((s) => s.prompt)
  const installed = useInstall((s) => s.installed)
  const [said, setSaid] = useState<string | null>(null)
  const steps = t.steps[platform()]

  const ask = async () => {
    const accepted = await promptInstall()
    setSaid(accepted ? t.accepted : t.refused)
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{t.title}</h2>

      {installed ? (
        <p className="mt-3 text-sm text-ink-dim">{t.already}</p>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-ink-dim">{t.blurb}</p>

          {held && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void ask()}
                className="btn-cta w-full py-3.5 text-sm"
              >
                {t.oneTap}
              </button>
              <p className="mt-2 text-center text-[12px] text-ink-faint">{t.oneTapNote}</p>
            </div>
          )}

          {said && <p className="mt-4 text-[13px] text-ink">{said}</p>}

          <ol className="mt-5 flex flex-col gap-3">
            {steps.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-pill border font-display text-[11px] font-bold [font-variant-numeric:tabular-nums]"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)',
                    color: 'var(--color-accent)',
                  }}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className="text-[13.5px] leading-snug text-ink">{line}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      <button type="button" onClick={onClose} className="btn-soft mt-6 w-full py-3 text-sm">
        {t.close}
      </button>
    </Sheet>
  )
}
