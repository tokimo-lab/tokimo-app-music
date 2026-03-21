/** 3D perspective projection utilities for Alchemy visualizer */

export const DEFAULT_FOV = 600;
export const MAX_DEPTH = 1200;

export interface Camera {
  /** Camera z-offset — oscillates with audio for breathing feel */
  z: number;
  /** Field of view / focal length (higher = less perspective) */
  fov: number;
}

export interface Projected {
  sx: number;
  sy: number;
  /** Perspective scale factor (0..1+, <1 = far, >1 = near) */
  scale: number;
}

/** Project a 3D point to 2D screen coordinates */
export function project(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cam: Camera,
): Projected {
  const dz = Math.max(cam.fov + z - cam.z, 1);
  const scale = cam.fov / dz;
  return {
    sx: cx + (x - cx) * scale,
    sy: cy + (y - cy) * scale,
    scale,
  };
}

/** Project relative to center — x,y are offsets from center */
export function projectCenter(
  x: number,
  y: number,
  z: number,
  cx: number,
  cy: number,
  cam: Camera,
): Projected {
  const dz = Math.max(cam.fov + z - cam.z, 1);
  const scale = cam.fov / dz;
  return { sx: cx + x * scale, sy: cy + y * scale, scale };
}

/** Alpha falloff based on depth — far objects fade out */
export function depthAlpha(
  z: number,
  maxZ: number = MAX_DEPTH,
  base = 1,
): number {
  return base * Math.max(0, 1 - z / maxZ);
}

/** Size scaling — objects shrink with distance */
export function depthSize(
  baseSize: number,
  scale: number,
  minSize = 0.5,
): number {
  return Math.max(minSize, baseSize * scale);
}
