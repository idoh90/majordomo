#!/usr/bin/env node
/**
 * The Bell's probe — stage B0's gate.
 *
 * Rings the real endpoint with a real session token, streams the reply to the
 * terminal, and prints the token counts the model actually charged against the
 * guesses in `majordomo-assistant-spec.md` Appendix C. That comparison is the
 * whole point of B0: the spec's cost model is arithmetic on estimates, and every
 * later number in it — cents per message, COGS as a share of the price, whether
 * the free tier is affordable — inherits whatever error is in them.
 *
 *   BELL_TOKEN   required — a live Supabase access token (see below)
 *   BELL_BASE    optional — default http://localhost:3000 (`vercel dev`)
 *   BELL_RUNS    optional — how many rings to take, default 1
 *
 *   node scripts/bell-probe.mjs
 *   node scripts/bell-probe.mjs "what is my week like"
 *   node scripts/bell-probe.mjs --runs=5 "what is my week like"
 *
 * To get a token: open the app, sign in, then in the browser console read the
 * access_token out of the Supabase session in localStorage. It expires in an
 * hour; that is fine, this takes seconds.
 *
 * WHY IT TAKES MORE THAN ONE SAMPLE. Reply length is stochastic and reply length
 * is the gate. One terminal full of numbers is one observation with no spread,
 * and §6's arithmetic is about to be rewritten against it. `--runs` exists so
 * "run it several times" is one command that ends in a mean rather than a
 * handful of eyeballed screens.
 *
 * Exits non-zero if the ring failed, if the meter did not record it, if the
 * reply did not end cleanly, or if the mean reply length is outside the spec's
 * ±50%. It does NOT fail on the input-token shortfall — at this stage the system
 * prompt is a persona seed with no household manual and no tool schemas, so the
 * input figure is a floor by construction, and a red cross against a number that
 * cannot be right yet teaches nothing.
 *
 * There is deliberately no offline "just count the tokens" mode. It would need a
 * second copy of the system prompt, and two copies drift — the endpoint's own
 * reply already carries the exact numbers.
 */

const BASE = (process.env.BELL_BASE ?? 'http://localhost:3000').replace(/\/$/, '')
const TOKEN = (process.env.BELL_TOKEN ?? '').trim()

/** Appendix C, the figures this stage can actually speak to. */
const EXPECTED = {
  system: 5000, // persona + household manual + tool schemas — two of three missing at B0
  userMessage: 60,
  reply: 130, // "laconic by charter" — and see the note under REPLY LENGTH below
}

/**
 * Per-million-token prices, verified against platform.claude.com/docs/en/about-claude/pricing
 * on July 31, 2026. Cache writes are 1.25x the input rate at the 5-minute TTL
 * (2x at the 1-hour TTL, which this endpoint does not ask for); cache reads are
 * 0.1x. Re-check quarterly and on every model change, exactly as §6.5 says.
 *
 * Sonnet 5 is DATED, not quarterly. Its $2/$10 is introductory and ends on
 * August 31, 2026, after which it is $3/$15 with cache at 3.75/0.30. A quarterly
 * cadence is precisely the cadence that walks past a known expiry date, so the
 * price is selected by the clock below rather than by whoever last read this
 * comment. Delete the branch once the date has passed.
 *
 * Opus 5 is priced here but is NOT in the spec's Appendix A, which lists only
 * the two Anthropic models §6.1 compares. If a decision ever rests on this row,
 * put it in Appendix A first — an unsourced number in the instrument that exists
 * to replace unsourced numbers is the one place it must not happen.
 */
const SONNET_5_INTRO_ENDS = Date.parse('2026-09-01T00:00:00Z')

const PRICES = {
  'claude-haiku-4-5': { in: 1.0, out: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  'claude-sonnet-5':
    Date.now() < SONNET_5_INTRO_ENDS
      ? { in: 2.0, out: 10.0, cacheRead: 0.2, cacheWrite: 2.5, note: 'intro pricing, ends Aug 31 2026' }
      : { in: 3.0, out: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
  'claude-opus-5': { in: 5.0, out: 25.0, cacheRead: 0.5, cacheWrite: 6.25, note: 'not in Appendix A' },
}

/**
 * Published minimum cacheable prefix, per model, from Anthropic's prompt-caching
 * documentation. A prompt shorter than this is NOT cached even when it carries
 * `cache_control`, and the API says nothing when it declines — it simply reports
 * zero on both cache counters.
 *
 * All three numbers matter to §10's third question, and the middle one was
 * missing from this project entirely until it was looked up: the repo recorded
 * 4,096 and 512 and reasoned about a choice between them, with the model that
 * sits between the two unaccounted for.
 */
const CACHE_MINIMUM = {
  'claude-haiku-4-5': 4096,
  'claude-sonnet-5': 1024,
  'claude-opus-5': 512,
}

const die = (msg) => {
  console.error(`\n  ${msg}\n`)
  process.exit(1)
}

if (!TOKEN) {
  die(
    'BELL_TOKEN is not set. The Bell answers to the household only — there is no\n' +
      '  bypass, deliberately, because the auth path is one of the things B0 exists to\n' +
      "  prove. See this file's header for how to get a token.",
  )
}

const args = process.argv.slice(2)
const runsFlag = args.find((a) => a.startsWith('--runs='))
const RUNS = Math.max(1, Number(runsFlag?.slice(7) ?? process.env.BELL_RUNS ?? 1) || 1)

const question =
  args.filter((a) => !a.startsWith('--')).join(' ') || 'Introduce yourself in one sentence.'

const pad = (s, n) => String(s).padEnd(n)
const money = (n) => (n < 0.01 ? `${(n * 100).toFixed(3)}¢` : `$${n.toFixed(4)}`)
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

/** ±50%, the spec's own tolerance for this gate. */
const withinHalf = (measured, expected) => measured >= expected * 0.5 && measured <= expected * 1.5

const priceOf = (model) => PRICES[model]

const costOf = (u, price) =>
  price
    ? (u.in * price.in +
        u.cache_read * price.cacheRead +
        u.cache_write * price.cacheWrite +
        u.out * price.out) /
      1_000_000
    : null

/* -------------------------------------------------------------------------- */
/* one ring                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Returns a record of the ring, or throws with a readable explanation.
 *
 * Wall-clock and time-to-first-token are recorded because §10's third question
 * is cost AND latency AND register, and until now this instrument measured only
 * the first of the three. §3.2 is blunt about the second: "a butler who takes
 * six silent seconds is a dead butler." A number nobody collects is a number
 * nobody can decide on.
 */
async function ring(index) {
  if (RUNS > 1) console.log(`\n  ── ring ${index + 1} of ${RUNS} ` + '─'.repeat(48))

  const startedAt = Date.now()
  let res
  try {
    res = await fetch(`${BASE}/api/bell`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: question }] }),
    })
  } catch (e) {
    die(
      `could not reach ${BASE} — ${e.message}\n\n` +
        '  Start the function runtime first: `npx vercel dev`. `npm run dev` serves the\n' +
        '  app but not api/, so the Vite port will 404 here.',
    )
  }

  if (!res.ok) {
    // Read the body ONCE, then try to make sense of it. Calling res.json() first
    // and falling back to res.text() cannot work: json() consumes the body even
    // when it throws, so the fallback throws "Body is unusable" and the operator
    // gets a stack trace in place of the one readable line this file promises.
    // It never fires against our own errors, which are all JSON — it fires on a
    // gateway 502, a function crash page, an HTML interstitial. Exactly the
    // errors nobody anticipated, which is when a diagnosis is worth most.
    const raw = await res.text()
    let detail
    try {
      detail = JSON.parse(raw).error ?? raw.slice(0, 200)
    } catch {
      detail = raw.replace(/\s+/g, ' ').trim().slice(0, 200) || '(empty body)'
    }

    const hint =
      res.status === 503 && detail.includes('not in service')
        ? '\n\n  BELL_ENABLED is not "1". The kill switch defaults to off so that deploying\n  the endpoint does not by itself arm it.'
        : res.status === 401
          ? '\n\n  The token is missing, malformed, or expired. Fetch a fresh one.'
          : res.status === 429
            ? '\n\n  The daily ceiling is spent. It is BELL_DAILY_FREE (default 5) per UTC day,\n  which a measurement run will exhaust before it proves anything — raise it in\n  .env.local for local work.'
            : res.status === 500
              ? '\n\n  Missing server env. FOUR values are required, not two: ANTHROPIC_API_KEY,\n  SUPABASE_SERVICE_ROLE_KEY, and a Supabase URL/anon-key PAIR — either both\n  unprefixed (SUPABASE_URL + SUPABASE_ANON_KEY) or both VITE_-prefixed. The\n  endpoint resolves that pair together and refuses a half-set environment.'
              : res.status === 503
                ? '\n\n  The registry did not answer, or the meter could not be read. Open the\n  Supabase dashboard before believing anything is gone — a paused free project\n  stops resolving entirely and resumes in about two minutes. If the project is\n  awake, check that 0003_bell.sql was pasted in FULL: the tables can exist while\n  the function or its grant does not.'
                : ''
    die(`HTTP ${res.status} — ${detail}${hint}`)
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let done = null
  let failure = null
  let replyChars = 0
  let firstTokenAt = null

  process.stdout.write('  ')

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true })

    let split
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)

      // Split rather than regex. JavaScript's `.` and `$` treat U+2028 and U+2029
      // as line terminators, but JSON.stringify leaves them raw in a string — so a
      // reply containing one would end the `data:` capture mid-JSON, JSON.parse
      // would throw, and the frame would vanish into the catch below with the text
      // silently missing. Only CR and LF terminate an SSE line; the endpoint is
      // right and the regex was wrong.
      const lines = frame.split('\n')
      const event = lines.find((l) => l.startsWith('event: '))?.slice(7)
      const raw = lines.find((l) => l.startsWith('data: '))?.slice(6)
      if (!event || !raw) continue

      let data
      try {
        data = JSON.parse(raw)
      } catch {
        continue
      }

      if (event === 'text') {
        firstTokenAt ??= Date.now()
        replyChars += data.text.length
        process.stdout.write(data.text.replace(/\n/g, '\n  '))
      } else if (event === 'done') {
        done = data
      } else if (event === 'error') {
        failure = data.message
      }
    }
  }

  const elapsed = Date.now() - startedAt
  console.log('\n  ' + '─'.repeat(66))

  // A ring that dies here spent real money upstream and recorded it server-side,
  // and the terminal is about to show none of it. Say so, rather than exiting on
  // a bare message that implies nothing was charged.
  if (failure)
    die(
      `the Bell reported: ${failure}\n\n` +
        '  The input was charged and the endpoint metered what it could; this terminal\n' +
        '  simply never received the numbers, because `done` only rides a clean finish.\n' +
        '  Read the row out of bell_usage for this UTC day to see what it cost.',
    )
  if (!done)
    die(
      'the stream ended without a `done` event — no usage was reported here.\n\n' +
        '  Same caveat: silence in the terminal is not zero on the bill. Check bell_usage.',
    )

  return {
    usage: done.usage,
    model: done.model,
    ending: done.ending,
    metered: done.metered,
    day: done.day,
    ringsToday: done.rings_today,
    ceiling: done.daily_ceiling,
    replyChars,
    elapsed,
    ttft: firstTokenAt ? firstTokenAt - startedAt : null,
  }
}

/* -------------------------------------------------------------------------- */
/* the measurement                                                            */
/* -------------------------------------------------------------------------- */

console.log(`\n  Ringing ${BASE}/api/bell${RUNS > 1 ? ` — ${RUNS} times` : ''}`)
console.log(`  "${question}"\n`)
console.log('  ' + '─'.repeat(66))

const rings = []
for (let i = 0; i < RUNS; i++) rings.push(await ring(i))

const last = rings[rings.length - 1]
const price = priceOf(last.model)
const expectedIn = EXPECTED.system + EXPECTED.userMessage
const promptTotalOf = (r) => r.usage.in + r.usage.cache_read + r.usage.cache_write

let failed = false

/* -------------------------------------------------------------------------- */

console.log(`\n  MEASURED — ${last.model}${price?.note ? `  (${price.note})` : ''}`)

if (RUNS === 1) {
  const u = last.usage
  console.log(`    ${pad('fresh input', 22)} ${u.in}`)
  console.log(`    ${pad('cache read', 22)} ${u.cache_read}`)
  console.log(`    ${pad('cache write', 22)} ${u.cache_write}`)
  console.log(`    ${pad('prompt total', 22)} ${promptTotalOf(last)}`)
  console.log(`    ${pad('output', 22)} ${u.out}   (${last.replyChars} chars)`)
  console.log(`    ${pad('chars per token', 22)} ${(last.replyChars / Math.max(u.out, 1)).toFixed(2)}`)
  console.log(`    ${pad('ending', 22)} ${last.ending}`)
  console.log(`    ${pad('time to first token', 22)} ${last.ttft ?? '—'} ms`)
  console.log(`    ${pad('wall clock', 22)} ${last.elapsed} ms`)
  console.log(`    ${pad('rings today', 22)} ${last.ringsToday} of ${last.ceiling} (UTC ${last.day})`)
} else {
  console.log(
    `    ${pad('#', 4)}${pad('prompt', 9)}${pad('out', 7)}${pad('chars', 8)}${pad('ttft', 9)}${pad('wall', 9)}${pad('ending', 11)}cost`,
  )
  for (const [i, r] of rings.entries()) {
    const c = costOf(r.usage, price)
    console.log(
      `    ${pad(i + 1, 4)}${pad(promptTotalOf(r), 9)}${pad(r.usage.out, 7)}${pad(r.replyChars, 8)}` +
        `${pad(`${r.ttft ?? '—'}ms`, 9)}${pad(`${r.elapsed}ms`, 9)}${pad(r.ending, 11)}${c === null ? '—' : money(c)}`,
    )
  }

  const outs = rings.map((r) => r.usage.out)
  const ttfts = rings.map((r) => r.ttft).filter((t) => t !== null)
  console.log(
    `\n    output tokens          mean ${mean(outs).toFixed(1)}   min ${Math.min(...outs)}   max ${Math.max(...outs)}`,
  )
  if (ttfts.length)
    console.log(
      `    time to first token    mean ${mean(ttfts).toFixed(0)} ms   min ${Math.min(...ttfts)}   max ${Math.max(...ttfts)}`,
    )
  console.log(`    rings today            ${last.ringsToday} of ${last.ceiling} (UTC ${last.day})`)
}

/* -------------------------------------------------------------------------- */
/* the things that must not pass quietly                                      */
/* -------------------------------------------------------------------------- */

const unmetered = rings.filter((r) => r.metered === false)
if (unmetered.length) {
  failed = true
  console.log(`\n  THE METER DID NOT RECORD ${unmetered.length} OF ${RUNS} RINGS.`)
  console.log(`    The replies arrived, so nothing is broken from where you are sitting —`)
  console.log(`    but the daily ceiling has no other source of truth, so while this keeps`)
  console.log(`    happening the endpoint serves without limit and looks healthy doing it.`)
  console.log(`    Usual cause: only part of 0003_bell.sql reached the SQL editor, so the`)
  console.log(`    table exists (the read works) but the function or its grant does not.`)
  console.log(`    Check the function logs for the exact database error.`)
  console.log(`    Note also that "rings today" above is the endpoint's arithmetic, not a`)
  console.log(`    reading from the database — with the meter broken it counts up forever`)
  console.log(`    from a row that was never written.`)
}

const unclean = rings.filter((r) => r.ending !== 'complete')
if (unclean.length) {
  failed = true
  const kinds = [...new Set(unclean.map((r) => r.ending))].join(', ')
  console.log(`\n  ${unclean.length} OF ${RUNS} RINGS DID NOT END CLEANLY — ${kinds}.`)
  if (kinds.includes('declined')) {
    console.log(`    A refusal is short, so it can sit inside the reply-length window and score`)
    console.log(`    as a pass. It is not one: B0's qualitative half is whether the register`)
    console.log(`    holds, and a declined reply is that half failing.`)
  }
  if (kinds.includes('truncated')) {
    console.log(`    Truncated means BELL_MAX_TOKENS cut the reply. Its length is then an`)
    console.log(`    artifact of the cap, not a measurement of how long the butler talks.`)
  }
  if (kinds.includes('other')) {
    console.log(`    'other' is the endpoint's word for a stop reason it does not translate.`)
    console.log(`    Read the function log for the raw upstream value before drawing anything`)
    console.log(`    from this run's numbers.`)
  }
}

/* -------------------------------------------------------------------------- */
/* cost                                                                       */
/* -------------------------------------------------------------------------- */

if (price) {
  const costs = rings.map((r) => costOf(r.usage, price))
  console.log(`\n  COST PER RING              ${money(mean(costs))}${RUNS > 1 ? '  (mean)' : ''}`)
  console.log(`    Appendix C's own plain question — the shape B0 rings — prices at 0.291¢`)
  console.log(`    once the system prompt is finished and cached. §6.2's headline 0.47¢ is a`)
  console.log(`    BLEND of half plain and half one-read-tool, and 0.65¢ is an actioned`)
  console.log(`    two-call message; neither is what this run measured. All three assume a`)
  console.log(`    cached 5,000-token prompt this stage does not have yet, and all three`)
  console.log(`    include a 900-token context pack and 800 tokens of history that B0 does`)
  console.log(`    not send — so the cost comparison and the token comparison below sit on`)
  console.log(`    different bases on purpose. Do not read one against the other.`)
} else {
  console.log(`\n  No price on file for ${last.model} — add it to PRICES in this script.`)
}

/* -------------------------------------------------------------------------- */
/* against Appendix C                                                         */
/* -------------------------------------------------------------------------- */

const meanOut = mean(rings.map((r) => r.usage.out))
const meanPrompt = mean(rings.map(promptTotalOf))
const replyOk = withinHalf(meanOut, EXPECTED.reply)

console.log(`\n  AGAINST APPENDIX C`)
console.log(
  `    reply length             ${pad(meanOut.toFixed(1), 8)} vs ${pad(EXPECTED.reply, 8)} ${replyOk ? 'within ±50%' : 'OUTSIDE ±50%'}  (window 65–195)`,
)
console.log(
  `    prompt total             ${pad(meanPrompt.toFixed(0), 8)} vs ${pad(expectedIn, 8)} floor only — see below`,
)

console.log(`\n  WHAT THIS DOES AND DOES NOT PROVE`)
console.log(`    The prompt total is a FLOOR. Appendix C's 5,000 tokens covers persona +`)
console.log(`    household manual + tool schemas; B0 ships the persona alone, so the gap`)
console.log(`    is expected and is not a failure. Re-run this after B2 (read tools) and`)
console.log(`    again after B3 (write tools) — those are the runs that can honestly`)
console.log(`    replace Appendix C with measurements.`)
console.log(`    ${RUNS} sample${RUNS === 1 ? '' : 's'} of a stochastic quantity. Reply length varies with the`)
console.log(`    question as much as with the model; a mean over one question shape is not`)
console.log(`    a mean over the butler's work. Vary the question before trusting §6.`)

/* -------------------------------------------------------------------------- */
/* caching — the paragraph §6 turns on                                        */
/* -------------------------------------------------------------------------- */

const cached = rings.some((r) => r.usage.cache_read > 0 || r.usage.cache_write > 0)
const minimum = CACHE_MINIMUM[last.model]

if (!cached) {
  console.log(`\n  CACHING DID NOT HAPPEN — and this matters more than it looks.`)
  if (minimum !== undefined && meanPrompt < minimum) {
    console.log(`    Nothing is wrong with the request. The system prompt declares`)
    console.log(`    cache_control, but ${last.model} will not cache a prefix under`)
    console.log(`    ${minimum} tokens and reports zero without complaint when it declines.`)
    console.log(`    This prompt measured ~${meanPrompt.toFixed(0)}. It is short by ~${(minimum - meanPrompt).toFixed(0)}.`)
    const wouldCache = Object.entries(CACHE_MINIMUM)
      .filter(([, m]) => meanPrompt >= m)
      .map(([m]) => m)
    console.log(
      `    Models that WOULD cache a prompt this size: ${wouldCache.length ? wouldCache.join(', ') : 'none — it is below every published minimum (Opus 5 512, Sonnet 5 1024, Haiku 4.5 4096)'}.`,
    )
    console.log(`    So changing the model does not buy caching at this prompt size, and any`)
    console.log(`    advice to move to a cheaper-cache model is inoperative until the prompt`)
    console.log(`    grows. Moving UP a tier to buy a lower threshold is worse than the`)
    console.log(`    problem: on Appendix C's finished ring, Opus-with-cache costs about`)
    console.log(`    twice Haiku-with-no-cache, and five times Haiku-with-cache.`)
    console.log(`\n    THE RISK THAT ACTUALLY REMAINS, once the prompt is finished:`)
    console.log(`    Appendix C budgets 5,000 tokens, which clears Haiku's 4,096 by only 22% —`)
    console.log(`    and Appendix C says its figures are "deliberately on the generous side of`)
    console.log(`    small". If the real prompt lands under 4,096, caching silently stops and`)
    console.log(`    §6's dominant input term goes from 0.1x to 1x with nothing in the logs to`)
    console.log(`    say so. Sonnet 5's minimum is 1,024 and Opus 5's is 512, so that band —`)
    console.log(`    roughly 1,024 to 4,096 — is the one place where moving model genuinely`)
    console.log(`    buys the discount. Measure the finished prompt at B2/B3 and decide §10's`)
    console.log(`    third question then, with the number in hand.`)
  } else if (minimum !== undefined) {
    console.log(`    THIS IS AN ANOMALY, not the expected short-prompt case. The prompt`)
    console.log(`    measured ~${meanPrompt.toFixed(0)} tokens, which clears ${last.model}'s`)
    console.log(`    published ${minimum}-token minimum — so it should have cached and did not.`)
    console.log(`    Check that cache_control is still on the system block, that the prefix is`)
    console.log(`    byte-identical between rings, and that nothing above it varies per request.`)
  } else {
    console.log(`    No published cache minimum on file for ${last.model} — add it to`)
    console.log(`    CACHE_MINIMUM in this script before reasoning about the cost.`)
  }
} else {
  const writes = rings.filter((r) => r.usage.cache_write > 0).length
  const reads = rings.filter((r) => r.usage.cache_read > 0).length
  console.log(`\n  CACHING HAPPENED — ${writes} write${writes === 1 ? '' : 's'}, ${reads} read${reads === 1 ? '' : 's'}.`)
  console.log(`    A write costs 1.25x the input rate and a read costs 0.1x, so the first ring`)
  console.log(`    of a sitting is MORE expensive than an uncached one and every ring after it`)
  console.log(`    within the 5-minute TTL is far cheaper. A one-message sitting is a net loss`)
  console.log(`    on caching; §6's per-user figures assume sittings, not single questions.`)
  console.log(`    Check that assumption against how the Bell is actually used before B6.`)
}

/* -------------------------------------------------------------------------- */
/* the verdict                                                                */
/* -------------------------------------------------------------------------- */

if (!replyOk) {
  failed = true
  const short = meanOut < EXPECTED.reply
  console.log(`\n  REPLY LENGTH IS OUTSIDE ±50% OF THE SPEC'S ESTIMATE.`)
  if (short) {
    console.log(`    It came in SHORT, and the likeliest reading is that Appendix C is wrong`)
    console.log(`    rather than the endpoint. 130 tokens is roughly 98 words — six to eight`)
    console.log(`    sentences — while the system prompt instructs "one or two sentences`)
    console.log(`    unless more is genuinely required", which is 25 to 35 tokens. Those two`)
    console.log(`    documents cannot both be right, and B0 is the stage that decides which.`)
    console.log(`    Reaching for BELL_MAX_TOKENS will not help: it caps from above.`)
    console.log(`    If it holds across questions, it is GOOD news for §6 — output is the`)
    console.log(`    expensive side at 5x input, so a laconic butler is cheaper than modelled`)
    console.log(`    and §6.4's 4.8%-of-MRR has more headroom, not less.`)
  } else {
    console.log(`    It came in LONG. Check the ending column above: a 'truncated' run is the`)
    console.log(`    cap talking, not the butler. If the endings are clean, the register's`)
    console.log(`    brevity instruction is not landing and that is a prompt problem — and an`)
    console.log(`    expensive one, since output bills at 5x input.`)
  }
  console.log(`    Either way, vary the question and re-run before rewriting §6's arithmetic.`)
}

if (failed) {
  console.log(`\n  Gate NOT passed.\n`)
  process.exit(1)
}

console.log(`\n  Gate passed on ${RUNS} sample${RUNS === 1 ? '' : 's'} of one question shape.\n`)
