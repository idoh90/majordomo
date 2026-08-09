import type { ReactNode } from 'react'
import type { MuscleGroup, SportId } from '../types'

/**
 * Hand-rolled line icons (no icon library in this project — same rule as the
 * charts). All stroke-based on currentColor so they recolor per skin for free;
 * drawn for 14–18 px render sizes, so shapes stay coarse on purpose.
 */

const SPORT_GLYPHS: Record<SportId, ReactNode> = {
  // a front-on fist: knuckle box, two finger splits, the thumb folded under
  mma: (
    <>
      <rect x="5.5" y="7.5" width="13" height="11" rx="3.5" />
      <path d="M9.9 7.5v3.4M14.1 7.5v3.4" />
      <path d="M5.5 14.3h3.6" />
    </>
  ),
  // a glove: mitten with the thumb off the side, laced cuff under it
  boxing: (
    <>
      <path d="M7.2 10.2a4.8 4.8 0 0 1 9.6 0v2.6a4.2 4.2 0 0 1-4.2 4.2h-1.2a4.2 4.2 0 0 1-4.2-4.2z" />
      <path d="M7.2 9.4H6a1.9 1.9 0 0 0 0 3.8h1.2" />
      <path d="M9.7 17v2.7M14.3 17v2.7M9.7 19.7h4.6" />
    </>
  ),
  // a fighter mid-roundhouse: guard up, standing leg planted, shin arriving
  muaythai: (
    <>
      <circle cx="7.6" cy="4.9" r="2" />
      <path d="M7.4 7.9 6.8 13" />
      <path d="M7.2 9.6l3.4-1.2" />
      <path d="M6.8 13l-1.6 6.5" />
      <path d="M6.8 13l5.7 1.6 6.7-2.8" />
    </>
  ),
  // the clasp: two forearms driving into one locked grip
  wrestling: (
    <>
      <path d="M6.2 19 10.2 11.6" />
      <path d="M17.8 19 13.8 11.6" />
      <circle cx="12" cy="9.8" r="2.5" />
      <path d="M4.2 19h4.9M14.9 19h4.9" />
    </>
  ),
  // the belt: band, center knot, two tails hanging
  bjj: (
    <>
      <path d="M4 9.5h5M15 9.5h5M4 13h4.5M15.5 13h4.5" />
      <rect x="9" y="8" width="6" height="6" rx="1.4" />
      <path d="M10.5 14 8.5 19.5M13.5 14l2 5.5" />
    </>
  ),
  // racquet on the diagonal, two strings, ball waiting
  tennis: (
    <>
      <circle cx="14.7" cy="8.3" r="5" />
      <path d="M12.2 4.2l6.2 6.2M10.8 6.8l6.2 6.2" />
      <path d="M11.2 11.8 4.8 18.2" />
      <circle cx="6.3" cy="9.7" r="1.8" />
    </>
  ),
  // a swimmer: head up, arm reaching through the catch, water underneath
  swimming: (
    <>
      <circle cx="16.2" cy="8.8" r="2.1" />
      <path d="M3.8 13.2c3.2-4.6 7.4-5.6 9.6-3.9" />
      <path d="M3 18.2c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0" />
    </>
  ),
  // the ball: seams front-on
  basketball: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4v16" />
      <path d="M6.4 6.6c2 1.9 2 8.9 0 10.8M17.6 6.6c-2 1.9-2 8.9 0 10.8" />
    </>
  ),
  // the ball: center pentagon, spokes to the seams
  soccer: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.4l3.3 2.4-1.3 3.9h-4l-1.3-3.9z" fill="currentColor" strokeWidth="1" />
      <path d="M12 8.4V4.6M15.3 10.8l3.6-1.1M14 14.7l2.2 3.1M10 14.7l-2.2 3.1M8.7 10.8 5.1 9.7" />
    </>
  ),
  // wheels, frame, saddle and bars
  cycling: (
    <>
      <circle cx="5.8" cy="15.8" r="3.8" />
      <circle cx="18.2" cy="15.8" r="3.8" />
      <path d="M5.8 15.8 9 9h6.4l2.8 6.8M9 9 7.6 6.4h2.8M12.2 15.8 15.4 9l-.8-2.2h2.6" />
    </>
  ),
  // one sharp face, a bolted route dotted up it
  climbing: (
    <>
      <path d="M3.8 19.5 12 4.8l8.2 14.7z" />
      <circle cx="11" cy="16.6" r="1" fill="currentColor" strokeWidth="0.6" />
      <circle cx="13.4" cy="12.8" r="1" fill="currentColor" strokeWidth="0.6" />
      <circle cx="11.8" cy="9.2" r="1" fill="currentColor" strokeWidth="0.6" />
    </>
  ),
  // two peaks, snow line on the tall one, sun out
  hiking: (
    <>
      <path d="M2.8 18.8 9 8.2l4.1 6.6 2.6-3.6 5.5 7.6z" />
      <path d="M7.4 10.9 9 12.4l1.6-1.5" />
      <circle cx="18.6" cy="5.8" r="1.9" />
    </>
  ),
}

const GROUP_GLYPHS: Record<MuscleGroup, ReactNode> = {
  // the two plates, collarbone notch above
  chest: (
    <>
      <path d="M8.5 5c1.6 1.6 5.4 1.6 7 0" />
      <rect x="4.5" y="9" width="6.6" height="7" rx="1.8" />
      <rect x="12.9" y="9" width="6.6" height="7" rx="1.8" />
    </>
  ),
  // the rear view: V-taper, spine down the middle
  back: (
    <>
      <path d="M5 4.5h14l-2.2 7.3-4.8 7.7-4.8-7.7z" />
      <path d="M12 7.5V15" />
      <path d="M8.2 7.2c1 1.3 2.3 2 3.8 2s2.8-.7 3.8-2" />
    </>
  ),
  // head over the yoke, a cap arc on each end
  shoulders: (
    <>
      <circle cx="12" cy="6.2" r="2.4" />
      <path d="M4 16.5a6 6 0 0 1 6-5.5h4a6 6 0 0 1 6 5.5" />
      <path d="M4 16.5V19M20 16.5V19" />
    </>
  ),
  // the flex: forearm post up, bicep in a ball beside it
  arms: (
    <>
      <path d="M7 19.5V7l2.2-2.5L11.4 7v4.2" />
      <circle cx="14.6" cy="14.4" r="4.6" />
      <path d="M7 19.5h11.5" />
    </>
  ),
  // the plate: six of them
  core: (
    <>
      <rect x="7" y="4" width="10" height="16" rx="3.2" />
      <path d="M12 4v16M7 9.4h10M7 14.6h10" />
    </>
  ),
  // hips over two legs planted apart
  legs: (
    <>
      <path d="M7.5 4.5h9" />
      <path d="M8.8 4.5v7.2L7 19.5" />
      <path d="M15.2 4.5v7.2l1.8 7.8" />
      <path d="M4.2 19.5H7M19.8 19.5H17" />
    </>
  ),
}

interface IconProps {
  size?: number
  className?: string
}

export function SportIcon({ kind, size = 16, className }: IconProps & { kind: SportId }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {SPORT_GLYPHS[kind]}
      </g>
    </svg>
  )
}

export function MuscleGroupIcon({ group, size = 14, className }: IconProps & { group: MuscleGroup }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {GROUP_GLYPHS[group]}
      </g>
    </svg>
  )
}
