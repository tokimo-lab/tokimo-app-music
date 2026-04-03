import type { P3 } from "./helpers";
import { mkP3, S, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { clamp } from "./utils";

const sin = Math.sin;
const cos = Math.cos;

// ── 1: Fireworks ─────────────────────────────────────────────────────────────

interface Burst {
  cz: number;
  hue: number;
  particles: P3[];
  t: number;
}
interface FireworkState {
  bursts: Burst[];
  timer: number;
}

function spawnBurst(w: number, h: number): Burst {
  const cx = 0.2 * w + Math.random() * 0.6 * w;
  const cy = 0.15 * h + Math.random() * 0.5 * h;
  const cz = 100 + Math.random() * 400;
  const hue = Math.random() * 360;
  const ps: P3[] = [];
  for (let i = 0; i < 60; i++) {
    const a = TAU * Math.random();
    const spd = 1 + Math.random() * 3;
    ps.push(
      mkP3(
        cx,
        cy,
        cz,
        cos(a) * spd,
        sin(a) * spd - 1,
        (Math.random() - 0.5) * 2,
        hue,
        1,
        2 + Math.random() * 2,
      ),
    );
  }
  return { cz, hue, particles: ps, t: 0 };
}

const fireworks: Scene = {
  name: "Fireworks",
  init: (): FireworkState => ({ bursts: [], timer: 0 }),
  draw(dc, _s) {
    const st = _s as FireworkState;
    const { buf, w, h, audio } = dc;
    st.timer++;
    const interval = Math.max(20, 60 - audio.bass * 40);
    if (st.timer >= interval) {
      st.bursts.push(spawnBurst(w, h));
      st.timer = 0;
    }
    if (st.bursts.length > 6) st.bursts.shift();
    for (const b of st.bursts) {
      b.t++;
      const fade = clamp(1 - b.t / 90, 0, 1);
      const [r, g, bl] = hsl(b.hue, 85, 45);
      for (const p of b.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;
        p.vy += 0.04;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.vz *= 0.98;
        const alpha = Math.max(0, 1 - p.z / 1200) * fade * 0.7;
        buf.point(
          p.x - w / 2,
          p.y - h / 2,
          p.z,
          r,
          g,
          bl,
          alpha,
          p.size * fade,
        );
      }
    }
    st.bursts = st.bursts.filter((b) => b.t < 90);
  },
};

// ── 2: Fireflies ─────────────────────────────────────────────────────────────

type Firefly = P3 & { ox: number; oy: number; oz: number; freq: number };

const fireflies: Scene = {
  name: "Fireflies",
  init: () => {
    const ps: Firefly[] = [];
    for (let i = 0; i < 150; i++) {
      const z = Math.random() * 600;
      const p = mkP3(
        Math.random(),
        Math.random(),
        z,
        0,
        0,
        (Math.random() - 0.5) * 0.3,
        50 + Math.random() * 80,
        1,
        2 + Math.random() * 3,
      );
      ps.push({ ...p, ox: p.x, oy: p.y, oz: z, freq: 0.5 + Math.random() * 2 });
    }
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as Firefly[];
    const { buf, w, h, time, audio } = dc;
    const s = S(w, h);
    for (const p of ps) {
      const t = time * 0.001 * p.freq;
      const wx = (p.ox + sin(t + p.hue) * 0.05) * w;
      const wy = (p.oy + cos(t * 0.7 + p.hue * 2) * 0.05) * h;
      p.z = p.oz + sin(t * 0.5) * 50;
      const flicker = 0.3 + 0.5 * (0.5 + 0.5 * sin(t * 5 + p.hue));
      const drawSize = p.size * (s / 500);
      const drawAlpha =
        Math.max(0, 1 - p.z / 800) *
        clamp(flicker + audio.energy * 0.3, 0.3, 0.8);
      const [r, g, bl] = hsl(p.hue, 80, 50);
      buf.point(wx - w / 2, wy - h / 2, p.z, r, g, bl, drawAlpha, drawSize);
    }
  },
};

// ── 3: Galaxy ────────────────────────────────────────────────────────────────

type GalaxyStar = P3 & { arm: number; r: number; ang: number };

const galaxy: Scene = {
  name: "Galaxy",
  init: () => {
    const ps: GalaxyStar[] = [];
    for (let i = 0; i < 250; i++) {
      const arm = i % 3;
      const r = 0.05 + Math.random() * 0.45;
      const ang = (arm / 3) * TAU + r * 3 + (Math.random() - 0.5) * 0.4;
      const z = r * 400;
      ps.push({
        ...mkP3(0, 0, z, 0, 0, 0, 220 + arm * 40, 1, 1.5 + Math.random() * 2),
        arm,
        r,
        ang,
      });
    }
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as GalaxyStar[];
    const { buf, w, h, time, audio } = dc;
    const s = S(w, h) * 0.45;
    const rot = time * 0.0002;
    for (const p of ps) {
      const spread = 1 + audio.bass * 0.5;
      const a = p.ang + rot / (0.5 + p.r);
      const px = w / 2 + cos(a) * p.r * s * spread;
      const py = h / 2 + sin(a) * p.r * s * spread * 0.6;
      const drawSize = p.size * (s / 300);
      const alpha = Math.max(0, 1 - p.z / 600) * (0.6 + audio.bass * 0.2);
      const [r, g, bl] = hsl(p.hue, 80, 45);
      buf.point(px - w / 2, py - h / 2, p.z, r, g, bl, alpha, drawSize);
    }
  },
};

// ── 4: Constellation ─────────────────────────────────────────────────────────

const constellation: Scene = {
  name: "Constellation",
  init: () => {
    const ps: P3[] = [];
    for (let i = 0; i < 120; i++)
      ps.push(
        mkP3(
          Math.random(),
          Math.random(),
          Math.random() * 500,
          0,
          0,
          0,
          200 + Math.random() * 60,
          1,
          1.5 + Math.random() * 2,
        ),
      );
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as P3[];
    const { buf, w, h, time, audio } = dc;
    const s = S(w, h);
    const linkDist = s * (0.1 + audio.mid * 0.08);
    // Use scene-space coords for distance checks
    const coords = ps.map((p) => ({ sx: p.x * w, sy: p.y * h }));
    const [lr, lg, lb] = hsl(220, 70, 50);
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (Math.abs(ps[i].z - ps[j].z) > 200) continue;
        const dx = coords[i].sx - coords[j].sx;
        const dy = coords[i].sy - coords[j].sy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < linkDist) {
          const avgZ = (ps[i].z + ps[j].z) / 2;
          const alpha = (1 - d / linkDist) * 0.4 * Math.max(0, 1 - avgZ / 600);
          buf.lineStart();
          buf.lineTo(
            coords[i].sx - w / 2,
            coords[i].sy - h / 2,
            ps[i].z,
            lr,
            lg,
            lb,
            alpha,
          );
          buf.lineTo(
            coords[j].sx - w / 2,
            coords[j].sy - h / 2,
            ps[j].z,
            lr,
            lg,
            lb,
            alpha,
          );
        }
      }
    }
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const twinkle = 0.4 + 0.4 * sin(time * 0.003 * ((p.hue % 5) + 1) + p.hue);
      const alpha = clamp(twinkle, 0.3, 0.8) * Math.max(0, 1 - p.z / 600);
      const [r, g, bl] = hsl(p.hue, 80, 50);
      buf.point(
        coords[i].sx - w / 2,
        coords[i].sy - h / 2,
        p.z,
        r,
        g,
        bl,
        alpha,
        p.size * (s / 500),
      );
    }
  },
};

// ── 5: Meteor Shower ─────────────────────────────────────────────────────────

const METEOR_MAX_DEPTH = 1200;

function resetMeteor(p: P3, w: number, h: number) {
  p.x = Math.random() * w * 1.5;
  p.y = -10 - Math.random() * h * 0.3;
  p.z = Math.random() * 400;
  const spd = 3 + Math.random() * 5;
  const zFactor = 1 - (p.z / METEOR_MAX_DEPTH) * 0.5;
  p.vx = -spd * 0.7 * zFactor;
  p.vy = spd * zFactor;
  p.vz = 0;
  p.size = 1 + Math.random() * 2;
  p.hue = 20 + Math.random() * 40;
}

const meteorShower: Scene = {
  name: "Meteor Shower",
  init: () => {
    const ps: P3[] = [];
    for (let i = 0; i < 100; i++) ps.push(mkP3(0, 0, 0, 0, 0, 0, 30, 1, 2));
    return { ps, inited: false };
  },
  draw(dc, _s) {
    const st = _s as { ps: P3[]; inited: boolean };
    const { buf, w, h, audio } = dc;
    if (!st.inited) {
      for (const p of st.ps) {
        resetMeteor(p, w, h);
        p.y = Math.random() * h;
      }
      st.inited = true;
    }
    const boost = 1 + audio.energy * 2;
    for (const p of st.ps) {
      p.x += p.vx * boost;
      p.y += p.vy * boost;
      if (p.y > h + 20 || p.x < -50) resetMeteor(p, w, h);
      const len = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 4 * boost;
      const tailX = p.x - (p.vx / Math.abs(p.vx || 1)) * len * 0.7;
      const tailY = p.y - (p.vy / Math.abs(p.vy || 1)) * len;
      const alpha = Math.max(0, 1 - p.z / 600) * 0.6;
      const [r, g, bl] = hsl(p.hue, 90, 50);
      buf.lineStart();
      buf.lineTo(p.x - w / 2, p.y - h / 2, p.z, r, g, bl, alpha);
      buf.lineTo(tailX - w / 2, tailY - h / 2, p.z, r, g, bl, alpha);
    }
  },
};

// ── 6: Rising Bubbles ────────────────────────────────────────────────────────

function resetBubble(p: P3, w: number, h: number) {
  p.x = Math.random() * w;
  p.y = h + 10 + Math.random() * 50;
  p.z = Math.random() * 400;
  p.vy = -(0.5 + Math.random() * 1.5);
  p.vx = 0;
  p.vz = 0;
  p.size = 4 + Math.random() * 12;
  p.hue = 170 + Math.random() * 60;
}

const risingBubbles: Scene = {
  name: "Rising Bubbles",
  init: () => {
    const ps: P3[] = [];
    for (let i = 0; i < 120; i++) ps.push(mkP3(0, 0, 0, 0, 0, 0, 180, 1, 5));
    return { ps, inited: false };
  },
  draw(dc, _s) {
    const st = _s as { ps: P3[]; inited: boolean };
    const { buf, w, h, time, audio } = dc;
    const s = S(w, h);
    if (!st.inited) {
      for (const p of st.ps) {
        resetBubble(p, w, h);
        p.y = Math.random() * h;
      }
      st.inited = true;
    }
    for (const p of st.ps) {
      p.y += p.vy * (1 + audio.bass);
      p.x += sin(time * 0.002 + p.hue + p.size) * 0.5;
      if (p.y < -p.size * 2) resetBubble(p, w, h);
      const drawSize = p.size * (s / 700);
      const alpha =
        Math.max(0, 1 - p.z / 600) * clamp(0.3 + (p.y / h) * 0.4, 0.3, 0.7);
      const [r, g, bl] = hsl(p.hue, 75, 45);
      buf.circle(p.x - w / 2, p.y - h / 2, p.z, drawSize, r, g, bl, alpha);
    }
  },
};

// ── 7: Swarm ─────────────────────────────────────────────────────────────────

const swarm: Scene = {
  name: "Swarm",
  init: () => {
    const ps: P3[] = [];
    for (let i = 0; i < 200; i++)
      ps.push(
        mkP3(
          Math.random(),
          Math.random(),
          Math.random() * 500,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          0,
          280 + Math.random() * 60,
          1,
          2 + Math.random() * 2,
        ),
      );
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as P3[];
    const { buf, w, h, time, audio } = dc;
    const s = S(w, h);
    const cx = w / 2 + sin(time * 0.001) * w * 0.2;
    const cy = h / 2 + cos(time * 0.0013) * h * 0.15;
    for (const p of ps) {
      const dx = cx - p.x * w;
      const dy = cy - p.y * h;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const pull = ((0.3 + audio.energy * 0.5) / d) * 30;
      p.vx += dx * pull * 0.001;
      p.vy += dy * pull * 0.001;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.x += p.vx / w;
      p.y += p.vy / h;
      p.x = ((p.x % 1) + 1) % 1;
      p.y = ((p.y % 1) + 1) % 1;
      p.z += sin(time * 0.002 + p.hue * 0.1) * 0.5;
      p.z = clamp(p.z, 0, 500);
      const drawSize = p.size * (s / 600);
      const alpha = Math.max(0, 1 - p.z / 600) * 0.55;
      const [r, g, bl] = hsl(p.hue, 85, 42);
      buf.point(
        p.x * w - w / 2,
        p.y * h - h / 2,
        p.z,
        r,
        g,
        bl,
        alpha,
        drawSize,
      );
    }
  },
};

export const particleScenes: Scene[] = [
  fireworks,
  fireflies,
  galaxy,
  constellation,
  meteorShower,
  risingBubbles,
  swarm,
];
