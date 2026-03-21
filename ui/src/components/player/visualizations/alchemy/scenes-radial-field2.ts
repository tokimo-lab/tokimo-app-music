import { neon, S, scr, snoise, TAU } from "./helpers";
import { depthAlpha, depthSize, project, projectCenter } from "./perspective";
import type { Scene } from "./types";
import { clamp } from "./utils";

const { sin, cos, hypot, max } = Math;
const nil = () => null;

const interference: Scene = {
  name: "Interference",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r = S(w, h);
    const cx = w / 2,
      cy = h / 2;
    const sources = [
      { x: -w * 0.15, y: -h * 0.05, z: 0 },
      { x: w * 0.15, y: -h * 0.05, z: 150 },
      { x: 0, y: h * 0.12, z: 300 },
    ];
    const sp = r * 0.08 * (0.8 + audio.bass * 0.4);
    ctx.save();
    for (const src of sources) {
      const p = projectCenter(src.x, src.y, src.z, cx, cy, cam);
      for (let ring = 0; ring < 12; ring++) {
        const rad = (ring * sp + time * 60) % (r * 0.8);
        const hue = (ring * 30 + time * 20 + (src.x + cx) * 0.5) % 360;
        neon(
          ctx,
          hue,
          clamp(0.5 - ring * 0.015, 0.3, 0.5) * depthAlpha(src.z, 400),
          10,
        );
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, rad * p.scale, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};

const flowField: Scene = {
  name: "Flow Field",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const step = S(w, h) * 0.04;
    const len = step * 0.7 * (0.6 + audio.energy * 0.6);
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    ctx.lineWidth = 1.5;
    for (let x = step; x < w - step; x += step) {
      for (let y = step; y < h - step; y += step) {
        const nx = (x / w) * 4 + time * 0.3;
        const ny = (y / h) * 4 + time * 0.2;
        const a = snoise(nx, ny) * TAU;
        const z = (snoise(nx * 0.7, ny * 0.7) * 0.5 + 0.5) * 200;
        const hue = (snoise(nx * 0.5, ny * 0.5) * 180 + 200 + time * 10) % 360;
        neon(ctx, hue, 0.45 * depthAlpha(z, 300), 6);
        const p0 = project(
          x - cos(a) * len * 0.5,
          y - sin(a) * len * 0.5,
          z,
          cx,
          cy,
          cam,
        );
        const p1 = project(
          x + cos(a) * len * 0.5,
          y + sin(a) * len * 0.5,
          z,
          cx,
          cy,
          cam,
        );
        ctx.beginPath();
        ctx.moveTo(p0.sx, p0.sy);
        ctx.lineTo(p1.sx, p1.sy);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};

const terrain: Scene = {
  name: "Terrain",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let l = 0; l < 8; l++) {
      const by = h * (0.3 + l * 0.08);
      const hue = (200 + l * 20 + time * 8) % 360;
      const z = l * 60;
      neon(
        ctx,
        hue,
        clamp(0.55 - l * 0.03, 0.3, 0.55) * depthAlpha(z, 600),
        10,
        true,
      );
      ctx.beginPath();
      const pb = project(0, h, z, cx, cy, cam);
      ctx.moveTo(pb.sx, pb.sy);
      for (let x = 0; x <= w; x += 3) {
        const f = x / w;
        const y =
          by +
          sin(f * 3 + time * 0.4 + l * 0.8) * h * 0.05 +
          sin(f * 7 + l * 2.3) * h * 0.03 +
          sin(f * 13 + time * 0.2 + l) * h * 0.015 * (1 + audio.bass);
        const p = project(x, y, z, cx, cy, cam);
        ctx.lineTo(p.sx, p.sy);
      }
      const pe = project(w, h, z, cx, cy, cam);
      ctx.lineTo(pe.sx, pe.sy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
};

const gridPulse: Scene = {
  name: "Grid Pulse",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const step = S(w, h) / 20;
    const cx = w / 2,
      cy = h / 2;
    const md = hypot(cx, cy);
    ctx.save();
    for (let gx = step / 2; gx < w; gx += step) {
      for (let gy = step / 2; gy < h; gy += step) {
        const d = hypot(gx - cx, gy - cy);
        const wave = sin(d * 0.04 - time * 3) * 0.5 + 0.5;
        const z = (d / md) * 300;
        const dotR = step * 0.15 * (wave + audio.energy * 0.8);
        const { sx, sy, scale } = project(gx, gy, z, cx, cy, cam);
        neon(
          ctx,
          ((d / md) * 180 + time * 25) % 360,
          0.5 * depthAlpha(z, 400),
          8,
          true,
        );
        ctx.beginPath();
        ctx.arc(sx, sy, depthSize(max(dotR, 1), scale, 0.5), 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  },
};

const sineLayers: Scene = {
  name: "Sine Layers",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const fr = 1.5 + i * 0.7;
      const amp = h * 0.06 * (1 + audio.bass * 0.5);
      const by = h * (0.3 + i * 0.06);
      const z = i * 50;
      neon(ctx, (i * 50 + time * 15) % 360, 0.4 * depthAlpha(z, 400), 12);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const f = x / w;
        const y =
          by +
          sin(f * TAU * fr + time * (0.8 + i * 0.2)) * amp +
          sin(f * TAU * fr * 2.3 + time * 1.1) * amp * 0.3;
        const { sx, sy } = project(x, y, z, cx, cy, cam);
        x === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};

const liquidBlobs: Scene = {
  name: "Liquid Blobs",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r = S(w, h);
    const cx = w / 2,
      cy = h / 2;
    scr(ctx, w, h);
    for (let i = 0; i < 5; i++) {
      const a = (TAU / 5) * i + time * 0.3;
      const dist =
        r * 0.15 * (1 + sin(time * 0.7 + i * 1.3) * 0.5 + audio.bass * 0.3);
      const bx = cos(a) * dist;
      const by = sin(a) * dist;
      const z = i * 80;
      const { sx, sy, scale } = projectCenter(bx, by, z, cx, cy, cam);
      const br = depthSize(
        r * 0.12 * (0.7 + audio.energy * 0.5 + sin(time + i) * 0.2),
        scale,
        4,
      );
      const hue = (i * 72 + time * 12) % 360;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, br);
      g.addColorStop(0, `hsla(${hue},85%,50%,0.6)`);
      g.addColorStop(0.6, `hsla(${hue},80%,40%,0.3)`);
      g.addColorStop(1, `hsla(${hue},80%,35%,0)`);
      ctx.globalAlpha = 0.6 * depthAlpha(z, 500);
      ctx.shadowColor = `hsl(${hue},90%,55%)`;
      ctx.shadowBlur = 20;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, br, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

const tunnelZoom: Scene = {
  name: "Tunnel Zoom",
  init: nil,
  draw(dc) {
    const { ctx, w, h, time, audio, cam } = dc;
    const r = S(w, h) * 0.45;
    const cx = w / 2,
      cy = h / 2;
    ctx.save();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 15; i++) {
      const frac = (i / 15 + time * 0.15) % 1;
      const sz = r * frac;
      const z = frac * 800;
      const rot = time * 0.2 + i * 0.1 + audio.mid * 0.5;
      const cosR = cos(rot),
        sinR = sin(rot);
      neon(
        ctx,
        (i * 25 + time * 30) % 360,
        clamp(0.6 - frac * 0.3, 0.3, 0.6) * depthAlpha(z, 900),
        12,
      );
      ctx.beginPath();
      for (let s = 0; s <= 6; s++) {
        const a = (TAU / 6) * s;
        const px = cos(a) * sz;
        const py = sin(a) * sz;
        const rx = px * cosR - py * sinR;
        const ry = px * sinR + py * cosR;
        const { sx, sy } = projectCenter(rx, ry, z, cx, cy, cam);
        s === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  },
};

export const radialFieldScenes2: Scene[] = [
  interference,
  flowField,
  terrain,
  gridPulse,
  sineLayers,
  liquidBlobs,
  tunnelZoom,
];
