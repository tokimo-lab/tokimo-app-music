/** Shared rendering helpers for Alchemy scenes */

const TAU = Math.PI * 2;

export { TAU };

/** Shortcut for min(w,h) */
export function S(w: number, h: number) {
  return Math.min(w, h);
}

/** Simple 2D noise-like function */
export function snoise(x: number, y: number): number {
  return (
    (Math.sin(x * 1.3 + y * 0.7) * Math.sin(y * 1.1 - x * 0.5) +
      Math.sin(x * 0.3 + y * 2.1) * 0.5) /
    1.5
  );
}

/** 3D particle type with depth */
export type P3 = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  age: number;
  size: number;
  hue: number;
};

export function mkP3(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  hue: number,
  life = 1,
  size = 3,
): P3 {
  return { x, y, z, vx, vy, vz, life, age: 0, size, hue };
}
