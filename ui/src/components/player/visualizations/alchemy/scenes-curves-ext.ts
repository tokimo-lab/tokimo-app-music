import { S, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { lerp } from "./utils";

const lissajous3D: Scene = {
  name: "Lissajous 3D",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const amp = S(w, h) * 0.3 * (0.7 + audio.energy * 0.4);
    const hue = (time * 9) % 360;
    const cosRy = Math.cos(time * 0.15);
    const sinRy = Math.sin(time * 0.15);
    const cosRx = Math.cos(time * 0.1);
    const sinRx = Math.sin(time * 0.1);
    const [r, g, b] = hsl(hue, 85, 45);
    buf.lineStart();
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
      buf.lineTo(x1 * amp, y1 * amp, z2 * 200, r, g, b, 0.5);
    }
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
    const { buf, w, h, time, audio } = dc;
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
    const [r, g, b] = hsl(hue, 85, 45);
    buf.lineStart();
    for (let i = 0; i <= 300; i++) {
      const th = (i / 300) * TAU;
      const t1 = Math.abs(Math.cos((s.m * th) / 4)) ** s.n2;
      const t2 = Math.abs(Math.sin((s.m * th) / 4)) ** s.n3;
      const rr = r0 * (t1 + t2) ** (-1 / s.n1);
      const x = rr * Math.cos(th);
      const y = rr * Math.sin(th);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        buf.lineStart();
        continue;
      }
      const z = Math.sin(th * 2 + time) * 100;
      buf.lineTo(x, y, z, r, g, b, 0.5);
    }
  },
};

const epitrochoidWeb: Scene = {
  name: "Epitrochoid Web",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r0 = S(w, h) * 0.3;
    for (let l = 0; l < 4; l++) {
      const hue = (time * 8 + l * 30) % 360;
      const [r, g, b] = hsl(hue, 85, 45);
      const alpha = 0.35 + audio.energy * 0.1;
      const R = 3 + l * 0.3;
      const rr = 1 + audio.mid + l * 0.2;
      const d = 2 + audio.bass * 1.5 + l * 0.1;
      const norm = r0 / (R + rr + Math.abs(d));
      const phase = time * 0.1 + l * 0.5;
      const baseZ = l * 100;
      buf.lineStart();
      for (let i = 0; i <= 250; i++) {
        const t = (i / 250) * TAU * 8 + phase;
        const x =
          norm * ((R + rr) * Math.cos(t) - d * Math.cos(((R + rr) / rr) * t));
        const y =
          norm * ((R + rr) * Math.sin(t) - d * Math.sin(((R + rr) / rr) * t));
        const z = baseZ + Math.sin(t * 0.5) * 50;
        buf.lineTo(x, y, z, r, g, b, alpha);
      }
    }
  },
};

const sineFlower: Scene = {
  name: "Sine Flower",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r0 = S(w, h) * 0.35 * (0.8 + audio.mid * 0.4);
    const k = 2.5 + Math.sin(time * 0.07) * 1.5 + audio.high * 2;
    const hue = (time * 14) % 360;
    const rot = time * 0.03;
    const cosRot = Math.cos(rot);
    const sinRot = Math.sin(rot);
    const [r, g, b] = hsl(hue, 85, 45);
    buf.lineStart();
    for (let i = 0; i <= 360; i++) {
      const th = (i / 360) * TAU * 8;
      const rr = r0 * Math.sin(k * th);
      const bx = rr * Math.cos(th);
      const by = rr * Math.sin(th);
      const rx = bx * cosRot - by * sinRot;
      const ry = bx * sinRot + by * cosRot;
      const z = Math.sin(k * th * 0.5) * 100;
      buf.lineTo(rx, ry, z, r, g, b, 0.5);
    }
  },
};

const fermatSpiral: Scene = {
  name: "Fermat Spiral",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const maxR = S(w, h) * 0.38;
    const N = 200;
    const golden = Math.PI * (3 - Math.sqrt(5));
    const baseHue = (time * 8) % 360;
    const maxZ = 1200;
    for (let i = 0; i < N; i++) {
      const frac = i / N;
      const rr = maxR * Math.sqrt(frac);
      const th = i * golden + time * 0.3;
      const x = rr * Math.cos(th);
      const y = rr * Math.sin(th);
      const z = frac * 300;
      const dotR = 1.5 + audio.energy * 2 + (i % 8 === 0 ? audio.bass * 2 : 0);
      const hue = (baseHue + i * 0.8) % 360;
      const [r, g, b] = hsl(hue, 85, 45);
      const da = Math.max(0, 1 - z / maxZ);
      buf.point(x, y, z, r, g, b, 0.45 * da, dotR);
    }
  },
};

const pendulumWave: Scene = {
  name: "Pendulum Wave",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const count = 15;
    const swing = S(w, h) * 0.35 * 0.4 * (0.7 + audio.bass * 0.5);
    const spacing = (S(w, h) * 0.6) / count;
    const anchor = -S(w, h) * 0.16;
    for (let i = 0; i < count; i++) {
      const freq = 10 + i * 0.5 + audio.energy * 3;
      const py = Math.sin(freq * time * 0.15) * swing;
      const px = (i - count / 2 + 0.5) * spacing;
      const z = i * 20 - (count / 2) * 20;
      const hue = (time * 12 + i * 20) % 360;
      const [r, g, b] = hsl(hue, 85, 45);
      buf.lineStart();
      buf.lineTo(px, anchor, z, r, g, b, 0.3);
      buf.lineTo(px, py, z, r, g, b, 0.3);
      const ballR = 3 + audio.energy * 3;
      buf.point(px, py, z, r, g, b, 0.5, ballR);
    }
  },
};

const waveformRing: Scene = {
  name: "Waveform Ring",
  init: () => null,
  draw(dc) {
    const { buf, w, h, time, analyser, playing } = dc;
    const baseR = S(w, h) * 0.25;
    const hue = (time * 10) % 360;
    const rot = time * 0.02;
    const cosRot = Math.cos(rot);
    const sinRot = Math.sin(rot);
    let data: Uint8Array<ArrayBuffer> | null = null;
    if (analyser && playing) {
      data = new Uint8Array(
        analyser.frequencyBinCount,
      ) as Uint8Array<ArrayBuffer>;
      analyser.getByteFrequencyData(data);
    }
    const N = 180;
    const rings: [number, number, number][] = [
      [0, 0.55, 0.12],
      [60, 0.35, 0.08],
    ];
    for (const [hOff, alpha, scale] of rings) {
      const rBase = hOff === 0 ? baseR : baseR * 0.6;
      const [r, g, b] = hsl((hue + hOff) % 360, 85, 45);
      buf.lineStart();
      for (let i = 0; i <= N; i++) {
        const th = (i / N) * TAU;
        const idx = hOff === 0 ? i : N - i;
        const a = data
          ? (data[Math.floor((idx / N) * data.length)] / 255) * S(w, h) * scale
          : 0;
        const rr = rBase + a;
        const bx = rr * Math.cos(th);
        const by = rr * Math.sin(th);
        const rx = bx * cosRot - by * sinRot;
        const ry = bx * sinRot + by * cosRot;
        const z = Math.sin(th * 2) * 80;
        buf.lineTo(rx, ry, z, r, g, b, alpha);
      }
    }
  },
};

export const extCurveScenes: Scene[] = [
  lissajous3D,
  superformula,
  epitrochoidWeb,
  sineFlower,
  fermatSpiral,
  pendulumWave,
  waveformRing,
];
