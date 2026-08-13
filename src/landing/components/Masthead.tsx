import { voice } from '../voice'

/* The mark, small and dim, top-left — it shrinks so the headline can BE the
   wordmark. No nav bar: navigation is the other classic conversion killer, and
   there is nowhere else to go. */
export default function Masthead() {
  return (
    <header className="relative mx-auto flex max-w-[1100px] items-center px-5 pt-6 sm:px-8">
      <span className="font-display text-[10px] font-semibold tracking-[0.32em] text-ink-dim sm:text-[11px] sm:tracking-[0.34em]">
        {voice.masthead.wordmark}
      </span>
      {/* a tracked all-caps kicker carrying a year — the display face, per the
          type rules, same as the wordmark it sits opposite */}
      <span className="ml-auto font-display text-[10px] font-semibold tracking-[0.2em] tabular-nums text-ink-dim sm:text-[11px] sm:tracking-[0.22em]">
        {voice.masthead.status}
      </span>
    </header>
  )
}
