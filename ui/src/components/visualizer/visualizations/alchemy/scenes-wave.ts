import { S, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { clamp, hash, lerp } from "./utils";

const { sin, cos, sqrt, abs, PI, floor } = Math;
const nil = () => null;

// ── 1. Standing Wave ─────────────────────────────────────────────────────────

const standingWave: Scene = {
  name: "Standing Wave",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.4;
    const modes = 6;
    const bands = [audio.bass, audio.mid, audio.high, audio.energy];
    for (let m = 1; m <= modes; m++) {
      const intensity = bands[(m - 1) % 4] * 0.6 + 0.4;
      const hue = (time * 12 + m * 50) % 360;
      const [cr, cg, cb] = hsl(hue, 82, 48);
      const z = (m - 1) * 60;
      const alpha = clamp(0.55 * intensity, 0.3, 0.7);
      const yOff = ((m - (modes + 1) / 2) / modes) * r * 1.2;
      const omega = 1.5 + m * 0.4;
      buf.lineStart();
      for (let i = 0; i <= 120; i++) {
        const f = i / 120;
        const x = (f - 0.5) * r * 2;
        const envelope = sin(m * PI * f) * cos(omega * time) * intensity;
        const y = yOff + envelope * r * 0.15;
        buf.lineTo(x, y, z, cr, cg, cb, alpha);
      }
    }
  },
};

// ── 2. Chladni Pattern ───────────────────────────────────────────────────────

const chladniPattern: Scene = {
  name: "Chladni Pattern",
  init: () => ({ n: 3, m: 5, tn: 3, tm: 5 }),
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const s = raw as { n: number; m: number; tn: number; tm: number };
    s.n = lerp(s.n, s.tn, 0.01);
    s.m = lerp(s.m, s.tm, 0.01);
    if (abs(s.n - s.tn) < 0.05 && abs(s.m - s.tm) < 0.05) {
      s.tn = 1 + floor(hash(floor(time * 0.3)) * 6);
      s.tm = s.tn + 1 + floor(hash(floor(time * 0.3) + 99) * 4);
    }
    const r = S(w, h) * 0.38;
    const hue = (time * 15) % 360;
    const [cr, cg, cb] = hsl(hue, 80, 50);
    const step = 8;
    const thresh = 0.08 + audio.energy * 0.06;
    for (let gx = -r; gx <= r; gx += step) {
      for (let gy = -r; gy <= r; gy += step) {
        const fx = (gx / r + 1) * 0.5;
        const fy = (gy / r + 1) * 0.5;
        const val =
          cos(s.n * PI * fx) * cos(s.m * PI * fy) -
          cos(s.m * PI * fx) * cos(s.n * PI * fy);
        if (abs(val) < thresh) {
          const z = abs(val) * 300;
          const alpha = clamp(0.6 - abs(val) * 4, 0.3, 0.65);
          buf.point(gx, gy, z, cr, cg, cb, alpha, 2 + audio.bass * 2);
        }
      }
    }
    // draw boundary square
    const ba = clamp(0.35 + audio.mid * 0.1, 0.2, 0.5);
    const [br, bg, bb] = hsl((hue + 180) % 360, 70, 40);
    buf.lineStart();
    buf.lineTo(-r, -r, 0, br, bg, bb, ba);
    buf.lineTo(r, -r, 0, br, bg, bb, ba);
    buf.lineTo(r, r, 0, br, bg, bb, ba);
    buf.lineTo(-r, r, 0, br, bg, bb, ba);
    buf.lineTo(-r, -r, 0, br, bg, bb, ba);
  },
};

// ── 3. Cymatics ──────────────────────────────────────────────────────────────

const cymatics: Scene = {
  name: "Cymatics",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.4;
    const modeN = 2 + floor(audio.bass * 4);
    const modeM = 1 + floor(audio.mid * 3);
    const hue = (time * 18) % 360;
    // concentric rings: approximate Bessel zero crossings
    for (let k = 1; k <= 6; k++) {
      const ringR = (r * k) / 7;
      const z = k * 40;
      const amp = sin(k * 1.2 - time * 2) * audio.energy * 0.3 + 0.7;
      const alpha = clamp(0.5 * amp, 0.3, 0.65);
      const [cr, cg, cb] = hsl((hue + k * 30) % 360, 85, 45);
      const wobble = sin(time * 1.5 + k) * r * 0.02 * audio.bass;
      buf.circle(0, 0, z, ringR + wobble, cr, cg, cb, alpha, 48);
    }
    // radial nodal lines
    const radials = modeN * 2;
    const [lr, lg, lb] = hsl((hue + 90) % 360, 78, 50);
    for (let i = 0; i < radials; i++) {
      const a = (TAU / radials) * i + time * 0.1;
      const z = 20;
      const alpha = clamp(0.4 + audio.high * 0.15, 0.25, 0.6);
      buf.lineStart();
      buf.lineTo(0, 0, z, lr, lg, lb, alpha * 0.5);
      const endR = r * (0.6 + modeM * 0.08);
      buf.lineTo(cos(a) * endR, sin(a) * endR, z, lr, lg, lb, alpha);
    }
  },
};

// ── 4. Ripple Tank ───────────────────────────────────────────────────────────

const rippleTank: Scene = {
  name: "Ripple Tank",
  init: () => ({
    rings: [] as { sx: number; sy: number; birth: number; hue: number }[],
    lastEmit: 0,
  }),
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    type Ring = { sx: number; sy: number; birth: number; hue: number };
    const s = raw as { rings: Ring[]; lastEmit: number };
    const r = S(w, h) * 0.35;
    const speed = 80 + audio.energy * 120;
    const nSources = 3;
    const interval = clamp(0.25 - audio.bass * 0.12, 0.08, 0.4);
    if (time - s.lastEmit > interval) {
      s.lastEmit = time;
      for (let i = 0; i < nSources; i++) {
        const a = (TAU / nSources) * i + time * 0.3;
        const d = r * 0.3;
        s.rings.push({
          sx: cos(a) * d,
          sy: sin(a) * d,
          birth: time,
          hue: (time * 20 + i * 120) % 360,
        });
      }
    }
    s.rings = s.rings.filter((ring) => {
      const age = time - ring.birth;
      if (age > 3) return false;
      const radius = age * speed;
      const fade = 1 - age / 3;
      const alpha = clamp(0.5 * fade, 0.15, 0.6);
      const z = age * 60;
      const [cr, cg, cb] = hsl(ring.hue, 82, 48);
      buf.circle(ring.sx, ring.sy, z, radius, cr, cg, cb, alpha, 40);
      return true;
    });
  },
};

// ── 5. String Harmonics ──────────────────────────────────────────────────────

const stringHarmonics: Scene = {
  name: "String Harmonics",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.42;
    const strings = 8;
    const bands = [audio.bass, audio.mid, audio.high, audio.energy];
    for (let n = 1; n <= strings; n++) {
      const yBase = ((n - (strings + 1) / 2) / strings) * r * 1.4;
      const amp = bands[(n - 1) % 4] * r * 0.08 + r * 0.01;
      const freq = 0.8 + n * 0.3;
      const hue = (time * 10 + n * 40) % 360;
      const [cr, cg, cb] = hsl(hue, 85, 48);
      const z = (n - 1) * 40;
      const alpha = clamp(0.5 + bands[(n - 1) % 4] * 0.15, 0.35, 0.7);
      buf.lineStart();
      for (let i = 0; i <= 100; i++) {
        const f = i / 100;
        const x = (f - 0.5) * r * 2;
        const y = yBase + sin(n * PI * f) * sin(freq * time) * amp;
        buf.lineTo(x, y, z, cr, cg, cb, alpha);
      }
      // fixed endpoints
      const sz = 2.5 + bands[(n - 1) % 4] * 2;
      buf.point(-r, yBase, z, cr, cg, cb, alpha * 0.8, sz);
      buf.point(r, yBase, z, cr, cg, cb, alpha * 0.8, sz);
    }
  },
};

// ── 6. Doppler Rings ─────────────────────────────────────────────────────────

const dopplerRings: Scene = {
  name: "Doppler Rings",
  init: () => ({
    rings: [] as { x: number; y: number; birth: number; hue: number }[],
    lastEmit: 0,
  }),
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    type DRing = { x: number; y: number; birth: number; hue: number };
    const s = raw as { rings: DRing[]; lastEmit: number };
    const r = S(w, h) * 0.35;
    const orbitR = r * 0.35;
    const orbitSpeed = 1.2 + audio.mid * 1.5;
    const srcA = time * orbitSpeed;
    const srcX = cos(srcA) * orbitR;
    const srcY = sin(srcA) * orbitR;
    const emitRate = clamp(0.1 - audio.bass * 0.04, 0.04, 0.2);
    if (time - s.lastEmit > emitRate) {
      s.lastEmit = time;
      s.rings.push({
        x: srcX,
        y: srcY,
        birth: time,
        hue: (time * 25) % 360,
      });
    }
    const waveSpeed = 140 + audio.energy * 80;
    s.rings = s.rings.filter((ring) => {
      const age = time - ring.birth;
      if (age > 2.5) return false;
      const radius = age * waveSpeed;
      const fade = 1 - age / 2.5;
      const z = age * 50;
      const alpha = clamp(0.55 * fade, 0.12, 0.6);
      const [cr, cg, cb] = hsl(ring.hue, 80, 50);
      buf.circle(ring.x, ring.y, z, radius, cr, cg, cb, alpha, 48);
      return true;
    });
    // draw source
    const [sr, sg, sb] = hsl((time * 25) % 360, 90, 55);
    buf.point(srcX, srcY, 0, sr, sg, sb, 0.7, 5 + audio.bass * 4);
    // orbit path
    buf.circle(0, 0, 10, orbitR, sr, sg, sb, 0.2, 48);
  },
};

// ── 7. Soliton Collision ─────────────────────────────────────────────────────

const solitonCollision: Scene = {
  name: "Soliton Collision",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.42;
    const speed = 0.6 + audio.energy * 0.4;
    const amp = r * 0.12 * (0.6 + audio.bass * 0.8);
    const tracks = 5;
    for (let t = 0; t < tracks; t++) {
      const yBase = ((t - (tracks - 1) / 2) / tracks) * r * 1.0;
      const z = t * 60;
      const hue = (time * 14 + t * 65) % 360;
      const [cr, cg, cb] = hsl(hue, 85, 46);
      const alpha = clamp(0.5, 0.3, 0.65);
      const phase = time * speed + t * 0.4;
      // two solitons moving in opposite directions
      const pos1 = (((phase * 0.5) % 2) - 1) * r;
      const pos2 = -(((phase * 0.5 + 0.7) % 2) - 1) * r;
      const width = r * 0.15;
      buf.lineStart();
      for (let i = 0; i <= 120; i++) {
        const f = i / 120;
        const x = (f - 0.5) * r * 2;
        const d1 = x - pos1;
        const d2 = x - pos2;
        const sech1 = 1 / Math.cosh(d1 / width);
        const sech2 = 1 / Math.cosh(d2 / width);
        const y = yBase + (sech1 + sech2) * amp;
        buf.lineTo(x, y, z, cr, cg, cb, alpha);
      }
    }
  },
};

// ── 8. Double Slit ───────────────────────────────────────────────────────────

const doubleSlit: Scene = {
  name: "Double Slit",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.4;
    const slitSep = r * (0.2 + audio.mid * 0.15);
    const waveLen = 18 + audio.high * 12;
    const k = TAU / waveLen;
    const hue = (time * 16) % 360;
    const slit1Y = -slitSep / 2;
    const slit2Y = slitSep / 2;
    const slitX = -r * 0.6;
    const stepX = 10;
    const stepY = 10;
    for (let gx = slitX + 20; gx <= r; gx += stepX) {
      for (let gy = -r; gy <= r; gy += stepY) {
        const d1 = sqrt((gx - slitX) ** 2 + (gy - slit1Y) ** 2);
        const d2 = sqrt((gx - slitX) ** 2 + (gy - slit2Y) ** 2);
        const wave1 = sin(k * d1 - time * 3);
        const wave2 = sin(k * d2 - time * 3);
        const combined = (wave1 + wave2) * 0.5;
        const intensity = (combined + 1) * 0.5;
        const z = intensity * 150;
        const alpha = clamp(intensity * 0.55, 0.1, 0.6);
        const [cr, cg, cb] = hsl(
          (hue + intensity * 60) % 360,
          80,
          40 + intensity * 15,
        );
        buf.point(gx, gy, z, cr, cg, cb, alpha, 1.5 + intensity * 2);
      }
    }
    // draw barrier with slits
    const [br, bg, bb] = hsl((hue + 180) % 360, 70, 42);
    buf.lineStart();
    buf.lineTo(slitX, -r, 0, br, bg, bb, 0.5);
    buf.lineTo(slitX, slit1Y - 6, 0, br, bg, bb, 0.5);
    buf.lineStart();
    buf.lineTo(slitX, slit1Y + 6, 0, br, bg, bb, 0.5);
    buf.lineTo(slitX, slit2Y - 6, 0, br, bg, bb, 0.5);
    buf.lineStart();
    buf.lineTo(slitX, slit2Y + 6, 0, br, bg, bb, 0.5);
    buf.lineTo(slitX, r, 0, br, bg, bb, 0.5);
  },
};

// ── 9. Pendulum Wave ─────────────────────────────────────────────────────────

const pendulumWave: Scene = {
  name: "Pendulum Array",
  init: nil,
  draw(dc) {
    const { buf, w, h, time, audio } = dc;
    const r = S(w, h) * 0.4;
    const count = 15;
    const baseFreq = 0.8;
    const maxAmp = r * 0.35 * (0.7 + audio.bass * 0.5);
    const damping = 1 - audio.energy * 0.15;
    const hue = (time * 10) % 360;
    for (let i = 0; i < count; i++) {
      const freq = baseFreq + i * 0.06;
      const angle = maxAmp * sin(freq * time * TAU * 0.15) * damping;
      const xBase = ((i - (count - 1) / 2) / count) * r * 1.8;
      const length = r * (0.4 + i * 0.025);
      const bobX = xBase + sin(angle / r) * length;
      const bobY = cos(angle / r) * length - r * 0.2;
      const z = i * 20;
      const [cr, cg, cb] = hsl((hue + i * 22) % 360, 85, 48);
      const alpha = clamp(0.5, 0.3, 0.65);
      // draw string
      buf.lineStart();
      buf.lineTo(xBase, -r * 0.5, z, cr, cg, cb, alpha * 0.5);
      buf.lineTo(bobX, bobY - r * 0.3, z, cr, cg, cb, alpha * 0.5);
      // draw bob
      buf.point(bobX, bobY - r * 0.3, z, cr, cg, cb, alpha, 4 + audio.mid * 3);
    }
    // top bar
    const [br, bg, bb] = hsl((hue + 120) % 360, 70, 42);
    buf.lineStart();
    buf.lineTo(-r * 0.95, -r * 0.5, 0, br, bg, bb, 0.4);
    buf.lineTo(r * 0.95, -r * 0.5, 0, br, bg, bb, 0.4);
  },
};

// ── 10. Resonance Web ────────────────────────────────────────────────────────

type WebNode = { x: number; y: number; dy: number; vy: number };

const resonanceWeb: Scene = {
  name: "Resonance Web",
  init: () => {
    const nodes: WebNode[] = [];
    const cols = 9;
    const rows = 9;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offsetX = r % 2 ? 0.5 : 0;
        nodes.push({
          x: (c + offsetX - cols / 2) / cols,
          y: (r - rows / 2) / rows,
          dy: 0,
          vy: 0,
        });
      }
    }
    return { nodes, cols };
  },
  draw(dc, raw) {
    const { buf, w, h, time, audio } = dc;
    const s = raw as { nodes: WebNode[]; cols: number };
    const r = S(w, h) * 0.42;
    const cols = s.cols;
    const rows = s.nodes.length / cols;
    const stiffness = 0.15;
    const damp = 0.92;

    // bass disturbs center, mid disturbs edges
    for (const node of s.nodes) {
      const dist = sqrt(node.x * node.x + node.y * node.y);
      if (dist < 0.2) node.vy += audio.bass * 3 * sin(time * 4);
      if (dist > 0.4) node.vy += audio.mid * 2 * sin(time * 5.5 + dist * 8);
    }

    // spring propagation
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        const idx = ri * cols + ci;
        const node = s.nodes[idx];
        const neighbors: number[] = [];
        if (ci > 0) neighbors.push(idx - 1);
        if (ci < cols - 1) neighbors.push(idx + 1);
        if (ri > 0) neighbors.push(idx - cols);
        if (ri < rows - 1) neighbors.push(idx + cols);
        let force = 0;
        for (const ni of neighbors) {
          force += (s.nodes[ni].dy - node.dy) * stiffness;
        }
        node.vy = (node.vy + force) * damp;
      }
    }
    for (const node of s.nodes) node.dy += node.vy;

    const hue = (time * 12) % 360;
    // draw connections
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        const idx = ri * cols + ci;
        const n = s.nodes[idx];
        const px = n.x * r * 2;
        const py = n.y * r * 2 + n.dy * r * 0.3;
        const z = abs(n.dy) * 200;
        // connect to right and below
        if (ci < cols - 1) {
          const nb = s.nodes[idx + 1];
          const nx = nb.x * r * 2;
          const ny = nb.y * r * 2 + nb.dy * r * 0.3;
          const nz = abs(nb.dy) * 200;
          const [cr, cg, cb] = hsl((hue + ri * 20) % 360, 80, 46);
          const alpha = clamp(0.4 + abs(n.dy) * 0.3, 0.25, 0.6);
          buf.lineStart();
          buf.lineTo(px, py, z, cr, cg, cb, alpha);
          buf.lineTo(nx, ny, nz, cr, cg, cb, alpha);
        }
        if (ri < rows - 1) {
          const nb = s.nodes[idx + cols];
          const nx = nb.x * r * 2;
          const ny = nb.y * r * 2 + nb.dy * r * 0.3;
          const nz = abs(nb.dy) * 200;
          const [cr, cg, cb] = hsl((hue + ci * 20 + 90) % 360, 80, 46);
          const alpha = clamp(0.4 + abs(n.dy) * 0.3, 0.25, 0.6);
          buf.lineStart();
          buf.lineTo(px, py, z, cr, cg, cb, alpha);
          buf.lineTo(nx, ny, nz, cr, cg, cb, alpha);
        }
      }
    }
    // draw nodes
    for (const node of s.nodes) {
      const px = node.x * r * 2;
      const py = node.y * r * 2 + node.dy * r * 0.3;
      const z = abs(node.dy) * 200;
      const brightness = clamp(abs(node.dy) * 2, 0, 1);
      const [cr, cg, cb] = hsl((hue + brightness * 60) % 360, 85, 45);
      const alpha = clamp(0.45 + brightness * 0.2, 0.3, 0.65);
      buf.point(px, py, z, cr, cg, cb, alpha, 2.5 + brightness * 3);
    }
  },
};

export const waveScenes: Scene[] = [
  standingWave,
  chladniPattern,
  cymatics,
  rippleTank,
  stringHarmonics,
  dopplerRings,
  solitonCollision,
  doubleSlit,
  pendulumWave,
  resonanceWeb,
];
