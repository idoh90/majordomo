import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * The drag ghost's motion — the "held plate" feel FL Studio's playlist has.
 *
 * A clip you drag in FL Studio hangs from the point you grabbed it by: it
 * leans away from the way your hand is travelling and swings back level when
 * you stop. Three details make it read as *held* rather than *followed*:
 *
 *   1. it pivots around the GRAB POINT (`transform-origin`), not the centre —
 *      the pixel under the cursor stays under the cursor;
 *   2. the lean follows the POINTER's speed, not the block's. The block snaps
 *      to the half hour; a lean that snapped with it would stutter;
 *   3. the return is slightly under-damped, so it crosses level once before
 *      settling. That one wobble is the whole personality — critical damping
 *      reads dead.
 *
 * Why a motor and not CSS. The ghost's position is already a `transform`, and
 * the standalone `rotate:` property is applied AROUND that translation rather
 * than inside it: 5° of `rotate:` on a ghost translated 300 px orbits it ~26 px
 * sideways instead of tipping it in place. The rotation has to sit inside the
 * same transform list — which means one owner for the whole string, which means
 * the 90 ms CSS transition on `transform` has to go too (it would smear every
 * per-frame write). So the motor takes the position as well, as a critically
 * damped spring standing in for that transition.
 *
 * Cost: one rAF loop per LIVE drag, writing one property. There is no idle
 * loop — a motor exists only while a ghost is mounted, and a ghost is mounted
 * only while something is actually being dragged. (Shell v3 deleted the ambient
 * background layer for costing idle frames; this is the opposite shape.)
 *
 * Nothing here may touch the drop maths. The motor is told where the snapped
 * slot is; it never decides one.
 */

/** every tunable, in one place */
export const TILT = {
  /** peak lean, degrees. Weight, not spectacle — 4° reads as heft, 15° as a toy */
  MAX_DEG_DESKTOP: 4,
  /** gentler on mobile: the finger covers the pivot, and the snap scroller
   *  shaves a rotated corner at the column edges */
  MAX_DEG_MOBILE: 2.5,
  /** degrees of lean per px/ms of smoothed pointer speed (4° saturates ≈1300 px/s) */
  DEG_PER_PXMS: 3,
  /** low-pass on pointer velocity — raw deltas are jittery enough to buzz the angle */
  VEL_TAU_MS: 60,
  /** per-sample speed ceiling, px/ms. Synthetic drags (the harness) teleport
   *  between points; unclamped, one jump poisons the filter for several frames */
  MAX_POINTER_V: 3,
  /** position spring, rad/s, critically damped — stands in for the 90 ms ease-out */
  POS_OMEGA: 40,
  /** angle spring. ζ < 1 buys the single soft overshoot that sells the effect */
  ANG_OMEGA: 30,
  ANG_ZETA: 0.7,
  /** frame-dt ceiling: a backgrounded tab must not resume with a two-second step */
  MAX_DT_S: 0.032,
  /** fixed integration substep — keeps explicit Euler well inside stability at
   *  the dt ceiling, where a single step would ring */
  SUBSTEP_S: 1 / 120,
} as const

/** kill switch for the mobile ghost — flip to false to ship the tilt desktop-only */
export const TILT_MOBILE = true

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export interface GhostMotor {
  /** one raw pointer sample. Only x matters: a pendulum does not lean when you
   *  lift it straight up, and Manor drags are mostly vertical (time). */
  feedPointer(x: number, tMs: number): void
  /** the snapped slot to fly to, in the ghost container's px */
  setTarget(tx: number, ty: number): void
  /** terminal — no further frames, and a tick already queued this frame no-ops */
  stop(): void
}

export function createGhostMotor(
  el: HTMLElement,
  tx0: number,
  ty0: number,
  opts: { maxDeg: number; scale: number },
): GhostMotor {
  let tx = tx0
  let ty = ty0
  let x = tx0
  let y = ty0
  let vx = 0
  let vy = 0
  let theta = 0 // degrees
  let omega = 0 // degrees/s
  let vbar = 0 // smoothed pointer velocity, px/ms
  let lastPX = 0
  let lastPT: number | null = null
  let fresh = false
  let lastTick = performance.now()
  let stopped = false
  let raf = 0

  const write = () => {
    el.style.transform =
      `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
      `rotate(${theta.toFixed(3)}deg) scale(${opts.scale})`
  }

  /* Seed synchronously. The live branch renders no `transform` at all (that is
     what keeps React from clobbering these writes), so without this the ghost
     would paint one frame at the container's top-left before the first tick. */
  write()

  const tick = (now: number) => {
    if (stopped) return
    const dt = Math.min((now - lastTick) / 1000, TILT.MAX_DT_S)
    lastTick = now

    /* pointermove stops firing the instant the hand stops, so the decay has to
       run from the frame loop. Driven only by fresh samples, the lean would
       freeze at whatever angle the last movement left behind. */
    if (!fresh) vbar += (0 - vbar) * (1 - Math.exp(-(dt * 1000) / TILT.VEL_TAU_MS))
    fresh = false

    /* Sign: CSS y runs downwards, so rotate(+θ) sweeps a point BELOW the pivot
       to the left (x' = −h·sinθ). Moving right must leave the bulk of the block
       trailing left, so a rightward pointer wants a POSITIVE angle. Flipping
       this makes the ghost lean into the motion like a speedboat — still
       animated, but the wrong animal. */
    const target = clamp(TILT.DEG_PER_PXMS * vbar, -opts.maxDeg, opts.maxDeg)

    const n = Math.max(1, Math.ceil(dt / TILT.SUBSTEP_S))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      // position: critically damped (ζ = 1)
      vx += (TILT.POS_OMEGA * TILT.POS_OMEGA * (tx - x) - 2 * TILT.POS_OMEGA * vx) * h
      x += vx * h
      vy += (TILT.POS_OMEGA * TILT.POS_OMEGA * (ty - y) - 2 * TILT.POS_OMEGA * vy) * h
      y += vy * h
      // angle: under-damped on purpose
      omega +=
        (TILT.ANG_OMEGA * TILT.ANG_OMEGA * (target - theta) -
          2 * TILT.ANG_ZETA * TILT.ANG_OMEGA * omega) *
        h
      theta += omega * h
    }
    write()
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return {
    feedPointer(px, tMs) {
      if (lastPT !== null) {
        /* 4 ms floor: high-poll mice and coalesced events deliver samples with
           equal (or non-monotonic) stamps, and dividing by ~0 launches the
           filter. The per-sample clamp then bounds what any one jump can do. */
        const dtEv = Math.max(tMs - lastPT, 4)
        const inst = clamp((px - lastPX) / dtEv, -TILT.MAX_POINTER_V, TILT.MAX_POINTER_V)
        vbar += (inst - vbar) * (1 - Math.exp(-dtEv / TILT.VEL_TAU_MS))
        fresh = true
      }
      lastPX = px
      lastPT = tMs
    },
    setTarget(nx, ny) {
      tx = nx
      ty = ny
    },
    stop() {
      stopped = true
      cancelAnimationFrame(raf)
    },
  }
}

/**
 * Drives a ghost element for as long as it is mounted. `enabled` is read once
 * by the caller (reduced motion, mobile kill switch) and never flips mid-drag,
 * so the element's style shape stays stable for its whole life.
 */
export function useGhostTilt(
  ref: RefObject<HTMLElement | null>,
  tx: number,
  ty: number,
  opts: { maxDeg: number; scale: number },
  enabled: boolean,
): void {
  const motorRef = useRef<GhostMotor | null>(null)

  /* Layout, not passive: the ghost is positioned at the container's origin and
     moved entirely by transform, so a post-paint effect would flash it at
     Sunday-midnight for one frame. Deps are [enabled] on purpose — tx/ty are
     read once as the seed and thereafter arrive through setTarget below.
     StrictMode's dev double-mount runs create → stop → create; both halves are
     idempotent, and the cleanup between them releases the listener and rAF. */
  useLayoutEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const motor = createGhostMotor(el, tx, ty, opts)
    motorRef.current = motor
    /* The motor listens for itself rather than being fed by the drag handler:
       velocity is cosmetic, and keeping it on a separate passive listener is
       what guarantees the numeric path cannot be perturbed by this file. */
    const onMove = (m: PointerEvent) => motor.feedPointer(m.clientX, m.timeStamp)
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      motor.stop()
      motorRef.current = null
    }
  }, [enabled])

  useLayoutEffect(() => {
    motorRef.current?.setTarget(tx, ty)
  }, [tx, ty])
}
