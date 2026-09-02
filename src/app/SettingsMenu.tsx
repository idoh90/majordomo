import { useEffect, useState } from 'react'
import { voice } from '../core/voice'
import { SettingsScreen } from './SettingsScreen'
import { useSettingsUi } from './settingsUi'

/**
 * The gear — the one way into the settings, and now nothing more than that.
 *
 * It used to own a dropdown holding every preference in the house. The list
 * outgrew the box (see SettingsScreen for the reasoning); what is left here is
 * a button and the state of the page it opens.
 */
export function SettingsMenu() {
  // ?sheet=skin — dev screenshot aid, kept working: the skins now live inside
  // the settings page rather than behind a sheet of their own
  const [open, setOpen] = useState(
    () =>
      import.meta.env.DEV && new URLSearchParams(window.location.search).get('sheet') === 'skin',
  )

  // the other opener: THE VALET renders at the shell's root and cannot reach
  // this state, so it posts instead. The page consumes which sheet was asked
  // for; this only has to know the page should be up.
  const requested = useSettingsUi((s) => s.request)
  useEffect(() => {
    if (requested !== null) setOpen(true)
  }, [requested])

  return (
    <>
      <button
        type="button"
        aria-label={voice.settings.title}
        onClick={() => setOpen(true)}
        className="chip flex h-11 w-11 items-center justify-center border border-line bg-panel text-ink-dim transition-colors hover:text-ink md:h-10 md:w-10"
      >
        <GearIcon />
      </button>

      <SettingsScreen open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
