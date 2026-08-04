/** The drag ghosts' "held plate" motion — an FL-Studio-style lean.
 *
 *  A dragged block hangs from the grab point instead of riding the cursor
 *  rigidly: it leans away from horizontal motion and springs back level with
 *  one soft overshoot when the hand stops. Purely cosmetic — nothing here can
 *  reach the drop math; the ghost is a copy, and the numbers come from
 *  `WeekGrid`'s own snap pipeline as props.
 *
 *  Why a hand-rolled motor rather than CSS:
 *  - the pivot must be the grab point, and the standalone `rotate:` property
 *    composes AFTER `transform`, which would pivot around the element's own
 *    centre instead — so ONE string has to own translate+rotate+scale;
 *  - per-frame writes cannot coexist with a `transition` on the same property,
 *    so the position easing moves into the same loop (a critically damped
 *    spring, about the old 90 ms feel, now velocity-continuous across a
 *    slot hop instead of restarting its ease);
 *  - the loop runs ONLY while a ghost is mounted, i.e. only during a live
 *    drag. Idle cost is exactly zero (shell v3 dropped the ambient layer for
 *    precisely this reason).
 *
 *  Single consumer (the two ghosts in `WeekGrid.tsx`), so it stays in `app/`
 *  rather than `core/` — extract on contact, not up front.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react'

/** every tunable in one place — feel, not spectacle */
export const TILT = {
  /** ceiling on the lean, in degrees */
  MAX_DEG_DESKTOP: 4,
  MAX_DEG_MOBILE: 2.5,
  /** degrees per px/ms of smoothed horizontal pointer speed
   *  (4° saturates around ~1300 px/s of cursor travel) */
  DEG_PER_PXMS: 3,
  /** Which way the plate leans. CSS rotation is clockwise on a y-down axis, so
   *  a POSITIVE angle swings everything below the pivot to the LEFT — i.e. the
   *  body trails a rightward drag, which is the effect being copied. Flip this
   *  to -1 to lean into the motion instead. */
  TRAIL_SIGN: 1,
  /** low-pass time constant for the pointer velocity, ms */
  VEL_TAU_MS: 60,
  /** per-sample speed clamp, px/ms — synthetic pointer moves (the Manor
   *  harness, assistive tech) teleport, and an unclamped sample would read as
   *  a several-hundred-px/ms flick */
  MAX_POINTER_V: 3,
  /** position follow: critically damped, rad/s */
  POS_OMEGA: 40,
  /** the lean's own spring — under-damped on purpose: one ~5% overshoot and a
   *  ~200 ms settle is the whole signature */
  ANG_OMEGA: 30,
  ANG_ZETA: 0.7,
  /** integrator guards: a backgrounded tab hands back one enormous frame */
  MAX_DT_S: 0.032,
  SUBSTEP_S: 1 / 120,
} as const

/** kill switch: `false` ships the lean on desktop only */
export const TILT_MOBILE = true

export interface GhostMotor {
  /** a raw pointer sample — feeds the velocity that drives the lean */
  feedPointer(x: number, tMs: number): void
  /** the snapped slot the ghost is springing towards, in px */
  setTarget(tx: number, ty: number): void
  stop(): void
}

interface MotorOpts {
  maxDeg: number
  scale: number
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export function createGhostMotor(
  el: HTMLElement,
  tx0: number,
  ty0: number,
  opts: MotorOpts,
): GhostMotor {
  let x = tx0
  let y = ty0
  let tx = tx0
  let ty = ty0
  let vx = 0
  let vy = 0
  /** the lean, degrees, and its angular velocity */
  let theta = 0
  let omega = 0
  /** smoothed horizontal pointer speed, px/ms */
  let vbar = 0
  let lastPX = Number.NaN
  let lastPT = 0
  /** a pointer sample arrived since the last tick */
  let fresh = false
  let raf = 0
  let lastT = 0
  let dead = false

  const write = () => {
    el.style.transform =
      `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
      `rotate(${theta.toFixed(3)}deg) scale(${opts.scale})`
  }

  const tick = (t: number) => {
    raf = 0
    if (dead) return
    const dt = Math.min((t - lastT) / 1000, TILT.MAX_DT_S)
    lastT = t

    // Pointer events stop the instant the hand stops, so the filter has to be
    // decayed from the tick as well — otherwise a held-still drag keeps its
    // last lean forever instead of springing level.
    if (!fresh) vbar *= Math.exp((-dt * 1000) / TILT.VEL_TAU_MS)
    fresh = false

    const aim = clamp(TILT.TRAIL_SIGN * TILT.DEG_PER_PXMS * vbar, -opts.maxDeg, opts.maxDeg)

    // semi-implicit Euler over fixed substeps — a stiff spring integrated in
    // one 32 ms step is how a spring blows up
    const n = Math.max(1, Math.min(4, Math.ceil(dt / TILT.SUBSTEP_S)))
    const h = dt / n
    const kp = TILT.POS_OMEGA * TILT.POS_OMEGA
    const cp = 2 * TILT.POS_OMEGA
    const ka = TILT.ANG_OMEGA * TILT.ANG_OMEGA
    const ca = 2 * TILT.ANG_ZETA * TILT.ANG_OMEGA
    for (let i = 0; i < n; i++) {
      vx += (kp * (tx - x) - cp * vx) * h
      vy += (kp * (ty - y) - cp * vy) * h
      x += vx * h
      y += vy * h
      omega += (ka * (aim - theta) - ca * omega) * h
      theta += omega * h
    }

    write()
    raf = requestAnimationFrame(tick)
  }

  // The live branch renders no `transform` at all (React must never fight the
  // motor for that property), and the first rAF tick lands after paint — so
  // seed the element here, synchronously, or it shows one frame at the grid's
  // top-left corner.
  write()
  lastT = performance.now()
  raf = requestAnimationFrame(tick)

  return {
    feedPointer(px, tMs) {
      if (Number.isNaN(lastPX)) {
        lastPX = px
        lastPT = tMs
        return
      }
      // coalesced samples can share a timestamp; a 4 ms floor keeps the
      // division honest rather than infinite
      const dtEv = Math.max(tMs - lastPT, 4)
      const v = clamp((px - lastPX) / dtEv, -TILT.MAX_POINTER_V, TILT.MAX_POINTER_V)
      lastPX = px
      lastPT = tMs
      vbar += (v - vbar) * (1 - Math.exp(-dtEv / TILT.VEL_TAU_MS))
      fresh = true
    },
    setTarget(nx, ny) {
      tx = nx
      ty = ny
    },
    stop() {
      dead = true
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    },
  }
}

/** Drives `ref`'s transform for as long as the ghost is mounted. `enabled`
 *  false (reduced motion, or the mobile kill switch) makes this inert and the
 *  caller renders its plain CSS transform instead. */
export function useGhostTilt(
  ref: RefObject<HTMLElement | null>,
  tx: number,
  ty: number,
  opts: MotorOpts,
  enabled: boolean,
) {
  const motor = useRef<GhostMotor | null>(null)
  // read at creation only — the target then arrives through `setTarget`
  const seed = useRef({ tx, ty, opts })
  seed.current = { tx, ty, opts }

  // layout effect, not effect: the seed transform has to be written before the
  // browser paints the ghost's first frame
  useLayoutEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    const m = createGhostMotor(el, seed.current.tx, seed.current.ty, seed.current.opts)
    motor.current = m
    // passive: the drag's own handlers own preventDefault; this only watches
    const onMove = (ev: PointerEvent) => m.feedPointer(ev.clientX, ev.timeStamp)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      m.stop()
      motor.current = null
    }
  }, [enabled, ref])

  useLayoutEffect(() => {
    motor.current?.setTarget(tx, ty)
  }, [tx, ty])
}
