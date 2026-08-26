/**
 * The join code, in the two forms it lives in.
 *
 * CANONICAL is what the registry stores and compares: eight characters, no
 * separators, upper case. DISPLAY is what a human reads off a screen and types
 * back in: `XXXX-XXXX`. They were the same string until the code was shown
 * dashed and accepted only undashed, which is a small trap of exactly the kind
 * this house is supposed to be free of — the field shows one shape and the door
 * wants another.
 *
 * `join_share` normalizes server-side too (0004), so this is not a correctness
 * fix; it is so the field a person types into looks like the code they were
 * given, character for character, while they type it.
 */

export const CODE_LEN = 8
const GROUP = 4

/** the `?join=CODE` in a pasted invitation link, if that is what this is */
const LINK = /[?&]join=([^&#\s]+)/i

/**
 * Whatever was typed or pasted, reduced to the canonical form. Handles the
 * likeliest paste by a mile — the whole invite LINK, because COPY LINK is the
 * button an owner reaches for — and then keeps only what the alphabet can
 * contain. Spaces, dashes and lower case all fall out here.
 */
export function normalizeCode(raw: string): string {
  const link = LINK.exec(raw)
  let body = raw
  if (link) {
    try {
      body = decodeURIComponent(link[1])
    } catch {
      // `decodeURIComponent` THROWS on a malformed percent-escape, and this
      // string is whoever-sent-the-link's to choose. It threw during render —
      // and since the offending code was persisted, on every render after that
      // too, so a link from a stranger put the app permanently on its recovery
      // screen. Undecodable is simply not a link: fall through to the raw text
      // and let the alphabet filter below have what is left of it.
      body = link[1]
    }
  }
  return body.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, CODE_LEN)
}

/** the canonical form, dashed — and a half-typed code dashes as it fills */
export function formatCode(raw: string): string {
  const code = normalizeCode(raw)
  return code.length > GROUP ? `${code.slice(0, GROUP)}-${code.slice(GROUP)}` : code
}

/**
 * One keystroke's worth of editing, given the field's new value and the code
 * behind the value it replaced.
 *
 * The whole reason this is not a one-line `normalizeCode` is the separator: a
 * backspace that lands on the dash of `ABCD-` shortens the FIELD without
 * changing the code behind it, so re-deriving the display would put the dash
 * straight back and the key would appear to do nothing. When that happens —
 * the field got shorter, the code did not — the character before the separator
 * is the one that was meant.
 */
export function editCode(next: string, previous: string): string {
  const code = normalizeCode(next)
  const shrank = next.length < formatCode(previous).length
  return shrank && code === previous ? code.slice(0, -1) : code
}
