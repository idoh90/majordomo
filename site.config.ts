/* ---------------------------------------------------------------------------
   Where this page lives, and how to write to whoever runs it.

   Both used to be typed out by hand in five places — index.html (canonical,
   og:url, og:image, twitter:image), privacy.html (canonical), robots.txt,
   sitemap.xml, and voice.ts — with a comment in each begging the next person
   to remember the other four. That is not a checklist, it is a bug with a
   waiting period: the page keeps building, keeps passing, and quietly tells
   crawlers and link previews that it lives somewhere it does not.

   So both are resolved once, here, at build time, and everything else carries
   a token that gets filled in. Miss a spot and the build fails loudly (the
   Vite plugin throws) or `npm run audit` does — see "one address, everywhere".

   ---------------------------------------------------------------------------
   THE ORIGIN, in order of precedence:

   1. SITE_ORIGIN — an explicit override. Set this in the Vercel project the
      moment a domain is bought and pointed here, and nothing else has to be
      right for the page to be honest about its own address.

   2. VERCEL_PROJECT_PRODUCTION_URL — set automatically on every Vercel build,
      preview builds included. Vercel's own words: "We select the shortest
      production custom domain, or vercel.app domain if no custom domain is
      available." That is exactly the rule this page wants, which means domain
      day requires NO code change at all: assign the domain in Vercel, redeploy,
      and the canonical, the OG tags, robots.txt and the sitemap all move
      together. Requires "Enable access to System Environment Variables" in
      project settings, which is on by default; if it is ever switched off this
      silently falls through to (3), which is why the deployed page's canonical
      is worth one glance after the first deploy.

   3. The fallback below — the production domain, used by `npm run build` and
      `npm run preview` on this machine, where neither of the above exists.
      Not a guess any more: majordomocal.com is registered and connected to
      this Vercel project, and (2) resolves to the same place on every real
      deploy anyway.

   The scheme is always https. A canonical URL on http invites a duplicate-
   content split between two spellings of the same page, and nothing here is
   ever served over anything else.
--------------------------------------------------------------------------- */

export const FALLBACK_ORIGIN = 'https://majordomocal.com'

/* ---------------------------------------------------------------------------
   THE CONTACT ADDRESS.

   This is a promise the page makes twice: the Contact link in the footer, and
   the deletion address on /privacy — "write here and your address is deleted".
   A privacy page that names a mailbox nobody reads is worse than one that
   names none, because the second is merely incomplete and the first is untrue.

   It was `hello@majordomo.app` until the domain was checked: majordomo.app has
   been registered to someone else since September 2021. Mail sent there did
   not bounce — it went to a stranger, from people asking to be forgotten.

   So the default is a mailbox that actually exists today. On domain day, set
   CONTACT_EMAIL to hello@<the domain> in the Vercel project — after the
   forwarding is live, not before. An address that is merely intended is the
   same failure again with better branding.
--------------------------------------------------------------------------- */

export const FALLBACK_CONTACT = 'idoh40@gmail.com'

/* The spelling that appears in index.html, privacy.html, robots.txt and
   sitemap.xml. Deliberately not valid in any of those formats on its own: a
   token that survives into dist is a broken page, and it should look broken
   rather than plausible.

   This module is imported by vite.config.ts and by nothing under src/, and it
   has to stay that way. CONTACT_TOKEN is the literal string that vite's
   `define` rewrites throughout the app's source — so importing this file from
   a component would have `define` quietly replace the constant's own value
   with an email address. Node-side only. */
export const ORIGIN_TOKEN = '__SITE_ORIGIN__'
export const CONTACT_TOKEN = '__CONTACT_EMAIL__'

type Env = Record<string, string | undefined>

function fail(name: string, raw: string, why: string): never {
  throw new Error(
    `site.config: ${name}=${JSON.stringify(raw)} ${why}. ` +
      `This is one of the two strings the page publishes about itself — refusing ` +
      `to build beats deploying a canonical URL or a deletion address that is ` +
      `almost right.`,
  )
}

/* Reduced to a bare origin — scheme + host + port, no path, no trailing slash,
   no query. Everything downstream concatenates onto this ("/privacy",
   "/og.png"), and one trailing slash typed into a dashboard field is a
   sitemap full of `https://example.com//privacy`. */
function toOrigin(raw: string, name: string): string {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    fail(name, raw, 'is not a URL (it needs the https:// too)')
  }
  if (url.protocol !== 'https:') fail(name, raw, 'is not https')
  if (!url.hostname.includes('.')) fail(name, raw, 'has no dot in its hostname')
  return url.origin
}

export function resolveOrigin(env: Env = process.env): string {
  const explicit = env.SITE_ORIGIN?.trim()
  if (explicit) return toOrigin(explicit, 'SITE_ORIGIN')

  /* Vercel hands this over without a scheme — "my-site.com", not a URL. */
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return toOrigin(vercel.startsWith('http') ? vercel : `https://${vercel}`, 'VERCEL_PROJECT_PRODUCTION_URL')

  return FALLBACK_ORIGIN
}

export function resolveContact(env: Env = process.env): string {
  const explicit = env.CONTACT_EMAIL?.trim()
  if (!explicit) return FALLBACK_CONTACT
  /* The same permissive shape the old waitlist agreed on. It is here to catch
     a mangled dashboard paste, not to adjudicate RFC 5322. */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(explicit)) {
    fail('CONTACT_EMAIL', explicit, 'is not shaped like an email address')
  }
  return explicit
}

/* One pass over any text that may carry either token. */
export function fillTokens(text: string, origin: string, contact: string): string {
  return text.split(ORIGIN_TOKEN).join(origin).split(CONTACT_TOKEN).join(contact)
}
