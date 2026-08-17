import { create } from 'zustand'

/**
 * PUTTING THE HOUSE ON THE HOME SCREEN.
 *
 * The app has been installable since the day `vite-plugin-pwa` went in — it
 * precaches everything and boots from localStorage, so an installed copy opens
 * on a plane exactly as it does on wifi. Nothing in the app ever said so, and
 * a capability nobody is told about is a capability nobody has.
 *
 * Two facts decide what to show, and both are cheap:
 *
 *  · WHETHER it is already installed. `display-mode: standalone` is the modern
 *    answer; `navigator.standalone` is the iOS one, and iOS is precisely the
 *    platform where the manual instructions matter, so both are read.
 *  · HOW to install it here, which is a platform question with genuinely
 *    different answers — iOS hides it behind the share sheet and offers no API
 *    at all, Android/Chrome fires `beforeinstallprompt` and can do the whole
 *    thing in one tap, and a desktop browser has an icon in the address bar.
 *
 * The prompt event is captured at module scope, because it fires ONCE, early,
 * and cannot be asked for again — a component mounted later would simply never
 * see it. Holding it is the whole reason this file has a store.
 */

export type Platform = 'ios' | 'android' | 'desktop'

/** the Chromium-only install event, which no lib.dom typing has */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  /** held from `beforeinstallprompt`; null where the browser never offers one */
  prompt: InstallPromptEvent | null
  /** the app is running from the home screen already */
  installed: boolean
  setPrompt: (e: InstallPromptEvent | null) => void
  setInstalled: (installed: boolean) => void
}

export const useInstall = create<InstallState>((set) => ({
  prompt: null,
  installed: isStandalone(),
  setPrompt: (prompt) => set({ prompt }),
  setInstalled: (installed) => set({ installed }),
}))

/** launched from a home-screen icon rather than a browser tab */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true
}

/**
 * Which set of instructions this device needs.
 *
 * iPadOS reports itself as a Mac and has done for years, so the platform test
 * has to ask whether the "Mac" has a touchscreen — without that, an iPad is
 * shown the address-bar instructions for a button it does not have.
 */
export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/iphone|ipod/i.test(ua)) return 'ios'
  if (/ipad/i.test(ua)) return 'ios'
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  if (/android/i.test(ua)) return 'android'
  return 'desktop'
}

/**
 * A phone or a tablet — a device with no desk behind it.
 *
 * Asked of the PLATFORM, never of the viewport. A laptop window dragged
 * narrow is still a laptop, and telling its owner the app would be better on
 * a desktop is both wrong and slightly insulting; the narrow-viewport test
 * (`useIsMobile`) picks the LAYOUT, and these are two different questions
 * that happen to agree most of the time.
 */
export function handheld(): boolean {
  return platform() !== 'desktop'
}

let started = false

/**
 * Wired at module scope from main.tsx, beside the other inits — the event this
 * listens for has usually fired before React has mounted anything.
 */
export function initInstall(): void {
  if (started) return
  started = true

  window.addEventListener('beforeinstallprompt', (e) => {
    // holding it is only legal if the browser's own bar is suppressed first
    e.preventDefault()
    useInstall.getState().setPrompt(e as InstallPromptEvent)
  })

  window.addEventListener('appinstalled', () => {
    useInstall.getState().setPrompt(null)
    useInstall.getState().setInstalled(true)
  })

  // installed WHILE open, or opened from the icon in another tab: the display
  // mode is a live query, so this stays honest without polling
  const mql = window.matchMedia('(display-mode: standalone)')
  mql.addEventListener('change', (e) => useInstall.getState().setInstalled(e.matches))
}

/**
 * Take the browser up on its offer, where there is one. Returns false when
 * there was nothing to accept — which is every iOS device, and any Chromium
 * one where the prompt has already been spent.
 */
export async function promptInstall(): Promise<boolean> {
  const held = useInstall.getState().prompt
  if (!held) return false
  // the event is single-use: spent whether or not the user says yes
  useInstall.getState().setPrompt(null)
  try {
    await held.prompt()
    const { outcome } = await held.userChoice
    return outcome === 'accepted'
  } catch {
    // a prompt the browser declined to show is not an error worth a screen
    return false
  }
}
