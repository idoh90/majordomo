import { useSyncExternalStore } from 'react'

/**
 * Current timestamp, refreshed on an interval and whenever the tab becomes
 * visible again — so a phone unlocked the next morning shows cooled muscles.
 * 
 * Uses useSyncExternalStore to ensure the time is always current and survives
 * React's concurrent rendering without stale values.
 */
export function useNow(intervalMs = 60_000): number {
  // Subscribe to a time source that React can synchronize with
  return useSyncExternalStore(
    (callback) => {
      // Set up the interval
      const id = setInterval(callback, intervalMs)
      
      // Also subscribe to visibility changes
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          callback()
        }
      }
      document.addEventListener('visibilitychange', onVisible)
      
      // Cleanup function
      return () => {
        clearInterval(id)
        document.removeEventListener('visibilitychange', onVisible)
      }
    },
    () => Date.now(), // getSnapshot: always return current time
    () => Date.now()  // getServerSnapshot: for SSR (not used here, but required)
  )
}
