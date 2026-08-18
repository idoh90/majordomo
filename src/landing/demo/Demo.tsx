import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { voice } from '../voice'
import {
  CHAOS_MS,
  NOW_HOUR,
  RESET_MS,
  RULER,
  SNAP_MS,
  STOP_MS,
  TODAY,
  WEEK,
  type Beat,
  type Block,
} from './week'
import './demo.css'

/* ---------------------------------------------------------------------------
   The demo — a week coming to order, and then the butler walking it.

   It is decoration: aria-hidden, and the caption underneath carries its whole
   meaning for anyone who cannot see it. It runs only after the visitor has
   begun moving through the page, only while it is on screen, and only if they
   have not asked for less motion.
--------------------------------------------------------------------------- */

const WING_TOKEN: Record<Block['wing'], string> = {
  watch: 'var(--color-w-watch)',
  grounds: 'var(--color-w-grounds)',
  study: 'var(--color-w-study)',
  /* the Ledger's own token, which happens to be the brass. It earns its place
     here — a client meeting is money, and this is product imagery, where the
     wing colours are data. */
  ledger: 'var(--color-w-ledger)',
  rest: 'var(--color-ink-dim)',
  /* coffee, lunch, the commute: present, quiet, never announced */
  plain: 'var(--color-ink-faint)',
}

/** any sign the visitor has begun moving through the page */
const MOVES = ['scroll', 'wheel', 'touchstart', 'keydown', 'pointerdown'] as const

const WIDE = '(min-width: 768px)'

type Stop = { beat: Beat; day: number | null; at: number }

/** Which columns are actually on screen, and therefore which days he can walk.
    At 390px only TUE–FRI are rendered, so a seven-stop tour would spend three
    of them talking about a column nobody can see. */
function visibleDays(wide: boolean): number[] {
  return WEEK.map((d, i) => (wide || !d.wide ? i : -1)).filter((i) => i >= 0)
}

function timeline(days: number[]): { stops: Stop[]; loop: number } {
  const stops: Stop[] = [
    { beat: 'chaos', day: null, at: 0 },
    { beat: 'snap', day: null, at: CHAOS_MS },
  ]
  const tourStart = CHAOS_MS + SNAP_MS
  days.forEach((day, i) => stops.push({ beat: 'tour', day, at: tourStart + i * STOP_MS }))
  const end = tourStart + days.length * STOP_MS
  stops.push({ beat: 'reset', day: null, at: end })
  return { stops, loop: end + RESET_MS }
}

function useTimeline() {
  const ref = useRef<HTMLDivElement>(null)
  /* The still everyone starts from: the week in order, the butler mid-sentence
     over Wednesday. It is the only frame reduced-motion and no-JavaScript
     visitors ever see, and it is the good one. */
  const [beat, setBeat] = useState<Beat>('tour')
  const [day, setDay] = useState<number>(TODAY)
  const [wide, setWide] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia(WIDE)
    const sync = () => setWide(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)')
    const { stops, loop: loopMs } = timeline(visibleDays(wide))

    let timers: number[] = []
    let loop = 0
    let onScreen = false
    /* The demo waits for the first scroll, which is exactly what it is for:
       the instrument is the thing revealed BY that scroll. On a phone the
       trough peeks over the fold while the hero is still being read, and forty
       blocks scattering and reassembling there is main-thread work spent
       animating something nobody has looked at. Once the visitor has moved, it
       never waits again. */
    let moved = false

    const clear = () => {
      timers.forEach(clearTimeout)
      timers = []
      clearInterval(loop)
    }

    const play = () => {
      timers = []
      stops.forEach((s) => {
        timers.push(
          window.setTimeout(() => {
            setBeat(s.beat)
            if (s.day !== null) setDay(s.day)
          }, s.at),
        )
      })
    }

    const start = () => {
      clear()
      if (calm.matches) {
        setBeat('tour')
        setDay(TODAY)
        return
      }
      if (!moved) return
      play()
      loop = window.setInterval(play, loopMs)
    }

    const onMove = () => {
      if (moved) return
      moved = true
      MOVES.forEach((e) => window.removeEventListener(e, onMove))
      if (onScreen) start()
    }
    MOVES.forEach((e) => window.addEventListener(e, onMove, { passive: true }))

    /* The preference is a live setting, not a fact recorded at page load.
       Someone who reaches for it mid-page is asking for the motion to stop NOW
       — which is exactly the moment it is bothering them. */
    const onCalmChange = () => {
      if (calm.matches) {
        clear()
        setBeat('tour')
        setDay(TODAY)
      } else if (onScreen) start()
    }
    calm.addEventListener('change', onCalmChange)

    /* Off-screen the timeline stops entirely. A twenty-second loop ticking
       behind the fold is pure battery on a phone, which is where this is read.
       Half of it, not a quarter: at 390×844 the trough peeks about 46% over
       the fold at rest, and a quarter-threshold would call that "on screen". */
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        if (onScreen) start()
        else {
          clear()
          setBeat('tour')
          setDay(TODAY)
        }
      },
      { threshold: 0.5 },
    )
    io.observe(node)

    const onHide = () => {
      if (document.hidden) clear()
      else if (onScreen) start()
    }
    document.addEventListener('visibilitychange', onHide)

    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', onHide)
      calm.removeEventListener('change', onCalmChange)
      MOVES.forEach((e) => window.removeEventListener(e, onMove))
      clear()
    }
  }, [wide])

  return { beat, day, ref }
}

/** Types on word by word without ever breaking a word across a line: each word
    is an inline-block, each letter fades on its own beat.

    The letters exist only after mount. Splitting a ninety-character sentence
    into ninety styled spans is a hundred nodes with inline custom properties,
    and shipping that in the prerendered document costs bytes to download,
    nodes to hydrate and layout to do — all before the headline has painted, on
    the phone this page is read on. The server and the first client render both
    emit the plain sentence, which is also exactly what a reduced-motion or
    no-JavaScript visitor should get. */
function TypedLine({ text, live }: { text: string; live: boolean }) {
  if (!live) return <>{text}</>
  let i = 0
  return (
    <>
      {text.split(/(\s+)/).map((word, w) => (
        <span className="dw-word" key={w}>
          {[...word].map((ch, c) => (
            <span className="dw-char" key={c} style={{ '--c': i++ } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </>
  )
}

function BlockView({ block }: { block: Block }) {
  const accent = WING_TOKEN[block.wing]
  const style = {
    '--booked-accent': accent,
    '--sx': `${block.scatter[0]}px`,
    '--sy': `${block.scatter[1]}px`,
    '--sr': `${block.scatter[2]}deg`,
    '--i': block.order,
  } as React.CSSProperties

  const classes = [
    'dw-block booked',
    block.minor ? 'dw-minor booked-dim px-1 py-[2px]' : 'px-1.5 py-1 md:px-2',
    block.cutAfter && 'booked-cut-after',
    block.cutBefore && 'booked-cut-before',
    block.hatch && 'booked-hatch booked-dim',
    /* what has already happened drops back — which is what makes the week read
       from left to right instead of as one flat wall */
    block.past && !block.hatch && !block.minor && 'booked-dim',
    block.focus && 'dw-live booked-glow',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={{
        ...style,
        top: `calc(var(--pxh) * ${block.start})`,
        height: `calc(var(--pxh) * ${block.end - block.start})`,
      }}
    >
      <div className={block.minor ? undefined : 'dw-jitter'}>
        <div
          className={
            block.minor
              ? 'font-display text-[7.5px] leading-none font-semibold tracking-[0.08em] whitespace-nowrap text-ink-dim md:text-[9px]'
              : 'font-display text-[9px] leading-tight font-semibold tracking-[0.08em] whitespace-nowrap md:text-[10.5px] md:tracking-[0.1em]'
          }
          style={
            block.minor
              ? undefined
              : { color: block.hatch ? 'var(--color-ink-dim)' : 'var(--color-ink)' }
          }
        >
          {block.label}
          {block.sub && block.subInline && (
            <span className="hidden font-normal text-ink-dim md:inline"> {block.sub}</span>
          )}
        </div>
        {block.sub && !block.subInline && !block.minor && (
          <div className="text-[8.5px] leading-tight tabular-nums whitespace-nowrap text-ink-dim md:text-[9.5px]">
            {/* the phone gets the short form where one exists, and nothing
                where it does not — a clipped half-line reads as a bug */}
            {block.subShort && <span className="md:hidden">{block.subShort}</span>}
            <span className="hidden md:inline">{block.sub}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Demo() {
  const { beat, day, ref } = useTimeline()
  const railRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLDivElement>(null)
  const cols = useRef<(HTMLDivElement | null)[]>([])
  /* one frame of "nothing typed" between stops, so each day's line types
     itself on rather than swapping in whole */
  const [typing, setTyping] = useState(true)
  /* false through the server render and the first client render, so the
     document ships one sentence rather than ninety spans */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  /* Where he stands. Measured from the real columns rather than computed from
     the flex maths, so it stays exact through any breakpoint, font swap or
     container width — and applied as a transform, so nothing reflows.

     The chip clamps to the trough; the pointer does not. On a phone the chip
     is wider than a column and simply cannot move, so the pointer alone says
     which day he is talking about — which is the whole signal anyway. */
  const place = useCallback(() => {
    const rail = railRef.current
    const chip = chipRef.current
    const col = cols.current[day]
    if (!rail || !chip || !col) return
    const centre = col.offsetLeft + col.offsetWidth / 2
    const room = rail.offsetWidth - chip.offsetWidth
    const x = Math.max(0, Math.min(centre - chip.offsetWidth / 2, Math.max(0, room)))
    chip.style.setProperty('--tx', `${x}px`)
    chip.style.setProperty('--px', `${centre - x}px`)
  }, [day])

  useLayoutEffect(() => {
    place()
    setTyping(false)
    const id = requestAnimationFrame(() => setTyping(true))
    return () => cancelAnimationFrame(id)
  }, [day, place])

  useEffect(() => {
    const rail = railRef.current
    if (!rail || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(place)
    ro.observe(rail)
    return () => ro.disconnect()
  }, [place])

  return (
    <div
      ref={ref}
      className="dw trough relative p-3 sm:p-5 md:p-7"
      data-beat={beat}
      data-typing={typing ? '1' : '0'}
      aria-hidden="true"
    >
      <CornerTicks />

      {/* the app's own chrome, so a paused frame reads as a screenshot */}
      <div className="mb-3 flex items-center gap-3 md:mb-4">
        <span className="font-display text-[10px] font-bold tracking-[0.3em] text-ink md:text-xs">
          {voice.demo.appLabel}
        </span>
        <div className="hidden items-center gap-[3px] rounded-md border border-line bg-panel p-[2px] sm:inline-flex">
          <span className="rounded-[5px] bg-panel-2 px-2.5 py-[3px] text-[9.5px] tracking-[0.14em] text-ink">
            {voice.demo.viewWeek}
          </span>
          <span className="rounded-[5px] px-2.5 py-[3px] text-[9.5px] tracking-[0.14em] text-ink-dim">
            {voice.demo.viewMonth}
          </span>
        </div>
        <span className="ml-auto text-[9px] tracking-[0.16em] tabular-nums text-ink-dim md:text-[10px]">
          {voice.demo.week}
        </span>
      </div>

      {/* The butler's rail. Its height is fixed so that his arriving, leaving
          and changing his mind about the length of a sentence never moves the
          calendar underneath him by a pixel. */}
      <div ref={railRef} className="relative h-[74px] md:h-[62px]">
        <div ref={chipRef} className="dw-chip absolute top-0 left-0 flex w-full max-w-[380px] items-start gap-2 rounded-[10px] border border-line bg-panel-2/95 px-3 py-2">
          <span className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-accent font-display text-[9.5px] font-bold text-accent">
            M
          </span>
          <span className="text-[10.5px] leading-snug text-ink md:text-[11.5px]">
            <TypedLine key={day} text={voice.demo.brief[day]} live={mounted} />
          </span>
          {/* the nib under him, pointing at the column he is standing over */}
          <span className="dw-nib" />
        </div>
      </div>

      {/* day headers */}
      <div className="flex gap-[5px] md:gap-1.5">
        <div className="w-[34px] shrink-0 md:w-10" />
        {WEEK.map((d, i) => (
          <div
            key={d.label}
            data-active={i === day ? '' : undefined}
            className={`dw-head min-w-0 flex-1 pb-1.5 text-center font-display text-[9px] font-semibold tracking-[0.14em] tabular-nums text-ink-dim md:pb-2 md:text-[10.5px] md:tracking-[0.18em] ${
              d.wide ? 'hidden md:block' : ''
            }`}
          >
            {d.label}
          </div>
        ))}
      </div>

      {/* the week */}
      <div className="dw-grid relative flex gap-[5px] md:gap-1.5">
        <div className="relative w-[34px] shrink-0 md:w-10">
          {RULER.map((t) => (
            <div
              key={t.h}
              className="absolute right-1.5 -translate-y-1/2 text-[8.5px] tabular-nums md:right-2 md:text-[9px]"
              style={{
                top: `calc(var(--pxh) * ${t.h})`,
                /* the app colours its midnight ticks with the accent — the
                   seam is the one hour on the rail that means something */
                color: t.h % 24 === 0 ? 'var(--color-accent)' : 'var(--color-ink-dim)',
              }}
            >
              {t.label}
            </div>
          ))}
        </div>

        {WEEK.map((d, i) => (
          <div
            key={d.label}
            ref={(el) => {
              cols.current[i] = el
            }}
            data-active={i === day ? '' : undefined}
            className={`dw-col relative min-w-0 flex-1 rounded-md border border-line/60 ${
              d.wide ? 'hidden md:block' : ''
            }`}
          >
            {d.blocks.map((b) => (
              <BlockView key={b.id} block={b} />
            ))}
          </div>
        ))}

        <div
          className="dw-now pointer-events-none absolute right-0 left-[39px] md:left-[46px]"
          style={{ top: `calc(var(--pxh) * ${NOW_HOUR})` }}
        >
          {/* in the hour gutter, not on the grid: inside the first column it
              lands on top of whatever Monday happens to be doing at 16:30 */}
          <span className="absolute -top-1.5 -left-[33px] text-[8.5px] tabular-nums text-danger md:-left-[40px]">
            {voice.moment.time}
          </span>
        </div>
      </div>
    </div>
  )
}

/* Brass corner ticks: the estate's engineering aesthetic, and the page's one
   permitted brass rule system outside the word and the CTA. */
function CornerTicks() {
  const base = 'pointer-events-none absolute h-3 w-3'
  const c = 'color-mix(in srgb, var(--color-ember) 50%, transparent)'
  return (
    <>
      <span
        className={`${base} -top-px -left-px`}
        style={{ borderLeft: `1px solid ${c}`, borderTop: `1px solid ${c}` }}
      />
      <span
        className={`${base} -top-px -right-px`}
        style={{ borderRight: `1px solid ${c}`, borderTop: `1px solid ${c}` }}
      />
      <span
        className={`${base} -bottom-px -left-px`}
        style={{ borderLeft: `1px solid ${c}`, borderBottom: `1px solid ${c}` }}
      />
      <span
        className={`${base} -right-px -bottom-px`}
        style={{ borderRight: `1px solid ${c}`, borderBottom: `1px solid ${c}` }}
      />
    </>
  )
}
