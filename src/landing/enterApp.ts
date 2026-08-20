/* The door itself. Unmounts the landing and boots the app in place — no
   navigation, no redirect: the URL is already the right one. Dynamic imports
   only, so the landing chunk never carries app code and the module graph
   stays acyclic. */
export async function enterApp(): Promise<void> {
  /* …unless the URL is the front door's own address, which is how a resident
     got back here from the settings screen. It has been honoured; leaving it
     standing would make the next reload walk him straight back out of his own
     app. Same reasoning as the ?join gate: an address is not a standing
     order. Stripped BEFORE the boot, so nothing that reads the query at start
     up sees a param that has already been spent. */
  const params = new URLSearchParams(window.location.search)
  if (params.has('landing')) {
    params.delete('landing')
    const rest = params.toString()
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash,
    )
  }

  const [{ unmountLanding }, { bootApp }] = await Promise.all([
    import('./mount'),
    import('../app/boot'),
  ])
  unmountLanding()
  bootApp()
}
