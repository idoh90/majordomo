import type { ReactNode } from 'react'

/**
 * THE FOLD — the one way anything in the house opens and closes.
 *
 * Every collapsible used to be `{open && <div>…</div>}`. That gives you an
 * opening animation at best and never a closing one, because by the time the
 * fold should be closing React has already taken the content out of the tree.
 * So the content stays mounted and the fold is driven by an attribute; the
 * mechanics (grid track, clipping, when visibility flips) live in `.fold` in
 * index.css, next to the motion tokens the rest of the house shares.
 *
 * `mobileOnly` is for the panels that fold only because a phone is narrow —
 * the briefings, the muscle ledger. Desktop shows their content whatever the
 * state says, and does it without animating, so a window resize can't play a
 * transition nobody asked for.
 */
export function Collapsible({
  open,
  mobileOnly = false,
  swap = false,
  className = '',
  innerClassName = '',
  children,
}: {
  open: boolean
  /** desktop (≥768px) ignores `open` and stays expanded */
  mobileOnly?: boolean
  /** set on BOTH folds when two of them trade places in the same panel — it
   *  matches their closing beat to their opening one so their heights sum to
   *  a straight line instead of the panel bulging past where it lands */
  swap?: boolean
  /** spacing is the caller's business, as everywhere else */
  className?: string
  /** layout and spacing for the content — margins and padding both safe here */
  innerClassName?: string
  children: ReactNode
}) {
  return (
    <div
      className={`fold ${mobileOnly ? 'fold-mobile' : ''} ${swap ? 'fold-swap' : ''} ${className}`}
      data-open={open}
    >
      {/* THREE elements, not two, and the middle one must stay bare. It is the
          clip, and a clip cannot carry a box of its own: a margin on it sits
          outside the grid track, and padding can't compress either — a
          border-box height clamps at padding + border, so a closed fold would
          sit permanently ajar by that many pixels. Spacing therefore belongs
          to the content element below, whose margins are measured INSIDE the
          clip (overflow: hidden makes it a block formatting context) and so
          collapse away with the track. */}
      <div>
        <div className={innerClassName}>{children}</div>
      </div>
    </div>
  )
}
