/* The door itself. Unmounts the landing and boots the app in place — no
   navigation, no redirect: the URL is already the right one. Dynamic imports
   only, so the landing chunk never carries app code and the module graph
   stays acyclic. */
export async function enterApp(): Promise<void> {
  const [{ unmountLanding }, { bootApp }] = await Promise.all([
    import('./mount'),
    import('../app/boot'),
  ])
  unmountLanding()
  bootApp()
}
