import { create } from 'zustand'
import { getClient } from './client'
import { SUPABASE_URL, armed } from '../sync/gate'
import { voice } from '../voice'

/**
 * Who the estate belongs to.
 *
 * NOT persisted — the Supabase client owns the session and keeps its own
 * storage; a second copy here could only ever disagree with it.
 */

export type AuthStatus =
  /** the registry is shut (unconfigured, ?demo, or storage refused) */
  | 'off'
  /** the client is still loading, or the redirect is still being exchanged */
  | 'loading'
  | 'signedOut'
  | 'signedIn'

interface AuthState {
  status: AuthStatus
  email: string | null
  userId: string | null
  /** last failure in plain words; cleared when the next attempt starts */
  error: string | null
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * Is the registry actually there?
 *
 * `signInWithOAuth` does not ask — it just assigns `window.location`, so a
 * registry that is misconfigured, deleted or simply unreachable throws the user
 * out of the app and into a browser error page ("Safari cannot open the page
 * because the server cannot be found"), with the app left behind and nothing
 * said. That is the worst possible failure: it looks like the app is broken,
 * and on a phone there is not even a console to disagree with.
 *
 * `no-cors` on purpose — the answer is never read, only whether a connection
 * happened at all, which sidesteps CORS entirely and is exactly the question.
 * Offline gives the same verdict as a dead host, which is correct: in both
 * cases there is nothing to sign in to.
 */
async function reachable(): Promise<boolean> {
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    return true
  } catch {
    return false
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: armed() ? 'loading' : 'off',
  email: null,
  userId: null,
  error: null,

  signIn: async () => {
    const client = getClient()
    if (!client) return
    set({ error: null, status: 'loading' })
    try {
      // ask before leaving — see `reachable` above
      if (!(await reachable())) {
        set({ status: 'signedOut', error: voice.sync.unreachable })
        return
      }
      const sb = await client
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        // back to where we started; Supabase's URL allowlist holds both
        // localhost:5173/** and the deployed origin
        options: { redirectTo: window.location.origin },
      })
      if (error) set({ status: 'signedOut', error: error.message })
      // on success the browser navigates away — nothing after this runs
    } catch (e) {
      set({ status: 'signedOut', error: message(e) })
    }
  },

  signOut: async () => {
    const client = getClient()
    if (!client) return
    set({ error: null })
    try {
      const sb = await client
      await sb.auth.signOut()
      // onAuthStateChange flips the status. The local estate is deliberately
      // LEFT ALONE: it predates accounts, and wiping a device on sign-out
      // would destroy anything edited offline and never pushed.
    } catch (e) {
      set({ error: message(e) })
    }
  },
}))

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__auth = useAuthStore
}

let started = false

/**
 * Wire the session up. Called at module scope from main.tsx — not in an
 * effect, because StrictMode double-invokes those.
 *
 * Everything here is asynchronous ON PURPOSE and nothing waits for it: the app
 * has already rendered from localStorage by the time this resolves. There is no
 * boot gate, no spinner, no await between the user and their estate.
 */
export function initAuth(): void {
  if (started) return
  started = true

  const client = getClient()
  if (!client) {
    useAuthStore.setState({ status: 'off' })
    return
  }

  const adopt = (session: { user: { id: string; email?: string } } | null) => {
    useAuthStore.setState({
      status: session ? 'signedIn' : 'signedOut',
      email: session?.user.email ?? null,
      userId: session?.user.id ?? null,
    })
  }

  void client
    .then(async (sb) => {
      // fires for the initial session, the redirect exchange, refreshes and
      // sign-out alike — one path for every transition
      sb.auth.onAuthStateChange((_event, session) => adopt(session))
      const { data } = await sb.auth.getSession()
      adopt(data.session)
    })
    .catch((e: unknown) => {
      // the SDK chunk failed to load (offline first boot, blocked request) —
      // the app is unaffected; only the door is
      useAuthStore.setState({ status: 'signedOut', error: message(e) })
    })
}
