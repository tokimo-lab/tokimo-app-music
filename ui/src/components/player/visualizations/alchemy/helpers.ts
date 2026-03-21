/** Shared rendering helpers for Alchemy scenes */
import { clamp } from "./utils";

const TAU = Math.PI * 2;

export { TAU };

/** Set up neon glow style (stroke mode by default) */
export function neon(
  ctx: CanvasRenderingContext2D,
  hue: number,
  alpha = 0.5,
  blur = 14,
  fill = false,
) {
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = clamp(alpha, 0.3, 0.7);
  const c = `hsl(${hue},85%,45%)`;
  if (fill) ctx.fillStyle = c;
  else {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
  }
  ctx.shadowColor = `hsl(${hue},90%,55%)`;
  ctx.shadowBlur = blur;
}

/** Set up glow style for particles (sets fill + stroke + shadow) */
export function glow(
  ctx: CanvasRenderingContext2D,
  hue: number,
  s = 85,
  l = 45,
  blur = 12,
) {
  const c = `hsl(${hue},${s}%,${l}%)`;
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.shadowColor = c;
  ctx.shadowBlur = blur;
}

/** Enter screen-blend save scope, optionally translate to center */
export function scr(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center = false,
) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  if (center) ctx.translate(w / 2, h / 2);
}

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
