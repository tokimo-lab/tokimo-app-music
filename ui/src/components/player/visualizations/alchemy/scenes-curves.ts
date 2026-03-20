import type { Scene } from "./types";
import { clamp, lerp } from "./utils";

const TAU = Math.PI * 2;
function glow(
  ctx: CanvasRenderingContext2D,
  hue: number,
  alpha: number,
  blur: number,
  fill?: boolean,
) {
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = clamp(alpha, 0.3, 0.7);
  const col = `hsl(${hue}, 85%, 45%)`;
  if (fill) ctx.fillStyle = col;
  else {
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
  }
  ctx.shadowColor = `hsl(${hue}, 90%, 50%)`;
  ctx.shadowBlur = blur;
}

function S(w: number, h: number) {
  return Math.min(w, h);
}
const rose: Scene = {
  name: "Rose",
  init: () => ({ k: 3, tgt: 5 }),
  draw(dc, raw) {
    const { ctx, w, h, time, audio } = dc;
    const s = raw as { k: number; tgt: number };
    s.k = lerp(s.k, s.tgt, 0.003);
    if (Math.abs(s.k - s.tgt) < 0.05) s.tgt = 2 + Math.floor(Math.random() * 6);
    const r0 = S(w, h) * 0.35 * (0.8 + audio.bass * 0.4);
    ctx.save();
    for (let l = 0; l < 2; l++) {
      const hue = (time * 15 + l * 60) % 360;
      glow(ctx, hue, 0.5 + audio.energy * 0.15, 12 + audio.energy * 8);
      const k = s.k + l * 0.3;
      ctx.beginPath();
      for (let i = 0; i <= 360; i++) {
        const th = (i / 360) * TAU * 6;
        const r = r0 * Math.cos(k * th);
        const x = w / 2 + r * Math.cos(th);
        const y = h / 2 + r * Math.sin(th);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};
const butterfly: Scene = {
  name: "Butterfly",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const sc = S(w, h) * 0.08 * (0.8 + audio.mid * 0.5);
    const hue = (time * 12) % 360;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(time * 0.05);
    glow(ctx, hue, 0.5, 14 + audio.energy * 10);
    ctx.beginPath();
    for (let i = 0; i <= 300; i++) {
      const th = (i / 300) * TAU * 6;
      const r =
        sc *
        (Math.exp(Math.sin(th)) -
          2 * Math.cos(4 * th) +
          Math.sin((2 * th - Math.PI) / 24) ** 5);
      const x = r * Math.sin(th);
      const y = -r * Math.cos(th);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  },
};
const harmonograph: Scene = {
  name: "Harmonograph",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const amp = S(w, h) * 0.3 * (0.7 + audio.energy * 0.5);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let l = 0; l < 3; l++) {
      const hue = (time * 10 + l * 40) % 360;
      glow(ctx, hue, 0.4 + audio.bass * 0.1, 10 + audio.energy * 6);
      const f1 = 2 + l * 0.01 + audio.mid * 0.5;
      const f2 = 3 + l * 0.02 + audio.high * 0.3;
      const d = 0.003 + audio.energy * 0.002;
      ctx.beginPath();
      for (let i = 0; i <= 250; i++) {
        const t = (i / 250) * 40;
        const decay = Math.exp(-d * t);
        const x = amp * Math.sin(f1 * t + l + time * 0.2) * decay;
        const y = amp * Math.sin(f2 * t + time * 0.15) * decay;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};
const maurerRose: Scene = {
  name: "Maurer Rose",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const n = 2 + Math.floor((time * 0.08) % 6);
    const d = 71 + Math.sin(time * 0.06) * 30;
    const r0 = S(w, h) * 0.35 * (0.8 + audio.bass * 0.3);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const hue = (time * 14) % 360;
    glow(ctx, hue, 0.45, 12 + audio.energy * 10);
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) {
      const th = (i * d * Math.PI) / 180;
      const r = r0 * Math.sin(n * th);
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    glow(ctx, (hue + 90) % 360, 0.35, 8);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const th = (i / 200) * TAU * n;
      const r = r0 * Math.sin(n * th);
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  },
};
const lemniscate: Scene = {
  name: "Lemniscate",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const a = S(w, h) * 0.3 * (0.8 + audio.bass * 0.5);
    const hue = (time * 18) % 360;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(time * 0.08);
    glow(ctx, hue, 0.55, 16 + audio.energy * 10);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TAU;
      const denom = 1 + Math.sin(t) ** 2;
      const x = (a * Math.cos(t)) / denom;
      const y = (a * Math.sin(t) * Math.cos(t)) / denom;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  },
};
const hypotrochoid: Scene = {
  name: "Hypotrochoid",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const r0 = S(w, h) * 0.35 * (0.8 + audio.energy * 0.3);
    const R = 5;
    const r = 3 + Math.sin(time * 0.1) * 0.5 + audio.mid;
    const d = 3.5 + audio.bass * 2;
    const norm = r0 / (Math.abs(R - r) + Math.abs(d));
    const hue = (time * 11) % 360;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    glow(ctx, hue, 0.5, 14 + audio.energy * 8);
    ctx.beginPath();
    const dr = R - r;
    for (let i = 0; i <= 300; i++) {
      const t = (i / 300) * TAU * 10;
      const x = norm * (dr * Math.cos(t) + d * Math.cos((dr / r) * t));
      const y = norm * (dr * Math.sin(t) - d * Math.sin((dr / r) * t));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  },
};
const cardioid: Scene = {
  name: "Cardioid",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const a = S(w, h) * 0.15 * (0.8 + audio.bass * 0.5);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let m = 0; m < 2; m++) {
      const hue = (time * 16 + m * 120) % 360;
      glow(ctx, hue, 0.45, 12 + audio.energy * 8);
      ctx.beginPath();
      for (let i = 0; i <= 200; i++) {
        const th = (i / 200) * TAU;
        const r = a * (1 + Math.cos(th));
        let x = r * Math.cos(th);
        const y = r * Math.sin(th);
        if (m === 1) x = -x;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};
const astroid: Scene = {
  name: "Astroid",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const a = S(w, h) * 0.3 * (0.8 + audio.energy * 0.4);
    const hue = (time * 13) % 360;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(time * 0.1);
    glow(ctx, hue, 0.5, 14 + audio.energy * 8);
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TAU;
      const x = a * Math.cos(t) ** 3;
      const y = a * Math.sin(t) ** 3;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  },
};
const lissajous3D: Scene = {
  name: "Lissajous 3D",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const amp = S(w, h) * 0.3 * (0.7 + audio.energy * 0.4);
    const hue = (time * 9) % 360;
    const cosRy = Math.cos(time * 0.15);
    const sinRy = Math.sin(time * 0.15);
    const cosRx = Math.cos(time * 0.1);
    const sinRx = Math.sin(time * 0.1);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    glow(ctx, hue, 0.5, 12 + audio.energy * 8);
    ctx.beginPath();
    const fa = 3 + audio.bass;
    const fb = 2 + audio.mid;
    const fc = 5 + audio.high;
    for (let i = 0; i <= 300; i++) {
      const t = (i / 300) * TAU * 2;
      const px = Math.sin(fa * t + time * 0.3);
      const py = Math.sin(fb * t + time * 0.2);
      const pz = Math.sin(fc * t);
      const x1 = px * cosRy + pz * sinRy;
      const z1 = -px * sinRy + pz * cosRy;
      const y1 = py * cosRx - z1 * sinRx;
      const z2 = py * sinRx + z1 * cosRx;
      const persp = 2 / (3 - z2);
      const sx = x1 * persp * amp;
      const sy = y1 * persp * amp;
      i === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  },
};
interface SfState {
  m: number;
  n1: number;
  n2: number;
  n3: number;
  tm: number;
  tn1: number;
  tn2: number;
  tn3: number;
}
const superformula: Scene = {
  name: "Superformula",
  init: (): SfState => ({
    m: 5,
    n1: 1,
    n2: 1,
    n3: 1,
    tm: 7,
    tn1: 0.3,
    tn2: 1.7,
    tn3: 1.7,
  }),
  draw(dc, raw) {
    const { ctx, w, h, time, audio } = dc;
    const s = raw as SfState;
    s.m = lerp(s.m, s.tm, 0.005);
    s.n1 = lerp(s.n1, s.tn1, 0.005);
    s.n2 = lerp(s.n2, s.tn2, 0.005);
    s.n3 = lerp(s.n3, s.tn3, 0.005);
    if (Math.abs(s.m - s.tm) < 0.1) {
      s.tm = 3 + Math.floor(Math.random() * 8);
      s.tn1 = 0.2 + Math.random() * 2;
      s.tn2 = 0.5 + Math.random() * 2;
      s.tn3 = 0.5 + Math.random() * 2;
    }
    const r0 = S(w, h) * 0.3 * (0.8 + audio.energy * 0.4);
    const hue = (time * 10) % 360;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    glow(ctx, hue, 0.5, 14 + audio.energy * 10);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i <= 300; i++) {
      const th = (i / 300) * TAU;
      const t1 = Math.abs(Math.cos((s.m * th) / 4)) ** s.n2;
      const t2 = Math.abs(Math.sin((s.m * th) / 4)) ** s.n3;
      const r = r0 * (t1 + t2) ** (-1 / s.n1);
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      started = true;
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  },
};
const epitrochoidWeb: Scene = {
  name: "Epitrochoid Web",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const r0 = S(w, h) * 0.3;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (let l = 0; l < 4; l++) {
      const hue = (time * 8 + l * 30) % 360;
      glow(ctx, hue, 0.35 + audio.energy * 0.1, 10 + audio.energy * 6);
      const R = 3 + l * 0.3;
      const r = 1 + audio.mid + l * 0.2;
      const d = 2 + audio.bass * 1.5 + l * 0.1;
      const norm = r0 / (R + r + Math.abs(d));
      const phase = time * 0.1 + l * 0.5;
      ctx.beginPath();
      for (let i = 0; i <= 250; i++) {
        const t = (i / 250) * TAU * 8 + phase;
        const x =
          norm * ((R + r) * Math.cos(t) - d * Math.cos(((R + r) / r) * t));
        const y =
          norm * ((R + r) * Math.sin(t) - d * Math.sin(((R + r) / r) * t));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  },
};
const sineFlower: Scene = {
  name: "Sine Flower",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const r0 = S(w, h) * 0.35 * (0.8 + audio.mid * 0.4);
    const k = 2.5 + Math.sin(time * 0.07) * 1.5 + audio.high * 2;
    const hue = (time * 14) % 360;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(time * 0.03);
    glow(ctx, hue, 0.5, 14 + audio.energy * 8);
    ctx.beginPath();
    for (let i = 0; i <= 360; i++) {
      const th = (i / 360) * TAU * 8;
      const r = r0 * Math.sin(k * th);
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  },
};
const fermatSpiral: Scene = {
  name: "Fermat Spiral",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const maxR = S(w, h) * 0.38;
    const N = 200;
    const golden = Math.PI * (3 - Math.sqrt(5));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const baseHue = (time * 8) % 360;
    for (let i = 0; i < N; i++) {
      const r = maxR * Math.sqrt(i / N);
      const th = i * golden + time * 0.3;
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      const dotR = 1.5 + audio.energy * 2 + (i % 8 === 0 ? audio.bass * 2 : 0);
      const hue = (baseHue + i * 0.8) % 360;
      glow(ctx, hue, 0.45, 8 + audio.energy * 6, true);
      ctx.beginPath();
      ctx.arc(x, y, dotR, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};
const pendulumWave: Scene = {
  name: "Pendulum Wave",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio } = dc;
    const count = 15;
    const swing = S(w, h) * 0.35 * 0.4 * (0.7 + audio.bass * 0.5);
    const spacing = (S(w, h) * 0.6) / count;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    const anchor = -S(w, h) * 0.16;
    for (let i = 0; i < count; i++) {
      const freq = 10 + i * 0.5 + audio.energy * 3;
      const py = Math.sin(freq * time * 0.15) * swing;
      const px = (i - count / 2 + 0.5) * spacing;
      const hue = (time * 12 + i * 20) % 360;
      glow(ctx, hue, 0.3, 4);
      ctx.beginPath();
      ctx.moveTo(px, anchor);
      ctx.lineTo(px, py);
      ctx.stroke();
      glow(ctx, hue, 0.5, 12 + audio.energy * 6, true);
      ctx.beginPath();
      ctx.arc(px, py, 3 + audio.energy * 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};
const waveformRing: Scene = {
  name: "Waveform Ring",
  init: () => null,
  draw(dc) {
    const { ctx, w, h, time, audio, analyser, playing } = dc;
    const baseR = S(w, h) * 0.25;
    const hue = (time * 10) % 360;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(time * 0.02);
    let data: Uint8Array<ArrayBuffer> | null = null;
    if (analyser && playing) {
      data = new Uint8Array(
        analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
      analyser.getByteFrequencyData(data);
    }
    const N = 180;
    const rings: [number, number, number, number][] = [
      [0, 0.55, 14 + audio.energy * 10, 0.12],
      [60, 0.35, 8, 0.08],
    ];
    for (const [hOff, alpha, blur, scale] of rings) {
      const rBase = hOff === 0 ? baseR : baseR * 0.6;
      glow(ctx, (hue + hOff) % 360, alpha, blur);
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU;
        const idx = hOff === 0 ? i : N - i;
        const a = data
          ? (data[Math.floor((idx / N) * data.length)] / 255) * S(w, h) * scale
          : 0;
        const r = rBase + a;
        const x = r * Math.cos(th);
        const y = r * Math.sin(th);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  },
};

export const curveScenes: Scene[] = [
  rose,
  butterfly,
  harmonograph,
  maurerRose,
  lemniscate,
  hypotrochoid,
  cardioid,
  astroid,
  lissajous3D,
  superformula,
  epitrochoidWeb,
  sineFlower,
  fermatSpiral,
  pendulumWave,
  waveformRing,
];
