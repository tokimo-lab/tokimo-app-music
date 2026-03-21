/**
 * Camera-rotation transition system for Alchemy visualizer (Three.js).
 *
 * The camera stays at the origin and rotates toward the new scene plane,
 * which spawns at 45-90° away. Physics easing curves drive the slerp.
 */

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

// ── Transition descriptor ─────────────────────────────────────────────

export interface CameraTransition {
  easing: EasingFn;
  /** Angular separation between old and new scene (radians, 45-90°) */
  rotAngle: number;
  /** Direction to new scene (radians, 0 = right, π/2 = down, π = left …) */
  dirAngle: number;
}

export function createTransition(): CameraTransition {
  const easing = EASINGS[Math.floor(Math.random() * EASINGS.length)];
  const rotAngle = Math.PI / 4 + Math.random() * (Math.PI / 4);
  const base = Math.floor(Math.random() * 4) * (Math.PI / 2);
  const jitter = (Math.random() - 0.5) * (Math.PI / 4);
  const dirAngle = base + jitter;
  return { easing, rotAngle, dirAngle };
}
