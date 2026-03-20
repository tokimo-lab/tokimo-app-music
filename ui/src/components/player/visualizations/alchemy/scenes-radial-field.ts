import type { DrawCtx, Scene } from "./types";
import { clamp, getFrequencyData, hash } from "./utils";

const TAU = Math.PI * 2;
const PHI_ANGLE = 2.39996323;
const sin = Math.sin;
const cos = Math.cos;

function neon(
  ctx: CanvasRenderingContext2D,
  hue: number,
  alpha = 0.5,
  blur = 14,
) {
  const c = `hsl(${hue},85%,45%)`;
  ctx.globalAlpha = clamp(alpha, 0.3, 0.7);
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.shadowColor = `hsl(${hue},90%,55%)`;
  ctx.shadowBlur = blur;
}

function snoise(x: number, y: number): number {
  return (
    (sin(x * 1.3 + y * 0.7) * sin(y * 1.1 - x * 0.5) +
      sin(x * 0.3 + y * 2.1) * 0.5) /
    1.5
  );
}

function scr(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  center = false,
) {
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  if (center) ctx.translate(w / 2, h / 2);
}

const nil = () => null;

export const radialFieldScenes: Scene[] = [
  {
    name: "Mandala",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const r = Math.min(w, h) * 0.4;
      scr(ctx, w, h, true);
      for (let layer = 0; layer < 4; layer++) {
        const dir = layer % 2 ? 1 : -1;
        const hue = (time * 25 + layer * 90) % 360;
        const rad = r * (0.3 + layer * 0.18) * (0.8 + audio.bass * 0.4);
        ctx.save();
        ctx.rotate(time * 0.3 * dir);
        neon(ctx, hue);
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const a = (TAU / 8) * i;
          const px = cos(a) * rad * 0.4;
          const py = sin(a) * rad * 0.4;
          ctx.beginPath();
          ctx.arc(px, py, rad * (0.3 + audio.mid * 0.15), a - 0.5, a + 0.5);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    },
  },
  {
    name: "Kaleidoscope",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const r = Math.min(w, h) * 0.42;
      const seg = 12;
      scr(ctx, w, h, true);
      for (let i = 0; i < seg; i++) {
        ctx.save();
        ctx.rotate((TAU / seg) * i);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(r, 0);
        ctx.lineTo(r * cos(TAU / seg), r * sin(TAU / seg));
        ctx.closePath();
        ctx.clip();
        for (let j = 0; j < 5; j++) {
          const hue = (time * 30 + j * 72 + i * 10) % 360;
          const d = r * (0.2 + j * 0.15);
          const wb = sin(time * 1.5 + j) * r * 0.05;
          neon(ctx, hue, 0.45);
          ctx.beginPath();
          ctx.arc(
            d + wb,
            wb * audio.mid,
            r * 0.08 * (0.5 + audio.energy),
            0,
            TAU,
          );
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    },
  },
  {
    name: "Radar Sweep",
    init: () => ({
      dots: [] as { a: number; d: number; t: number; h: number }[],
    }),
    draw: (dc: DrawCtx, state: unknown) => {
      const { ctx, w, h, time, audio } = dc;
      type Dot = { a: number; d: number; t: number; h: number };
      const s = state as { dots: Dot[] };
      const r = Math.min(w, h) * 0.4;
      const sweep = (time * 0.8) % TAU;
      scr(ctx, w, h, true);
      const hue = (time * 40) % 360;
      for (let i = 0; i <= 8; i++) {
        neon(ctx, hue, 0.6 - i * 0.035, i === 0 ? 18 : 8);
        ctx.lineWidth = i === 0 ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const a = sweep - i * 0.08;
        ctx.lineTo(cos(a) * r, sin(a) * r);
        ctx.stroke();
      }
      if (audio.energy > 0.1 && dc.frame % 3 === 0) {
        const h2 = hash(dc.frame);
        s.dots.push({
          a: sweep + (h2 - 0.5) * 0.3,
          d: hash(dc.frame * 7) * r,
          t: time,
          h: (hue + h2 * 120) % 360,
        });
      }
      s.dots = s.dots.filter((dot) => {
        const age = time - dot.t;
        if (age > 4) return false;
        neon(ctx, dot.h, clamp(0.6 - age * 0.15, 0.3, 0.6), 8);
        ctx.beginPath();
        ctx.arc(cos(dot.a) * dot.d, sin(dot.a) * dot.d, 3, 0, TAU);
        ctx.fill();
        return true;
      });
      neon(ctx, hue, 0.3, 6);
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, r * i * 0.25, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    name: "Sunflower",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const r = Math.min(w, h) * 0.4;
      scr(ctx, w, h, true);
      ctx.rotate(time * 0.1);
      for (let i = 0; i < 200; i++) {
        const a = i * PHI_ANGLE + time * 0.2;
        const d = Math.sqrt(i / 200) * r;
        const hue = (i * 1.8 + time * 20) % 360;
        const sz = (2 + audio.bass * 4) * (0.5 + (i / 200) * 0.5);
        neon(ctx, hue, 0.5, 8);
        ctx.beginPath();
        ctx.arc(cos(a) * d, sin(a) * d, sz, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    name: "Radial Bars",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const freq = getFrequencyData(dc.analyser, dc.playing);
      const r = Math.min(w, h) * 0.2;
      const n = 64;
      scr(ctx, w, h, true);
      ctx.rotate(time * 0.05);
      for (let i = 0; i < n; i++) {
        const a = (TAU / n) * i;
        const v = freq
          ? freq[Math.floor((i / n) * freq.length)] / 255
          : audio.energy;
        const len = v * r * 1.5 + r * 0.05;
        neon(ctx, ((i * 360) / n + time * 15) % 360, 0.55, 10);
        ctx.lineWidth = ((TAU * r) / n) * 0.6;
        ctx.beginPath();
        ctx.moveTo(cos(a) * r, sin(a) * r);
        ctx.lineTo(cos(a) * (r + len), sin(a) * (r + len));
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    name: "Spiral Arms",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const r = Math.min(w, h) * 0.42;
      scr(ctx, w, h, true);
      for (let arm = 0; arm < 5; arm++) {
        const bh = (arm * 72 + time * 15) % 360;
        const off = (TAU / 5) * arm;
        neon(ctx, bh, 0.4, 12);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let t = 0; t < 100; t++) {
          const f = t / 100;
          const a = f * TAU * 2 + off + time * 0.3;
          const d = f * r * (0.8 + audio.bass * 0.3);
          if (t === 0) ctx.moveTo(cos(a) * d, sin(a) * d);
          else ctx.lineTo(cos(a) * d, sin(a) * d);
        }
        ctx.stroke();
        for (let t = 0; t < 20; t++) {
          const f = t / 20;
          const a = f * TAU * 2 + off + time * 0.3;
          const d = f * r * (0.8 + audio.bass * 0.3);
          neon(ctx, (bh + f * 40) % 360, 0.5, 6);
          ctx.beginPath();
          ctx.arc(cos(a) * d, sin(a) * d, 2 + audio.high * 3 * f, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    },
  },
  {
    name: "Flower Bloom",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const r = Math.min(w, h) * 0.35;
      scr(ctx, w, h, true);
      for (let layer = 0; layer < 3; layer++) {
        const petals = 5 + layer * 2;
        const hue = (time * 20 + layer * 60) % 360;
        const size = r * (0.5 + layer * 0.2) * (0.5 + audio.bass * 0.5);
        ctx.save();
        ctx.rotate(time * 0.2 * (layer % 2 ? 1 : -1));
        neon(ctx, hue, 0.45, 14);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 360; i++) {
          const a = (i * Math.PI) / 180;
          const rr = size * cos(petals * a + time * 0.5);
          const px = Math.abs(rr) * cos(a);
          const py = Math.abs(rr) * sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
  },
  {
    name: "Aurora",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      scr(ctx, w, h);
      for (let r = 0; r < 5; r++) {
        const by = h * (0.25 + r * 0.1) + sin(time * 0.5 + r) * h * 0.05;
        const hue = (120 + r * 25 + time * 10) % 360;
        neon(ctx, hue, 0.35, 20);
        ctx.lineWidth = h * 0.04 * (0.6 + audio.mid * 0.6);
        ctx.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const f = x / w;
          const y =
            by +
            sin(f * 4 + time * 0.8 + r * 1.5) *
              h *
              0.04 *
              (1 + audio.bass * 0.5) +
            sin(f * 7 + time * 1.2) * h * 0.02;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    name: "Interference",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const r = Math.min(w, h);
      const src = [
        { x: w * 0.35, y: h * 0.45 },
        { x: w * 0.65, y: h * 0.45 },
        { x: w * 0.5, y: h * 0.62 },
      ];
      scr(ctx, w, h);
      const sp = r * 0.08 * (0.8 + audio.bass * 0.4);
      for (const s of src) {
        for (let ring = 0; ring < 12; ring++) {
          const rad = (ring * sp + time * 60) % (r * 0.8);
          const hue = (ring * 30 + time * 20 + s.x * 0.5) % 360;
          neon(ctx, hue, clamp(0.5 - ring * 0.015, 0.3, 0.5), 10);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(s.x, s.y, rad, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  {
    name: "Flow Field",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const step = Math.min(w, h) * 0.04;
      const len = step * 0.7 * (0.6 + audio.energy * 0.6);
      scr(ctx, w, h);
      ctx.lineWidth = 1.5;
      for (let x = step; x < w - step; x += step) {
        for (let y = step; y < h - step; y += step) {
          const nx = (x / w) * 4 + time * 0.3;
          const ny = (y / h) * 4 + time * 0.2;
          const a = snoise(nx, ny) * TAU;
          const hue =
            (snoise(nx * 0.5, ny * 0.5) * 180 + 200 + time * 10) % 360;
          neon(ctx, hue, 0.45, 6);
          ctx.beginPath();
          ctx.moveTo(x - cos(a) * len * 0.5, y - sin(a) * len * 0.5);
          ctx.lineTo(x + cos(a) * len * 0.5, y + sin(a) * len * 0.5);
          ctx.stroke();
        }
      }
      ctx.restore();
    },
  },
  {
    name: "Terrain",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      scr(ctx, w, h);
      for (let l = 0; l < 8; l++) {
        const by = h * (0.3 + l * 0.08);
        const hue = (200 + l * 20 + time * 8) % 360;
        neon(ctx, hue, clamp(0.55 - l * 0.03, 0.3, 0.55), 10);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 3) {
          const f = x / w;
          const y =
            by +
            sin(f * 3 + time * 0.4 + l * 0.8) * h * 0.05 +
            sin(f * 7 + l * 2.3) * h * 0.03 +
            sin(f * 13 + time * 0.2 + l) * h * 0.015 * (1 + audio.bass);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    name: "Grid Pulse",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const step = Math.min(w, h) / 20;
      const cx = w / 2;
      const cy = h / 2;
      const md = Math.hypot(cx, cy);
      scr(ctx, w, h);
      for (let gx = step / 2; gx < w; gx += step) {
        for (let gy = step / 2; gy < h; gy += step) {
          const d = Math.hypot(gx - cx, gy - cy);
          const wave = sin(d * 0.04 - time * 3) * 0.5 + 0.5;
          const r = step * 0.15 * (wave + audio.energy * 0.8);
          neon(ctx, ((d / md) * 180 + time * 25) % 360, 0.5, 8);
          ctx.beginPath();
          ctx.arc(gx, gy, Math.max(r, 1), 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    },
  },
  {
    name: "Sine Layers",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      scr(ctx, w, h);
      for (let i = 0; i < 7; i++) {
        const fr = 1.5 + i * 0.7;
        const amp = h * 0.06 * (1 + audio.bass * 0.5);
        const by = h * (0.3 + i * 0.06);
        neon(ctx, (i * 50 + time * 15) % 360, 0.4, 12);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const f = x / w;
          const y =
            by +
            sin(f * TAU * fr + time * (0.8 + i * 0.2)) * amp +
            sin(f * TAU * fr * 2.3 + time * 1.1) * amp * 0.3;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  },
  {
    name: "Liquid Blobs",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const r = Math.min(w, h);
      const cx = w / 2;
      const cy = h / 2;
      scr(ctx, w, h);
      for (let i = 0; i < 5; i++) {
        const a = (TAU / 5) * i + time * 0.3;
        const dist =
          r * 0.15 * (1 + sin(time * 0.7 + i * 1.3) * 0.5 + audio.bass * 0.3);
        const bx = cx + cos(a) * dist;
        const by = cy + sin(a) * dist;
        const br = r * 0.12 * (0.7 + audio.energy * 0.5 + sin(time + i) * 0.2);
        const hue = (i * 72 + time * 12) % 360;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, `hsla(${hue},85%,50%,0.6)`);
        g.addColorStop(0.6, `hsla(${hue},80%,40%,0.3)`);
        g.addColorStop(1, `hsla(${hue},80%,35%,0)`);
        ctx.globalAlpha = 0.6;
        ctx.shadowColor = `hsl(${hue},90%,55%)`;
        ctx.shadowBlur = 20;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    },
  },
  {
    name: "Tunnel Zoom",
    init: nil,
    draw: (dc: DrawCtx) => {
      const { ctx, w, h, time, audio } = dc;
      const r = Math.min(w, h) * 0.45;
      scr(ctx, w, h, true);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 15; i++) {
        const frac = (i / 15 + time * 0.15) % 1;
        const sz = r * frac;
        neon(
          ctx,
          (i * 25 + time * 30) % 360,
          clamp(0.6 - frac * 0.3, 0.3, 0.6),
          12,
        );
        ctx.save();
        ctx.rotate(time * 0.2 + i * 0.1 + audio.mid * 0.5);
        ctx.beginPath();
        for (let s = 0; s <= 6; s++) {
          const a = (TAU / 6) * s;
          if (s === 0) ctx.moveTo(cos(a) * sz, sin(a) * sz);
          else ctx.lineTo(cos(a) * sz, sin(a) * sz);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    },
  },
];
