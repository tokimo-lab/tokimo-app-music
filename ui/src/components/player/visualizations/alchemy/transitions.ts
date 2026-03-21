/**
 * Camera-based scene transition system for Alchemy visualizer.
 *
 * Instead of simple alpha crossfade, the camera "flies" from the old scene
 * to the new scene using physically-plausible motion curves. The new scene
 * appears at a random spatial offset (left / right / up / down / forward /
 * backward) and the camera accelerates → decelerates toward it.
 */

// ── Transition directions ─────────────────────────────────────────────

export type TransitionDir =
  | "left"
  | "right"
  | "up"
  | "down"
  | "forward"
  | "backward";

const DIRECTIONS: TransitionDir[] = [
  "left",
  "right",
  "up",
  "down",
  "forward",
  "backward",
];

export function pickDirection(): TransitionDir {
  return DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
}

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

/** Anticipation + overshoot — slight windup before launch, overshoot at end */
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

export function pickEasing(): EasingFn {
  return EASINGS[Math.floor(Math.random() * EASINGS.length)];
}

// ── Transition state ──────────────────────────────────────────────────

export interface CameraTransition {
  dir: TransitionDir;
  easing: EasingFn;
}

export function createTransition(): CameraTransition {
  return { dir: pickDirection(), easing: pickEasing() };
}

// ── Composite offsets ─────────────────────────────────────────────────

export interface TransitionOffsets {
  /** Old scene: horizontal offset (px) */
  oldDx: number;
  /** Old scene: vertical offset (px) */
  oldDy: number;
  /** Old scene: uniform scale factor */
  oldScale: number;
  /** Old scene: opacity 0..1 */
  oldAlpha: number;
  /** New scene: horizontal offset (px) */
  newDx: number;
  /** New scene: vertical offset (px) */
  newDy: number;
  /** New scene: uniform scale factor */
  newScale: number;
  /** New scene: opacity 0..1 */
  newAlpha: number;
}

/**
 * Compute position / scale / alpha for both scene buffers during transition.
 *
 * @param dir  - where the camera is heading
 * @param t    - eased progress 0 → 1
 * @param w    - canvas width
 * @param h    - canvas height
 */
export function getTransitionOffsets(
  dir: TransitionDir,
  t: number,
  w: number,
  h: number,
): TransitionOffsets {
  // Lateral fade: old stays visible a bit longer, then fades
  const lateralOldAlpha = Math.max(0, t < 0.35 ? 1 : 1 - (t - 0.35) / 0.55);
  const lateralNewAlpha = Math.min(1, t * 1.4);

  switch (dir) {
    case "left":
      return {
        oldDx: -t * w * 0.7,
        oldDy: 0,
        oldScale: 1 - t * 0.08,
        oldAlpha: lateralOldAlpha,
        newDx: (1 - t) * w * 0.85,
        newDy: 0,
        newScale: 0.92 + t * 0.08,
        newAlpha: lateralNewAlpha,
      };
    case "right":
      return {
        oldDx: t * w * 0.7,
        oldDy: 0,
        oldScale: 1 - t * 0.08,
        oldAlpha: lateralOldAlpha,
        newDx: -(1 - t) * w * 0.85,
        newDy: 0,
        newScale: 0.92 + t * 0.08,
        newAlpha: lateralNewAlpha,
      };
    case "up":
      return {
        oldDx: 0,
        oldDy: -t * h * 0.7,
        oldScale: 1 - t * 0.08,
        oldAlpha: lateralOldAlpha,
        newDx: 0,
        newDy: (1 - t) * h * 0.85,
        newScale: 0.92 + t * 0.08,
        newAlpha: lateralNewAlpha,
      };
    case "down":
      return {
        oldDx: 0,
        oldDy: t * h * 0.7,
        oldScale: 1 - t * 0.08,
        oldAlpha: lateralOldAlpha,
        newDx: 0,
        newDy: -(1 - t) * h * 0.85,
        newScale: 0.92 + t * 0.08,
        newAlpha: lateralNewAlpha,
      };
    case "forward":
      // Camera rushes forward: old scene zooms past, new approaches from afar
      return {
        oldDx: 0,
        oldDy: 0,
        oldScale: 1 + t * 1.2,
        oldAlpha: Math.max(0, 1 - t * 1.6),
        newDx: 0,
        newDy: 0,
        newScale: 0.25 + t * 0.75,
        newAlpha: Math.min(1, t * 1.5),
      };
    case "backward":
      // Camera pulls back: old scene recedes, new scene wraps around from edges
      return {
        oldDx: 0,
        oldDy: 0,
        oldScale: 1 - t * 0.65,
        oldAlpha: Math.max(0, 1 - t * 1.6),
        newDx: 0,
        newDy: 0,
        newScale: 1.7 - t * 0.7,
        newAlpha: Math.min(1, t * 1.5),
      };
  }
}

/**
 * Draw a scene buffer onto the main canvas with camera-movement transforms.
 *
 * Transform chain: translate to center+offset → scale → translate back → draw.
 * This produces a centered zoom/pan effect.
 */
export function compositeBuffer(
  ctx: CanvasRenderingContext2D,
  buf: HTMLCanvasElement,
  w: number,
  h: number,
  dx: number,
  dy: number,
  scale: number,
  alpha: number,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(w / 2 + dx, h / 2 + dy);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(buf, 0, 0, w, h);
  ctx.restore();
}
