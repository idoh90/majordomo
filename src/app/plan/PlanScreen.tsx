import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { useAuthStore } from '../../core/auth/store'
import { offReason } from '../../core/sync/gate'
import { track } from '../../core/telemetry'
import { Collapsible } from '../../core/ui/Collapsible'
import { DEFAULT_SKIN, PRESET_SKIN_IDS, SKINS } from '../../core/ui/skins'
import { voice } from '../../core/voice'
import type { PlanTierCopy } from '../../core/voice/types'
import { useAuthUi } from '../authUi'
import { useWings } from '../wings'
import { usePlanUi } from './planUi'
import {
  CURRENT_PLAN,
  PRO_PRICE,
  YEARLY_PER_MONTH,
  YEARLY_SAVING_PCT,
  checkout,
  usd,
  type Cycle,
} from './plans'

/**
 * THE PLAN — the upgrade page.
 *
 * Two arrangements on one screen: Basic, which is what every estate has
 * today, and Pro. It is an OFFER and not a wall — opened from settings, closed
 * by the button, Esc, or the Basic card's own "carry on", and the app behind
 * it is untouched whichever way it closes. Nothing here gates anything.
 *
 * It sits at z-46 on purpose: above the settings page that opens it (z-45),
 * below the login door (z-50) it opens in turn when a signed-out household
 * presses the Pro button — the account has to come first, because the staff
 * need to know whose house it is.
 *
 * Every figure comes from plans.ts and every word from voice.plan. The page
 * itself only decides what is lit: which card is current, which wing and
 * preset each arrangement keeps, and which line goes under the button.
 */
export function PlanScreen() {
  const open = usePlanUi((s) => s.open)
  const setOpen = usePlanUi((s) => s.setOpen)
  const [cycle, setCycle] = useState<Cycle>('monthly')

  // Esc closes the page — unless the login door it opened is standing in front
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || useAuthUi.getState().open) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null
  const close = () => setOpen(false)
  const t = voice.plan

  return (
    <div
      className="fixed inset-0 z-[46] overflow-y-auto bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
    >
      <Atmosphere />

      <div className="relative mx-auto w-full max-w-4xl px-4 pb-[calc(48px+env(safe-area-inset-bottom))] lg:px-6">
        {/* sticky, as on the settings page: the way out is never a scroll away */}
        <header
          className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-3 px-4 pb-3 pt-[calc(14px+env(safe-area-inset-top))] lg:-mx-6 lg:px-6"
          style={{
            background: 'color-mix(in srgb, var(--color-bg) 88%, transparent)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <h1 className="font-display text-[17px] font-bold uppercase tracking-[0.24em] text-ink">
            {t.title}
          </h1>
          <button
            type="button"
            onClick={close}
            aria-label={t.close}
            className="chip ml-auto flex h-11 w-11 items-center justify-center border border-line bg-panel text-ink-dim transition-colors hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>

        <Hero cycle={cycle} onCycle={setCycle} />

        <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-2 md:gap-5">
          <BasicCard onClose={close} />
          <ProCard cycle={cycle} />
        </div>

        <Particulars />
        <Questions />

        <p className="mt-6 text-center text-[11.5px] tracking-[0.04em] text-ink-faint">{t.footnote}</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- atmosphere */

/**
 * A brass bloom at the top and a hairline field under it, fading out before
 * the cards — the landing's own two devices, at the landing's 74px pitch, so
 * the page that asks for money reads as the same object as the page that
 * introduced the house. Both are absolute inside the fixed scroller and so
 * scroll with the content; neither takes a press.
 */
function Atmosphere() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px]"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% -12%, color-mix(in srgb, var(--color-ember) 13%, transparent), transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] opacity-70"
        style={{
          backgroundImage:
            'repeating-linear-gradient(90deg, color-mix(in srgb, var(--color-line) 75%, transparent) 0 1px, transparent 1px 74px)',
          backgroundPosition: 'center top',
          maskImage: 'linear-gradient(180deg, #000 0%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 100%)',
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------- hero */

function Hero({ cycle, onCycle }: { cycle: Cycle; onCycle: (c: Cycle) => void }) {
  const t = voice.plan
  const typed = useTyped(t.intro)
  return (
    <section className="pt-5 text-center md:pt-9">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h2 className="mx-auto mt-4 max-w-2xl text-balance font-display text-[36px] font-semibold uppercase leading-[0.95] tracking-[0.04em] text-ink md:text-[54px]">
        {t.headline}
      </h2>
      {/* the finished sentence is what a screen reader gets; the typing is
          for eyes only */}
      <p
        className="mx-auto mt-4 min-h-[52px] max-w-xl text-[15px] leading-relaxed text-ink-dim md:text-[16.5px]"
        aria-label={t.intro}
      >
        <span aria-hidden>{typed.text}</span>
        {!typed.done && (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-[15px] w-1.5 animate-[brief-caret_1.06s_steps(1)_infinite] bg-ember align-[-2px]"
          />
        )}
      </p>
      <CycleToggle cycle={cycle} onCycle={onCycle} />
    </section>
  )
}

function Eyebrow({ children }: { children: ReactNode }) {
  const hair = (dir: 'r' | 'l') => ({
    background: `linear-gradient(${dir === 'r' ? '90deg' : '270deg'}, transparent, color-mix(in srgb, var(--color-ember) 70%, transparent))`,
  })
  return (
    <div className="flex items-center justify-center gap-3">
      <span aria-hidden className="h-px w-10" style={hair('r')} />
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.3em] text-ember">
        {children}
      </span>
      <span aria-hidden className="h-px w-10" style={hair('l')} />
    </div>
  )
}

/** monthly / yearly, in the house's own segmented material. The saving chip
 *  rides inside the yearly segment so the two figures are never apart. */
function CycleToggle({ cycle, onCycle }: { cycle: Cycle; onCycle: (c: Cycle) => void }) {
  const t = voice.plan
  return (
    <div className="mt-6 flex justify-center">
      <div className="seg" role="tablist" aria-label={t.cycleLabel}>
        <button
          type="button"
          role="tab"
          aria-selected={cycle === 'monthly'}
          onClick={() => onCycle('monthly')}
          className="seg-btn"
        >
          {t.cycleMonthly}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={cycle === 'yearly'}
          onClick={() => onCycle('yearly')}
          className="seg-btn gap-2"
        >
          {t.cycleYearly}
          <span
            className={`chip-tint px-1.5 py-px text-[9px] tracking-[0.12em] ${
              cycle === 'yearly' ? '' : 'text-ember'
            }`}
            style={{ '--chip-accent': 'var(--color-ember)' } as CSSProperties}
          >
            {t.cycleSave(YEARLY_SAVING_PCT)}
          </span>
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ cards */

const ACCENT_BASIC = 'var(--color-accent)'
const ACCENT_PRO = 'var(--color-ember)'

function BasicCard({ onClose }: { onClose: () => void }) {
  const t = voice.plan.basic
  const wings = useWings()
  // "one wing of your choosing" — the first the household lists stands in
  const first = wings.visible[0] ?? wings.all[0]
  return (
    <section
      className="panel flex flex-col px-5 py-6 animate-[plan-rise_460ms_var(--ease-fold-in)_both] md:px-7 md:py-8"
      aria-label={t.name}
    >
      <TierHead copy={t} current={CURRENT_PLAN === 'basic'} accent={ACCENT_BASIC} />
      <div className="mt-6 flex items-baseline gap-2.5">
        <span className="stat-num font-display text-[52px] leading-none text-ink">{t.price}</span>
        <span className="text-[13px] text-ink-dim">{t.priceNote}</span>
      </div>
      {/* the same height as the Pro card's note under its figure */}
      <p className="mt-1.5 min-h-[18px]" aria-hidden />
      <Rule />
      <Roster lit={new Set(first ? [first.id] : [])} note={t.rosterNote} stagger={false} />
      <Presets all={false} note={t.presetNote} />
      <Rule />
      <Points items={t.points} accent={ACCENT_BASIC} />
      <div className="mt-auto pt-7">
        <button type="button" onClick={onClose} className="btn-soft w-full py-3.5 text-[13px]">
          {t.cta}
        </button>
      </div>
    </section>
  )
}

function ProCard({ cycle }: { cycle: Cycle }) {
  const t = voice.plan.pro
  const ref = useRef<HTMLElement>(null)
  const status = useAuthStore((s) => s.status)
  const [notice, setNotice] = useState(false)
  const registryOpen = offReason() === null
  const signedIn = status === 'signedIn'

  // the spotlight follows the pointer through two custom properties written
  // straight onto the element — no render for a hover
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
  }

  /**
   * The button. A signed-out household is sent through the login door first
   * (the account is what a subscription hangs on); everyone else reaches the
   * till, which today says plainly that it is not open. The tap is counted
   * before either — it is the intent that matters, not where it landed.
   */
  const engage = () => {
    track('upgrade_tapped', { cycle, account: signedIn })
    if (!signedIn && registryOpen) {
      useAuthUi.getState().setOpen(true)
      return
    }
    const result = checkout(cycle)
    if (result.kind === 'notOpen') setNotice(true)
  }

  return (
    <section
      ref={ref}
      onPointerMove={onMove}
      className="panel plan-pro order-first flex flex-col px-5 py-6 animate-[plan-rise_460ms_var(--ease-fold-in)_120ms_both] md:order-none md:px-7 md:py-8"
      aria-label={t.name}
    >
      <TierHead copy={t} current={CURRENT_PLAN === 'pro'} accent={ACCENT_PRO} />
      <div className="mt-6 flex items-baseline gap-2.5">
        {/* keyed on the cycle so a change of figure rises in rather than blinks */}
        <span
          key={cycle}
          className="stat-num font-display text-[52px] leading-none text-ink animate-[plan-figure_380ms_var(--ease-fold-in)_both]"
        >
          {usd(PRO_PRICE[cycle])}
        </span>
        <span className="font-display text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-dim">
          {cycle === 'monthly' ? t.perMonth : t.perYear}
        </span>
      </div>
      <p
        key={`note-${cycle}`}
        className="mt-1.5 min-h-[18px] text-[12.5px] text-ink-faint animate-[plan-figure_380ms_var(--ease-fold-in)_both]"
      >
        {cycle === 'monthly'
          ? t.orYearly(usd(PRO_PRICE.yearly))
          : t.yearlyNote(usd(YEARLY_PER_MONTH))}
      </p>
      <Rule />
      <Roster lit="all" note={t.rosterNote} stagger />
      <Presets all note={t.presetNote} />
      <Rule />
      <Points items={t.points} accent={ACCENT_PRO} />
      <div className="mt-auto pt-7">
        <button
          type="button"
          onClick={engage}
          className="btn-cta w-full py-4 text-[14px]"
          style={
            {
              '--cta-bg': ACCENT_PRO,
              '--cta-fg': 'var(--color-bg)',
              '--cta-shadow': '0 0 24px color-mix(in srgb, var(--color-ember) 38%, transparent)',
            } as CSSProperties
          }
        >
          {t.cta}
        </button>
        <p className="mt-3 text-center text-[12px] leading-snug text-ink-faint">
          {!signedIn && registryOpen ? t.needsAccount : t.reassurance}
        </p>
        <Collapsible open={notice} innerClassName="pt-3">
          <p
            role="status"
            className="subcard border-l-2 px-3.5 py-3 text-[13px] leading-snug text-ink"
            style={{ borderLeftColor: ACCENT_PRO }}
          >
            {t.notOpen}
          </p>
        </Collapsible>
      </div>
    </section>
  )
}

/** tag, name, the butler's line */
function TierHead({
  copy,
  current,
  accent,
}: {
  copy: PlanTierCopy
  current: boolean
  accent: string
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span
          className="chip-tint px-2.5 py-1 font-display text-[10.5px] font-semibold uppercase tracking-[0.22em]"
          style={{ '--chip-accent': accent, color: accent } as CSSProperties}
        >
          {copy.tag}
        </span>
        {current && (
          <span className="chip border border-line px-2.5 py-1 font-display text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-dim">
            {voice.plan.current}
          </span>
        )}
      </div>
      <h3 className="mt-4 font-display text-[30px] font-bold uppercase leading-none tracking-[0.06em] text-ink md:text-[34px]">
        {copy.name}
      </h3>
      <p className="mt-2 text-[14.5px] italic text-ink-dim">{copy.tagline}</p>
    </>
  )
}

function Rule() {
  return <div className="my-5 h-px bg-line" />
}

// console id → wing token; the same local map TabBar and the House carry
const WING_COLOR: Record<string, string> = {
  watch: 'var(--color-w-watch)',
  training: 'var(--color-w-grounds)',
  study: 'var(--color-w-study)',
  workshop: 'var(--color-w-workshop)',
  capital: 'var(--color-w-ledger)',
}

/**
 * The five wings, in the household's own order, lit or not. Pro's light up
 * one after the next on arrival; Basic's are what they are.
 */
function Roster({
  lit,
  note,
  stagger,
}: {
  lit: Set<string> | 'all'
  note: string
  stagger: boolean
}) {
  const wings = useWings()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="card-title">{voice.plan.wingsLabel}</span>
        <span className="text-right text-[11.5px] text-ink-faint">{note}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {wings.all.map((c, i) => {
          const on = lit === 'all' || lit.has(c.id)
          const color = WING_COLOR[c.id] ?? 'var(--color-accent)'
          return (
            <span
              key={c.id}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.16em] ${
                on
                  ? `chip-tint text-ink ${stagger ? 'animate-[plan-lit_700ms_both]' : ''}`
                  : 'chip border border-line text-ink-faint opacity-60'
              }`}
              style={
                on
                  ? ({
                      '--chip-accent': color,
                      animationDelay: stagger ? `${160 + i * 90}ms` : undefined,
                    } as CSSProperties)
                  : undefined
              }
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: on ? color : 'var(--color-ink-faint)',
                  boxShadow: on ? `0 0 8px ${color}` : undefined,
                }}
              />
              {c.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** the three presets as swatches; Basic keeps the default lit and the rest dim */
function Presets({ all, note }: { all: boolean; note: string }) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="card-title">{voice.plan.presetsLabel}</span>
        <span className="text-right text-[11.5px] text-ink-faint">{note}</span>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        {PRESET_SKIN_IDS.map((id) => {
          const s = SKINS[id]
          const on = all || id === DEFAULT_SKIN
          return (
            <span
              key={id}
              title={s.name}
              className="flex h-6 w-6 items-center justify-center rounded-full border"
              style={{
                borderColor: on ? s.swatches[2] : 'var(--color-line)',
                background: s.swatches[0],
                opacity: on ? 1 : 0.45,
              }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: on ? s.swatches[2] : 'var(--color-ink-faint)',
                  boxShadow: on ? `0 0 8px ${s.swatches[2]}` : undefined,
                }}
              />
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Points({ items, accent }: { items: string[]; accent: string }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((p) => (
        <li key={p} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink">
          <span className="mt-[3px] flex-none" style={{ color: accent }}>
            <CheckIcon />
          </span>
          {p}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------ particulars */

const COLS = 'grid-cols-[1fr_74px_78px] md:grid-cols-[1fr_120px_120px]'

/** the comparison table: a row is a button, and its note folds out under it */
function Particulars() {
  const t = voice.plan
  const [openRow, setOpenRow] = useState<number | null>(null)
  return (
    <section className="panel mt-6 px-4 py-5 md:mt-8 md:px-7 md:py-7">
      <div className={`grid items-center ${COLS}`}>
        <span className="card-title">{t.particulars}</span>
        <span className="text-center font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-dim">
          {t.colBasic}
        </span>
        <span className="text-center font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-ember">
          {t.colPro}
        </span>
      </div>
      <div className="mt-2 flex flex-col">
        {t.rows.map((row, i) => {
          const on = openRow === i
          return (
            <div
              key={row.label}
              className={`-mx-2 rounded-xl border-t border-line/70 px-2 transition-colors hover:bg-ink/[0.04] ${
                on ? 'bg-ink/[0.03]' : ''
              }`}
            >
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpenRow(on ? null : i)}
                className={`grid min-h-12 w-full items-center py-1 text-left ${COLS}`}
              >
                <span className="flex items-center gap-2 text-[14px] text-ink">
                  <Chevron open={on} />
                  {row.label}
                </span>
                <Cell v={row.basic} accent="var(--color-ink-dim)" />
                <Cell v={row.pro} accent={ACCENT_PRO} />
              </button>
              <Collapsible open={on} innerClassName="pb-3.5 pl-6 pr-2 md:pr-10">
                <p className="text-[13px] leading-relaxed text-ink-dim">{row.note}</p>
              </Collapsible>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** a tick, a dash, or a word of its own */
function Cell({ v, accent }: { v: boolean | string; accent: string }) {
  const t = voice.plan
  if (typeof v === 'string') {
    return (
      <span
        className="text-center text-[11.5px] font-semibold uppercase tracking-[0.08em] md:text-[12px] md:tracking-[0.1em]"
        style={{ color: accent }}
      >
        {v}
      </span>
    )
  }
  return (
    <span
      className="flex justify-center"
      style={{ color: v ? accent : 'var(--color-ink-faint)' }}
      role="img"
      aria-label={v ? t.included : t.notIncluded}
    >
      {v ? <CheckIcon /> : <DashIcon />}
    </span>
  )
}

/* -------------------------------------------------------------- questions */

function Questions() {
  const t = voice.plan
  const [openQ, setOpenQ] = useState<number | null>(null)
  return (
    <section className="panel mt-4 px-4 py-5 md:px-7 md:py-7">
      <div className="card-title">{t.faqTitle}</div>
      <div className="mt-2 flex flex-col">
        {t.faq.map((f, i) => {
          const on = openQ === i
          return (
            <div key={f.q} className="border-t border-line/70">
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setOpenQ(on ? null : i)}
                className="flex min-h-12 w-full items-center gap-3 py-2.5 text-left"
              >
                <span className="flex-1 text-[14.5px] text-ink">{f.q}</span>
                <Chevron open={on} />
              </button>
              <Collapsible open={on} innerClassName="pb-4 pr-8">
                <p className="text-[13.5px] leading-relaxed text-ink-dim">{f.a}</p>
              </Collapsible>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- typewriter */

// only the first opening of a session types; later ones land on the line
let typedOnce = false

/**
 * Types the intro once, in the brief's cadence (a beat at the commas, a
 * longer one at a full stop). Reduced motion — or a second opening — lands
 * on the finished sentence with no motion at all.
 */
function useTyped(text: string): { text: string; done: boolean } {
  const [n, setN] = useState(() => {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return typedOnce || reduced ? text.length : 0
  })
  useEffect(() => {
    if (n >= text.length) {
      typedOnce = true
      return
    }
    const prev = text[n - 1]
    let d = 16
    if (prev === ',' || prev === ';') d += 110
    else if (prev === '.') d += 240
    const id = setTimeout(() => setN(n + 1), n === 0 ? 320 : d)
    return () => clearTimeout(id)
  }, [n, text])
  return { text: text.slice(0, n), done: n >= text.length }
}

/* ------------------------------------------------------------------ icons */

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 12h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** the fold's chevron, turning on the fold's own clock (`.chev`) */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="chev flex-none text-ink-faint"
      data-open={open}
      style={{ rotate: open ? '90deg' : '0deg' }}
    >
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
