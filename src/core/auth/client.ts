import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, armed } from '../sync/gate'

/**
 * The doorman.
 *
 * One method each way, so the MECHANISM behind sign-in stays swappable. That
 * matters more than it looks: an installed iOS home-screen app has its own
 * WebKit storage jar, and a redirect that returns in Safari lands the session
 * in the wrong jar. If the redirect below fails on the real iPhone, the
 * replacement (a Google ID token, or an emailed code) changes only this file.
 */
export interface AuthPort {
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

let pending: Promise<SupabaseClient> | null = null

/**
 * The client, loaded on demand — null when the registry is shut.
 *
 * Deliberately a dynamic import: the SDK stays out of the boot path, so the app
 * still renders synchronously from localStorage exactly as it always has and
 * the registry arrives a microtask later. `vite-plugin-pwa` precaches the chunk
 * like any other script, so this costs nothing offline.
 */
export function getClient(): Promise<SupabaseClient> | null {
  if (!armed()) return null
  if (!pending) {
    pending = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
          // the OAuth redirect returns to '/?code=…'; the SDK exchanges the
          // code and tidies the URL itself, so the app needs no callback route
          // (there is no router) and the service worker's index.html fallback
          // serves the shell with the query intact
          detectSessionInUrl: true,
        },
      }),
    )
  }
  return pending
}
