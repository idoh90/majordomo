/**
 * What a link card is allowed to point at.
 *
 * A card's `url` is typed by the user and stored with no checking at all, and it
 * ends up in an `href`. React refuses to render a `javascript:` href — so this is
 * not exploitable today — but that defence belongs to React, not to this app,
 * and it holds only for as long as the one place that opens a card URL is JSX.
 * `window.open(card.url)`, a copy-to-clipboard, a share sheet, an export that
 * writes an anchor: any of those would open the hole again, silently, in a change
 * that had nothing to do with security.
 *
 * So the rule lives here instead, and it is an ALLOW-list. Blocking `javascript:`
 * by name is the version that loses: a leading tab, mixed case, and an embedded
 * control character have all been real bypasses of exactly that check. Naming
 * what is permitted has no such tail.
 *
 * `data:` is excluded deliberately even though it looks harmless: a
 * `data:text/html` document opens with its own origin in some browsers and is a
 * standing phishing surface. Nothing in the Workshop needs it.
 */
const ALLOWED = new Set(['http:', 'https:', 'mailto:'])

/**
 * The stored form of what the user typed, or null if it cannot be a link.
 *
 * A bare `example.com` is promoted to `https://` rather than refused — people
 * type hostnames, and refusing them would make the field feel broken while
 * teaching nothing. Anything that is still not a permitted scheme after that is
 * not a link, and is refused rather than repaired.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  const parse = (s: string): URL | null => {
    try {
      return new URL(s)
    } catch {
      return null
    }
  }

  const direct = parse(trimmed)
  if (direct) return ALLOWED.has(direct.protocol) ? direct.href : null

  // No scheme at all — `example.com/x`. Only then do we add one; a string that
  // DID parse and carried a refused scheme must never be re-parsed with https
  // glued in front of it, or `javascript:alert(1)` becomes a valid link to a
  // host called "javascript".
  const promoted = parse(`https://${trimmed}`)
  return promoted && ALLOWED.has(promoted.protocol) ? promoted.href : null
}

/**
 * The render-time guard, for URLs already sitting in the store from before this
 * check existed. Returns undefined so it can be spread straight into an `href`.
 */
export function safeHref(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  return normalizeUrl(raw) ?? undefined
}
