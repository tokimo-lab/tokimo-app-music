/**
 * Camera-based scene transition system for Alchemy visualizer.
 *
 * Scenes are drawn inside shared buffers with a stationary background.
 * During transitions the scene *content* is shifted within its buffer
 * (via ctx.translate) while the trail / ambient layer stays in place,
 * so both scenes appear to coexist in the same 3D space. The camera
 * drifts from one scene region to the next using physics easing curves.
 */

// ── Directions ────────────────────────────────────────────────────────

type Dir = "left" | "right" | "up" | "down" | "forward" | "backward";

const DIRS: Dir[] = ["left", "right", "up", "down", "forward", "backward"];

// ── Physics easing curves ─────────────────────────────────────────────

type EasingFn = (t: number) => number;

/** Smooth S-curve — classic camera dolly */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Dramatic S-curve — fast pan with precise stop */
function easeInOutQuint(t: number): number {
  return t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
}

/** Deceleration only — thrown camera braking to stop */
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Anticipation + overshoot — slight windup, overshoot at end */
function easeInOutBack(t: number): number {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return t < 0.5
    ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2
    : ((2 * t - 2) ** 2 * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;
}

/** Momentum overshoot — arrives fast, overshoots, settles */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

const EASINGS: EasingFn[] = [
  easeInOutCubic,
  easeInOutQuint,
  easeOutCubic,
  easeInOutBack,
  easeOutBack,
];

// ── Transition state ──────────────────────────────────────────────────

export interface CameraTransition {
  easing: EasingFn;
  /** Normalised direction vector (where new scene lives relative to old) */
  dx: number;
  dy: number;
  dz: number;
}

/** Max lateral shift as fraction of canvas dimension */
const LATERAL_RANGE = 0.15;
/** Max cam.z delta for depth transitions */
const DEPTH_RANGE = 180;

export function createTransition(): CameraTransition {
  const dir = DIRS[Math.floor(Math.random() * DIRS.length)];
  const easing = EASINGS[Math.floor(Math.random() * EASINGS.length)];

  // perpendicular drift for organic feel (±15 %)
  const drift = (Math.random() - 0.5) * 0.3;

  switch (dir) {
    case "left":
      return { easing, dx: -1, dy: drift, dz: drift * 0.4 };
    case "right":
      return { easing, dx: 1, dy: drift, dz: drift * 0.4 };
    case "up":
      return { easing, dx: drift, dy: -1, dz: drift * 0.4 };
    case "down":
      return { easing, dx: drift, dy: 1, dz: drift * 0.4 };
    case "forward":
      return { easing, dx: drift * 0.4, dy: drift * 0.4, dz: 1 };
    case "backward":
      return { easing, dx: drift * 0.4, dy: drift * 0.4, dz: -1 };
  }
}

// ── Per-frame offsets ─────────────────────────────────────────────────

export interface TransitionOffsets {
  /** Old scene: translate px inside buffer */
  oldOffX: number;
  oldOffY: number;
  /** Old scene: cam.z delta (added to base cam.z) */
  oldCamZ: number;
  /** Old scene: composite opacity */
  oldAlpha: number;
  /** New scene */
  newOffX: number;
  newOffY: number;
  newCamZ: number;
  newAlpha: number;
}

/**
 * Compute per-frame offsets for both scenes.
 *
 * @param tr  transition descriptor
 * @param t   eased progress 0 → 1
 * @param w   canvas CSS width
 * @param h   canvas CSS height
 */
export function getTransitionOffsets(
  tr: CameraTransition,
  t: number,
  w: number,
  h: number,
): TransitionOffsets {
  // Old scene drifts opposite to camera movement
  // New scene starts offset in camera direction, glides to center
  return {
    oldOffX: -t * tr.dx * w * LATERAL_RANGE,
    oldOffY: -t * tr.dy * h * LATERAL_RANGE,
    oldCamZ: t * tr.dz * DEPTH_RANGE,
    oldAlpha: 1 - t,

    newOffX: (1 - t) * tr.dx * w * LATERAL_RANGE * 1.15,
    newOffY: (1 - t) * tr.dy * h * LATERAL_RANGE * 1.15,
    newCamZ: -(1 - t) * tr.dz * DEPTH_RANGE,
    newAlpha: t,
  };
}
