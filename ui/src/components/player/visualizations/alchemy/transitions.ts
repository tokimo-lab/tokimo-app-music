/**
 * Transition effects for the Alchemy 3D visualizer.
 *
 * Each transition combines a point-cloud morph modifier (controls how points
 * move during the transition) with optional camera effects (rotation, zoom).
 * 8 morph types × 11 camera presets = 88 unique combinations, with randomised
 * duration and parameter scaling for virtually infinite variety.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** Per-point displacement during morph: returns [ox, oy, oz] offset. */
export type MorphModifier = (
  i: number,
  sx: number,
  sy: number,
  sz: number,
  dx: number,
  dy: number,
  dz: number,
  t: number,
  st: number,
) => [number, number, number];

export interface TransitionEffect {
  duration: number;
  morph: MorphModifier;
  camRotX: number;
  camRotY: number;
  camPush: number;
  lineFadeIn: number;
}

// ── Pseudo-random (deterministic per point per frame) ────────────────────────

function pr(i: number, ch: number): number {
  const x = Math.sin(i * 12.9898 + ch * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// ── Morph modifiers ──────────────────────────────────────────────────────────

/** Random scatter — particles explode outward and regroup. */
const scatter: MorphModifier = (i, _sx, _sy, _sz, _dx, _dy, _dz, t) => {
  const a = Math.sin(t * Math.PI) * 2.0;
  return [pr(i, 6) * a, pr(i, 7) * a, pr(i, 8) * a * 0.3];
};

/** Vortex — points rotate around center during morph. */
const vortex: MorphModifier = (i, sx, sy, _sz, dx, dy, _dz, t, st) => {
  const angle = Math.sin(t * Math.PI) * (1.2 + pr(i, 9) * 0.4);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const mx = sx + (dx - sx) * st;
  const my = sy + (dy - sy) * st;
  return [
    mx * (ca - 1) - my * sa,
    mx * sa + my * (ca - 1),
    pr(i, 8) * Math.sin(t * Math.PI) * 0.4,
  ];
};

/** Implode — points collapse to center then expand to new positions. */
const implode: MorphModifier = (_i, sx, sy, sz, dx, dy, dz, t, st) => {
  const pull = Math.sin(t * Math.PI);
  const mx = sx + (dx - sx) * st;
  const my = sy + (dy - sy) * st;
  const mz = sz + (dz - sz) * st;
  return [-mx * pull * 0.85, -my * pull * 0.85, -mz * pull * 0.5];
};

/** Radial ripple wave displaces points outward and inward. */
const wave: MorphModifier = (_i, sx, sy, _sz, dx, dy, _dz, t, st) => {
  const mx = sx + (dx - sx) * st;
  const my = sy + (dy - sy) * st;
  const r = Math.sqrt(mx * mx + my * my) + 0.01;
  const w = Math.sin(r * 4 - t * Math.PI * 6) * Math.sin(t * Math.PI) * 1.2;
  return [(mx / r) * w * 0.4, (my / r) * w * 0.4, w * 0.15];
};

/** Matrix rain — points fall down, then reform from above. */
const matrixRain: MorphModifier = (i, _sx, _sy, _sz, _dx, _dy, _dz, t) => {
  const fall = Math.sin(t * Math.PI) * (3 + pr(i, 10) * 2);
  const drift = pr(i, 6) * Math.sin(t * Math.PI) * 0.4;
  return [drift, -fall, 0];
};

/** Explosion — aggressive outward burst, slow convergence. */
const explosion: MorphModifier = (i, _sx, _sy, _sz, _dx, _dy, _dz, t) => {
  const exp = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 0.75);
  const a = exp * 5.0;
  return [pr(i, 6) * a, pr(i, 7) * a, pr(i, 8) * a * 0.5];
};

/** Spiral — points trace expanding spiral paths. */
const spiral: MorphModifier = (i, sx, sy, _sz, dx, dy, _dz, t, st) => {
  const angle = t * Math.PI * 3 * (1 + pr(i, 9) * 0.3);
  const expand = Math.sin(t * Math.PI) * (1.5 + pr(i, 10) * 0.5);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const mx = sx + (dx - sx) * st;
  const my = sy + (dy - sy) * st;
  return [
    mx * (ca - 1) * 0.3 + pr(i, 6) * expand,
    my * (sa + 1) * 0.3 + pr(i, 7) * expand,
    pr(i, 8) * expand * 0.3,
  ];
};

/** Pixelate — points snap toward a grid during mid-transition. */
const pixelate: MorphModifier = (_i, sx, sy, sz, dx, dy, dz, t, st) => {
  const g = 0.5;
  const snap = Math.sin(t * Math.PI);
  const mx = sx + (dx - sx) * st;
  const my = sy + (dy - sy) * st;
  const mz = sz + (dz - sz) * st;
  return [
    (Math.round(mx / g) * g - mx) * snap * 0.8,
    (Math.round(my / g) * g - my) * snap * 0.8,
    (Math.round(mz / g) * g - mz) * snap * 0.3,
  ];
};

const MORPHS: MorphModifier[] = [
  scatter,
  vortex,
  implode,
  wave,
  matrixRain,
  explosion,
  spiral,
  pixelate,
];

// ── Camera presets (peak rotation/push, enveloped by sin(t*π) at runtime) ────

interface CamPreset {
  rx: number;
  ry: number;
  push: number;
}

const CAMS: CamPreset[] = [
  { rx: 0, ry: 0, push: 0 },
  { rx: 0, ry: 0, push: 0 },
  { rx: 0, ry: 0.45, push: 0 },
  { rx: 0, ry: -0.45, push: 0 },
  { rx: 0.35, ry: 0, push: 0 },
  { rx: -0.35, ry: 0, push: 0 },
  { rx: 0.2, ry: 0.3, push: 0 },
  { rx: 0, ry: 0, push: -7 },
  { rx: 0, ry: 0, push: 5 },
  { rx: 0.15, ry: 0.2, push: -4 },
  { rx: -0.15, ry: -0.2, push: 3 },
];

// ── Factory ──────────────────────────────────────────────────────────────────

export function createTransition(): TransitionEffect {
  const morph = MORPHS[Math.floor(Math.random() * MORPHS.length)];
  const cam = CAMS[Math.floor(Math.random() * CAMS.length)];
  const scale = 0.7 + Math.random() * 0.6;
  return {
    duration: 50 + Math.floor(Math.random() * 70),
    morph,
    camRotX: cam.rx * scale,
    camRotY: cam.ry * scale,
    camPush: cam.push * scale,
    lineFadeIn: 0.5 + Math.random() * 0.2,
  };
}
