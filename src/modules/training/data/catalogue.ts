import { useEffect, useState } from 'react'
import type { CatalogueExercise } from '../types'

/**
 * The bundled exercise catalogue, loaded on demand.
 *
 * Deliberately a dynamic import, the same arrangement `core/auth/client.ts`
 * uses for the Supabase SDK: 736 exercises are ~110 KB of source that only the
 * exercise picker ever reads, and the entry bundle is what the boot curtain is
 * covering. Vite gives it its own chunk; `vite-plugin-pwa` precaches every
 * `.js` in dist, so the picker still opens on a plane.
 *
 * The catalogue is generated (`npm run vendor:exercises`) and is not records —
 * it is identical on every device, so it is never synced and never persisted.
 */

let pending: Promise<CatalogueExercise[]> | null = null

export function loadCatalogue(): Promise<CatalogueExercise[]> {
  if (!pending) pending = import('./exercises').then((m) => m.EXERCISE_CATALOGUE)
  return pending
}

/**
 * null while the chunk is in flight — only ever on the first open of the
 * picker in a session, and only the picker waits on it. Everything that reads
 * an exercise the user already logged reads the copy stored on the workout.
 */
export function useCatalogue(): CatalogueExercise[] | null {
  const [list, setList] = useState<CatalogueExercise[] | null>(null)

  useEffect(() => {
    let live = true
    void loadCatalogue().then((c) => {
      if (live) setList(c)
    })
    return () => {
      live = false
    }
  }, [])

  return list
}
