import { chromium } from 'playwright-core'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/* ---------------------------------------------------------------------------
   The gates, as a command.

   `npm run build && npm run preview` in one terminal, `npm run audit` in
   another. Three things get checked, and each one is a stated acceptance
   criterion rather than a nice-to-have:

   1. CONTRAST — every visible text node on both routes, at 390 and 1440,
      measured against its actual composited background. AA or it fails. This
      is the "checked, not eyeballed" clause; a designer's eye reliably passes
      #5e6a7d on #0c1017, which is 3.5:1.

   2. THE PAGE WITHOUT JAVASCRIPT — the build prerenders, so the whole
      argument must be in the HTML. If this fails, hydration is not the only
      thing that broke.

   3. LIGHTHOUSE — mobile and desktop, both routes. L0 wanted ≥90 on all four
      categories; L2 wants ≥95.

   Exits non-zero on any failure, so it can gate a deploy later.
--------------------------------------------------------------------------- */

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
/* Overridable because a Chrome running as root — any Linux container, CI
   included — refuses to start without --no-sandbox, and says only "Unable to
   connect to Chrome" when it does. The default is what this machine wants; the
   override is what a container wants. */
const CHROME_FLAGS = process.env.AUDIT_CHROME_FLAGS ?? '--headless=new --disable-gpu'
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:4173'
const TMP = join(root, '.shots')
/* The indexable routes — what Lighthouse scores and what the sitemap lists. */
const ROUTES = ['/', '/privacy', '/terms']
/* Every page a visitor can actually land on. /404 is contrast-checked like the
   rest (AA everywhere is the page's criterion, and an error page is still a
   page someone has to read) but deliberately stays OUT of the Lighthouse loop:
   it declares itself noindex on purpose, and Lighthouse counts "page is
   blocked from indexing" as an SEO failure — so scoring it would fail this
   gate for doing the correct thing. */
const PAGES = [...ROUTES, '/404']

let failures = 0
const fail = (m) => {
  failures++
  console.log(`  FAIL  ${m}`)
}
const pass = (m) => console.log(`  ok    ${m}`)

mkdirSync(TMP, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME })

/* ------------------------------------------------------------------ contrast */
console.log('\ncontrast (WCAG AA)')
for (const route of PAGES) {
  for (const [w, h] of [
    [390, 844],
    [1440, 900],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    await page.goto(BASE + route, { waitUntil: 'networkidle' })
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, 0)
    })
    const bad = await page.evaluate(() => {
      const parse = (c) => {
        const m = c.match(/[\d.]+/g)
        return m ? [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]] : null
      }
      const lin = (v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
      const over = (fg, bg) => {
        const a = fg[3]
        return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a))
      }
      /* composite every ancestor background down to the page, so a translucent
         panel over a trough is measured as what the eye actually sees */
      const bgOf = (el) => {
        let n = el
        const stack = []
        while (n && n !== document.documentElement) {
          const c = parse(getComputedStyle(n).backgroundColor)
          if (c && c[3] > 0) stack.push(c)
          n = n.parentElement
        }
        let cur = [12, 16, 23]
        for (let i = stack.length - 1; i >= 0; i--) cur = over(stack[i], cur)
        return cur
      }
      const out = []
      const seen = new Set()
      document.querySelectorAll('body *').forEach((el) => {
        const txt = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join(' ')
          .trim()
        if (txt.length < 2) return
        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2) return
        const fg = parse(cs.color)
        if (!fg) return
        const bg = bgOf(el)
        const f = over(fg, bg)
        const ratio = (Math.max(L(f), L(bg)) + 0.05) / (Math.min(L(f), L(bg)) + 0.05)
        const size = parseFloat(cs.fontSize)
        const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700)
        const need = large ? 3 : 4.5
        const key = `${cs.color}|${Math.round(bg[0])}|${size}|${cs.fontWeight}`
        if (seen.has(key)) return
        seen.add(key)
        if (ratio < need)
          out.push(`${ratio.toFixed(2)}:1 (needs ${need}) ${cs.fontSize} ${cs.color} — "${txt.slice(0, 40)}"`)
      })
      return out
    })
    await ctx.close()
    if (bad.length) bad.forEach((b) => fail(`${route} @${w} — ${b}`))
    else pass(`${route} @${w}`)
  }
}

/* ------------------------------------------------------- the page without JS */
console.log('\nprerendered document (JavaScript off)')
{
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const txt = await page.locator('body').innerText()
  const MUST = [
    'Every mission needs a',
    'schedules that fight back',
    'GET STARTED',
    'Why “Majordomo”?',
    'The estate is open',
  ]
  const missing = MUST.filter((m) => !txt.includes(m))
  if (missing.length) missing.forEach((m) => fail(`missing from the HTML: "${m}"`))
  else pass(`the whole argument is in the document (${txt.length} characters)`)
  await ctx.close()
}

await browser.close()

/* -------------------------------------------------- one address, everywhere */
/* Reads dist/ rather than the served page, because two of the four files are
   never rendered: a crawler is the only reader robots.txt and sitemap.xml
   have, and a wrong origin in either is invisible from a browser. This is the
   gate that would have caught the old failure mode — five hand-typed copies of
   a hostname, four of them updated. */
console.log('\nthe page’s own address')
{
  const dist = join(root, 'dist')
  const files = Object.fromEntries(
    ['index.html', 'privacy.html', 'robots.txt', 'sitemap.xml'].map((f) => [
      f,
      readFileSync(join(dist, f), 'utf8'),
    ]),
  )

  /* A token that survived the build means a file stopped being wired up. */
  for (const [name, text] of Object.entries(files)) {
    for (const token of ['__SITE_ORIGIN__', '__CONTACT_EMAIL__']) {
      if (text.includes(token)) fail(`dist/${name} still contains ${token}`)
    }
  }

  /* majordomo.app belongs to someone else — registered since 2021. It was the
     contact address on this page for a while, which means strangers were being
     asked to write there to have their data deleted. It must never come back. */
  for (const [name, text] of Object.entries(files)) {
    if (text.includes('majordomo.app')) fail(`dist/${name} names majordomo.app, which is not ours`)
  }

  /* The founder note's two links carry rel="me" — a claim that those accounts
     are his. Pointed at the bare sites they claim x.com and tiktok.com
     themselves, and they send a curious reader to a front door instead of to
     the build-in-public they came for. Cheap to forget, expensive on the one
     page whose whole argument is that it was made by one of them. */
  const PLACEHOLDER_LINKS = ['https://x.com/', 'https://www.tiktok.com/']
  for (const href of PLACEHOLDER_LINKS) {
    if (files['index.html'].includes(`"${href}"`)) {
      fail(
        `dist/index.html still links to ${href} — a placeholder handle. ` +
          `Put the real one in voice.ts (founder.links), or remove the link.`,
      )
    }
  }

  /* Every absolute URL the document publishes, from wherever it publishes it.
     Each source is counted separately rather than summed, so a tag that gets
     renamed or dropped is named by the failure instead of showing up as a
     total that is one short. */
  const SOURCES = [
    ['index.html', 'canonical', /<link rel="canonical" href="(https?:\/\/[^"]+)"/g, 1],
    ['index.html', 'og:url', /<meta property="og:url" content="(https?:\/\/[^"]+)"/g, 1],
    ['index.html', 'og:image', /<meta property="og:image" content="(https?:\/\/[^"]+)"/g, 1],
    ['index.html', 'twitter:image', /<meta name="twitter:image" content="(https?:\/\/[^"]+)"/g, 1],
    ['privacy.html', 'canonical', /<link rel="canonical" href="(https?:\/\/[^"]+)"/g, 1],
    ['robots.txt', 'Sitemap:', /Sitemap:\s*(https?:\/\/\S+)/g, 1],
    ['sitemap.xml', '<loc>', /<loc>(https?:\/\/[^<]+)<\/loc>/g, 2],
  ]
  const found = []
  for (const [name, label, re, expected] of SOURCES) {
    const hits = [...files[name].matchAll(re)].map((m) => m[1])
    if (hits.length !== expected) {
      fail(`dist/${name}: expected ${expected} absolute URL(s) in ${label}, found ${hits.length}`)
    }
    hits.forEach((url) => found.push({ name, label, url }))
  }

  const origins = new Set(found.map((f) => new URL(f.url).origin))
  if (origins.size !== 1) {
    fail(`dist disagrees about where this page lives: ${[...origins].join(' vs ')}`)
    found.forEach((f) => console.log(`        ${f.name}  ${f.url}`))
  } else {
    const [origin] = [...origins]
    if (!origin.startsWith('https://')) fail(`the published origin is not https: ${origin}`)
    else pass(`${found.length} absolute URLs, all on ${origin}`)
  }

  /* The two places the page promises a mailbox must name the same one. */
  const mails = new Set(
    [...files['index.html'].matchAll(/mailto:([^"'\s>]+)/g)].map((m) => m[1]),
  )
  const privacyMail = files['privacy.html'].match(/Write to ([^\s]+@[^\s]+?) and/)
  if (privacyMail) mails.add(privacyMail[1])
  if (mails.size > 1) fail(`the page names more than one contact address: ${[...mails].join(', ')}`)
  else if (mails.size === 1) pass(`one contact address, ${[...mails][0]}`)
  else fail('no contact address found in dist — the footer link and /privacy both promise one')
}

/* ----------------------------------------------------------------- lighthouse */
console.log('\nlighthouse (≥95 all four, per L2)')
const FLOOR = 95
for (const route of ROUTES) {
  for (const preset of ['mobile', 'desktop']) {
    const out = join(TMP, `lh-${preset}${route.replace(/\W/g, '_')}.json`)
    /* the local CLI through node, not `npx … --shell`: on Windows the shell
       splits `--chrome-flags=--headless=new --disable-gpu` on its space and
       lighthouse then writes no report and says nothing about why */
    const cli = join(root, 'node_modules', 'lighthouse', 'cli', 'index.js')
    const args = [
      cli,
      BASE + route,
      '--quiet',
      '--output=json',
      `--output-path=${out}`,
      `--chrome-flags=${CHROME_FLAGS}`,
    ]
    if (preset === 'desktop') args.push('--preset=desktop')
    spawnSync(process.execPath, args, { env: { ...process.env, CHROME_PATH: CHROME } })
    let report
    try {
      report = JSON.parse(readFileSync(out, 'utf8'))
    } catch {
      fail(`${preset} ${route} — lighthouse produced no report`)
      continue
    }
    const scores = ['performance', 'accessibility', 'best-practices', 'seo'].map((k) => [
      k,
      Math.round(report.categories[k].score * 100),
    ])
    const line = scores.map(([k, v]) => `${k.slice(0, 4)} ${v}`).join(' · ')
    const under = scores.filter(([, v]) => v < FLOOR)
    if (under.length) fail(`${preset} ${route} — ${line}`)
    else pass(`${preset} ${route} — ${line}`)
  }
}

/* Expect best-practices to read 96 rather than 100 on BOTH routes when this is
   run against a LOCAL preview: @vercel/analytics asks for
   /_vercel/insights/script.js, which only exists once the page is deployed on
   Vercel, and the 404 counts as a console error. /privacy joined / in this once
   it started counting visitors too. On the deployed page both are 100. */
console.log(failures ? `\n${failures} failure(s)\n` : '\nall gates green\n')
process.exit(failures ? 1 : 0)
