import { useEffect, useMemo, useRef, useState } from 'react'
import { voice } from '../../../core/voice'
import type { BriefFacts, DialId } from '../../../core/voice/types'
import { Hinted } from '../../../core/ui/Hint'
import { useBriefFacts } from './facts'
import { useDials, type Dial } from './dials'
import { Instrument } from './Instrument'
import { AREA_GROUPS, Pen } from './Pen'
import { areaOn, useBriefPrefs } from './prefs'

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const HASH_KEY = 'majordomo-brief-hash'

interface Segment {
  color: string
  text: string
}

/** djb2 — enough to tell "the brief changed" from "the brief did not" */
function hash(t: string): string {
  let h = 5381
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0
  return String(h)
}

/** compose the brief: greeting, one paragraph per wing, sign-off */
function compose(
  facts: BriefFacts,
  areas: Parameters<typeof areaOn>[0],
  counsel: boolean,
): Segment[] {
  const V = voice.briefing.brief
  const ink = 'var(--color-ink)'
  const segs: Segment[] = [{ color: ink, text: `${V.greeting(facts.hour)} ` }]
  let anyWing = false

  for (const g of AREA_GROUPS) {
    let t = ''
    for (const id of g.areas) {
      if (!areaOn(areas, id)) continue
      const line = V.line[id](facts)
      if (!line) continue
      t += `${line} `
      if (counsel) {
        const c = V.counsel[id](facts)
        if (c) t += `${c} `
      }
    }
    if (t) {
      anyWing = true
      segs.push({
        color: `color-mix(in srgb, ${g.color} 72%, var(--color-ink))`,
        text: `${t.trimEnd()}\n\n`,
      })
    }
  }

  segs.push({ color: ink, text: anyWing ? V.closing.quiet : V.closing.silent })
  return segs
}

/**
 * THE BRIEFING — the Manor's written brief, four instruments, and the shelf.
 *
 * This replaces the accordion of one row per wing. The wings still own their
 * own figures (this calls the very hooks their panels call), but the reader is
 * given a paragraph rather than four folds, and four charts they can swap.
 *
 * Two rules the implementation leans on:
 *
 * - The brief TYPES ONCE. It animates on the first render of a session where
 *   the text differs from the last one this browser saw; every later change —
 *   an hour turning over, a strain figure rounding differently — swaps in
 *   silently. Retyping a paragraph under someone mid-read is not charm.
 * - The house picks the four dials until the reader places one. From that
 *   moment the board is theirs and nothing re-ranks it; a pick that no longer
 *   has data behind it is quietly replaced from the house's own order, since
 *   the alternative is an empty frame.
 */
export function TheBriefing() {
  const facts = useBriefFacts()
  const dials = useDials(facts)
  const areas = useBriefPrefs((s) => s.areas)
  const counsel = useBriefPrefs((s) => s.counsel)
  const picks = useBriefPrefs((s) => s.picks)
  const place = useBriefPrefs((s) => s.place)

  const [penOpen, setPenOpen] = useState(false)
  const [pending, setPending] = useState<DialId | null>(null)
  const V = voice.briefing.brief

  const segments = useMemo(() => compose(facts, areas, counsel), [facts, areas, counsel])
  const text = useMemo(() => segments.map((s) => s.text).join(''), [segments])

  const { typed, typing, finish } = useTypewriter(text)

  // the stamp is when this brief was written, not what o'clock it is
  const [writtenAt, setWrittenAt] = useState(() => new Date())
  const lastText = useRef(text)
  useEffect(() => {
    if (lastText.current === text) return
    lastText.current = text
    setWrittenAt(new Date())
  }, [text])

  const board = useMemo(() => resolveBoard(dials, picks), [dials, picks])
  const shelf = useMemo(
    () => dials.filter((d) => !board.some((b) => b.id === d.id)),
    [dials, board],
  )
  const pendingDial = pending ? (dials.find((d) => d.id === pending) ?? null) : null

  /**
   * The instruments are held as a MEMOISED ELEMENT, not merely as memoised
   * data. The typewriter sets state once per character — some seven hundred
   * times for a full brief — and without this every one of those re-rendered
   * four charts and a sixteen-plate body map along with the paragraph. React
   * skips a subtree whose element is identity-equal, so the board is now built
   * when the board changes and at no other time.
   */
  const instruments = useMemo(
    () => (
      <Instruments
        board={board}
        shelf={shelf}
        pendingDial={pendingDial}
        onPick={setPending}
        onPlace={(slot) => {
          if (!pendingDial) return
          place(
            board.map((b) => b.id),
            slot,
            pendingDial.id,
          )
          setPending(null)
        }}
      />
    ),
    [board, shelf, pendingDial, place],
  )

  return (
    <section className="panel panel-lit mt-4">
      <div className="relative px-4 pt-3.5 sm:px-5">
        <Hinted tip={voice.hints.house.briefingLedger}>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[9px] border border-accent/55 bg-accent/12 font-display text-[15px] font-bold text-accent"
            style={{ boxShadow: '0 0 14px var(--glow-accent)' }}
          >
            M
          </span>
          <span className="card-title">{voice.briefing.label}</span>
          {typing && (
            <button
              type="button"
              onClick={finish}
              className="inline-flex flex-none items-center rounded-pill border border-accent/40 bg-accent/15 px-2.5 py-[3px] font-display text-[9.5px] font-semibold tracking-[0.18em] text-accent transition-colors hover:text-ink"
            >
              {V.skip}
            </button>
          )}
          <span className="ml-auto hidden truncate text-[9.5px] uppercase tracking-[0.14em] text-ink-faint [font-variant-numeric:tabular-nums] sm:block">
            {V.stamp({
              time: `${String(writtenAt.getHours()).padStart(2, '0')}:${String(writtenAt.getMinutes()).padStart(2, '0')}`,
              day: DAYS[writtenAt.getDay()],
            })}
          </span>
          <button
            type="button"
            onClick={() => setPenOpen((x) => !x)}
            aria-expanded={penOpen}
            className="ml-auto inline-flex flex-none items-center gap-1.5 rounded-pill border border-accent/40 bg-accent/15 px-3 py-1 font-display text-[9.5px] font-semibold tracking-[0.18em] text-accent transition-colors hover:text-ink sm:ml-3"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M4 16l1.6-4.6L13 4l3 3-7.4 7.4L4 16Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="M11.4 5.6l3 3" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {V.penButton}
          </button>
        </div>
        </Hinted>
        {penOpen && <Pen onClose={() => setPenOpen(false)} />}
      </div>

      {/* Pressing anywhere in the paragraph finishes the typing. Deliberately
          NOT a <button>: wrapping prose in one costs the reader the ability to
          select it, and SKIP in the header is the control that keyboards and
          screen readers actually need. */}
      <div
        onClick={typing ? finish : undefined}
        className={`px-4 pb-5 pt-3.5 sm:px-5 sm:pl-[62px] ${typing ? 'cursor-pointer' : ''}`}
      >
        <p className="max-w-[960px] whitespace-pre-line text-[15.5px] leading-[1.75] text-ink [text-wrap:pretty] sm:text-[16.5px]">
          {sliceSegments(segments, typed).map((s, i) => (
            <span key={i} style={{ color: s.color }}>
              {s.text}
            </span>
          ))}
          {typing && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[17px] w-2 animate-[brief-caret_1.06s_steps(1)_infinite] align-[-2px]"
              style={{
                background: 'var(--color-accent)',
                boxShadow: '0 0 10px var(--glow-accent)',
              }}
            />
          )}
        </p>
      </div>

      {instruments}
    </section>
  )
}

/** THE INSTRUMENTS and the shelf — the half of the briefing that has nothing
 *  to do with the typing, kept in its own component so it can be skipped. */
function Instruments({
  board,
  shelf,
  pendingDial,
  onPick,
  onPlace,
}: {
  board: Dial[]
  shelf: Dial[]
  pendingDial: Dial | null
  onPick: (id: DialId | null) => void
  onPlace: (slot: number) => void
}) {
  const V = voice.briefing.brief
  if (board.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-2.5 border-t border-line px-4 pt-3 sm:px-5">
        <span className="card-title">{V.instruments.title}</span>
        <span className="ml-auto hidden text-[10.5px] italic text-ink-faint sm:block">
          {V.instruments.sub}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 px-4 pb-1 pt-3 sm:px-5 md:grid-cols-2">
        {board.map((d, slot) => (
          <Instrument
            key={d.id}
            dial={d}
            pendingLabel={pendingDial ? pendingDial.name : null}
            onPlace={() => onPlace(slot)}
          />
        ))}
      </div>

      {shelf.length > 0 && (
        <div className="px-4 pb-4 pt-1.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-[7px]">
            <span className="flex-none font-display text-[9px] font-semibold tracking-[0.18em] text-ink-faint">
              {V.shelf.title}
            </span>
            {shelf.map((d) => {
              const on = pendingDial?.id === d.id
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onPick(on ? null : d.id)}
                  aria-pressed={on}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 py-[3px] font-display text-[10px] font-semibold tracking-[0.14em] transition-[filter] hover:brightness-125"
                  style={{
                    borderColor: `color-mix(in srgb, ${d.color} ${on ? 90 : 38}%, transparent)`,
                    background: `color-mix(in srgb, ${d.color} ${on ? 22 : 9}%, transparent)`,
                    color: on
                      ? 'var(--color-ink)'
                      : `color-mix(in srgb, ${d.color} 62%, var(--color-ink-dim))`,
                  }}
                >
                  <span
                    aria-hidden
                    className="h-[5px] w-[5px] rounded-full"
                    style={{ background: d.color }}
                  />
                  {d.name}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[10px] italic text-ink-faint">
            {pendingDial ? V.shelf.picking(pendingDial.name) : V.shelf.note}
          </p>
        </div>
      )}
    </>
  )
}

/** the four on the board: the reader's picks where they still have data, the
 *  house's own order filling any hole */
function resolveBoard(dials: Dial[], picks: DialId[] | null): Dial[] {
  const byId = new Map(dials.map((d) => [d.id, d]))
  const chosen: Dial[] = []
  for (const id of picks ?? []) {
    const d = byId.get(id)
    if (d && !chosen.includes(d)) chosen.push(d)
  }
  for (const d of dials) {
    if (chosen.length >= 4) break
    if (!chosen.includes(d)) chosen.push(d)
  }
  return chosen.slice(0, 4)
}

/** the first `n` characters of the brief, keeping each wing's colour */
function sliceSegments(segments: Segment[], n: number): Segment[] {
  const out: Segment[] = []
  let off = 0
  for (const s of segments) {
    const take = Math.max(0, Math.min(s.text.length, n - off))
    off += s.text.length
    if (take > 0) out.push({ color: s.color, text: s.text.slice(0, take) })
    if (off >= n) break
  }
  return out
}

/**
 * Types the brief out once. `instant` covers three cases that all mean the
 * same thing — the reader has seen this brief, the machine has been asked not
 * to animate, or the text changed after the first pass — and each of them
 * lands on the finished paragraph with no motion at all.
 */
function useTypewriter(text: string) {
  const [typed, setTyped] = useState(0)
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // only the FIRST composition of a session may animate; later rewrites are
  // silent, so a paragraph never re-types under someone reading it
  const started = useRef(false)

  useEffect(() => {
    if (started.current) {
      setTyped(text.length)
      setDone(true)
      return
    }
    started.current = true

    const h = hash(text)
    let seen = false
    try {
      seen = localStorage.getItem(HASH_KEY) === h
    } catch {
      // blocked storage — treat as unseen and type it out
    }
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const remember = () => {
      try {
        localStorage.setItem(HASH_KEY, h)
      } catch {
        // nothing to do; the brief simply types again next time
      }
    }

    if (seen || reduced || text.length === 0) {
      setTyped(text.length)
      setDone(true)
      remember()
      return
    }

    setTyped(0)
    setDone(false)
    let i = 0
    const step = () => {
      if (i >= text.length) {
        setTyped(text.length)
        setDone(true)
        remember()
        return
      }
      const prev = text[i - 1]
      let d = 14
      if (prev === ',' || prev === ';') d += 100
      else if (prev === '.' || prev === '—') d += 220
      else if (prev === '\n') d += 360
      i += 1
      setTyped(i)
      timer.current = setTimeout(step, d)
    }
    timer.current = setTimeout(step, 240)
  }, [text])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const finish = () => {
    if (timer.current) clearTimeout(timer.current)
    setTyped(text.length)
    setDone(true)
    try {
      localStorage.setItem(HASH_KEY, hash(text))
    } catch {
      // see above
    }
  }

  return { typed, typing: !done && typed < text.length, finish }
}
