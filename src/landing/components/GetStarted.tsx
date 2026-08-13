import { useState } from 'react'
import { voice } from '../voice'
import { enterApp } from '../enterApp'

/* ---------------------------------------------------------------------------
   The one button. It replaced the waitlist form the day the doors opened: the
   only thing between a visitor and the estate is the app chunk downloading,
   so the three states are the whole story — idle, fetching, line down.
--------------------------------------------------------------------------- */
export default function GetStarted({ placement }: { placement: 'hero' | 'footer' }) {
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
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
        {voice.cta.button}
      </button>
      {/* One live region for the fineprint and the butler's reply, so a screen
          reader hears the outcome without the page moving under it. */}
      <p
        aria-live="polite"
        className={`mt-3.5 text-[12.5px] leading-relaxed ${state === 'error' ? 'text-danger' : 'text-ink-dim'}`}
      >
        {state === 'busy' ? voice.cta.busy : state === 'error' ? voice.cta.error : voice.cta.fineprint}
      </p>
    </div>
  )
}
