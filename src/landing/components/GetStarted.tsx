import { useEffect, useState } from 'react'
import { hasEstate } from '../arrival'
import { voice } from '../voice'
import { enterApp } from '../enterApp'

/* ---------------------------------------------------------------------------
   The one button. It replaced the waitlist form the day the doors opened: the
   only thing between a visitor and the estate is the app chunk downloading,
   so the three states are the whole story — idle, fetching, line down.

   It has a fourth reader now: the resident who followed the app's own link
   back here to look at the page again. The button does exactly what it always
   did — boots his estate in place — but "set up in under a minute" is a
   promise to a stranger, and he is not one.

   That question is asked in an EFFECT, never during render. This page is
   prerendered and hydrated, and the build-time markup cannot know whose
   browser it lands in; deciding the copy on the first render would mismatch
   hydration on every visit that has an estate. The cost is that the resident's
   words arrive a frame late, which is the correct thing to trade away.
--------------------------------------------------------------------------- */
export default function GetStarted({ placement }: { placement: 'hero' | 'footer' }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const [resident, setResident] = useState(false)

  useEffect(() => setResident(hasEstate()), [])

  return (
    <div data-placement={placement}>
      <button
        type="button"
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy')
          enterApp().catch(() => setState('error'))
        }}
        className="btn-cta h-[54px] w-full px-[30px] text-[15px] whitespace-nowrap sm:h-[52px] sm:w-auto"
      >
        {resident ? voice.cta.residentButton : voice.cta.button}
      </button>
      {/* One live region for the fineprint and the butler's reply, so a screen
          reader hears the outcome without the page moving under it. */}
      <p
        aria-live="polite"
        className={`mt-3.5 text-[12.5px] leading-relaxed ${state === 'error' ? 'text-danger' : 'text-ink-dim'}`}
      >
        {state === 'busy'
          ? voice.cta.busy
          : state === 'error'
            ? voice.cta.error
            : resident
              ? voice.cta.residentFineprint
              : voice.cta.fineprint}
      </p>
    </div>
  )
}
