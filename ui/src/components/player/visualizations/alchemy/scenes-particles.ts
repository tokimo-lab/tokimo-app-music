import type { Scene } from "./types";
import { clamp } from "./utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  hue: number;
};
const TAU = Math.PI * 2;
const sin = Math.sin;
const cos = Math.cos;

function glow(
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

function sc(w: number, h: number) {
  return Math.min(w, h);
}

function mkP(
  x: number,
  y: number,
  vx: number,
  vy: number,
  hue: number,
  life = 1,
  size = 3,
): P {
  return { x, y, vx, vy, life, age: 0, size, hue };
}

// ── 1: Fireworks ─────────────────────────────────────────────────────────────

interface Burst {
  cx: number;
  cy: number;
  hue: number;
  particles: P[];
  t: number;
}
interface FireworkState {
  bursts: Burst[];
  timer: number;
}

function spawnBurst(w: number, h: number): Burst {
  const cx = 0.2 * w + Math.random() * 0.6 * w;
  const cy = 0.15 * h + Math.random() * 0.5 * h;
  const hue = Math.random() * 360;
  const ps: P[] = [];
  for (let i = 0; i < 60; i++) {
    const a = TAU * Math.random(),
      spd = 1 + Math.random() * 3;
    ps.push(
      mkP(
        cx,
        cy,
        cos(a) * spd,
        sin(a) * spd - 1,
        hue,
        1,
        2 + Math.random() * 2,
      ),
    );
  }
  return { cx, cy, hue, particles: ps, t: 0 };
}

const fireworks: Scene = {
  name: "Fireworks",
  init: (): FireworkState => ({ bursts: [], timer: 0 }),
  draw(dc, _s) {
    const s = _s as FireworkState;
    const { ctx, w, h, audio } = dc;
    s.timer++;
    const interval = Math.max(20, 60 - audio.bass * 40);
    if (s.timer >= interval) {
      s.bursts.push(spawnBurst(w, h));
      s.timer = 0;
    }
    if (s.bursts.length > 6) s.bursts.shift();
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const b of s.bursts) {
      b.t++;
      const fade = clamp(1 - b.t / 90, 0, 1);
      ctx.globalAlpha = fade * 0.7;
      glow(ctx, b.hue);
      for (const p of b.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.04;
        p.vx *= 0.98;
        p.vy *= 0.98;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * fade, 0, TAU);
        ctx.fill();
      }
    }
    s.bursts = s.bursts.filter((b) => b.t < 90);
    ctx.restore();
  },
};

// ── 2: Fireflies ─────────────────────────────────────────────────────────────

const fireflies: Scene = {
  name: "Fireflies",
  init: () => {
    const ps: (P & { ox: number; oy: number; freq: number })[] = [];
    for (let i = 0; i < 150; i++) {
      const p = mkP(
        Math.random(),
        Math.random(),
        0,
        0,
        50 + Math.random() * 80,
        1,
        2 + Math.random() * 3,
      );
      (p as P & { ox: number; oy: number; freq: number }).ox = p.x;
      (p as P & { ox: number; oy: number; freq: number }).oy = p.y;
      (p as P & { ox: number; oy: number; freq: number }).freq =
        0.5 + Math.random() * 2;
      ps.push(p as P & { ox: number; oy: number; freq: number });
    }
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as (P & { ox: number; oy: number; freq: number })[];
    const { ctx, w, h, time, audio } = dc;
    const s = sc(w, h);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of ps) {
      const t = time * 0.001 * p.freq;
      p.x = (p.ox + sin(t + p.hue) * 0.05) * w;
      p.y = (p.oy + cos(t * 0.7 + p.hue * 2) * 0.05) * h;
      const flicker = 0.3 + 0.5 * (0.5 + 0.5 * sin(t * 5 + p.hue));
      ctx.globalAlpha = clamp(flicker + audio.energy * 0.3, 0.3, 0.8);
      glow(ctx, p.hue, 80, 50, s * 0.02);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (s / 500), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 3: Galaxy ────────────────────────────────────────────────────────────────

const galaxy: Scene = {
  name: "Galaxy",
  init: () => {
    const ps: (P & { arm: number; r: number; ang: number })[] = [];
    for (let i = 0; i < 250; i++) {
      const arm = i % 3,
        r = 0.05 + Math.random() * 0.45;
      const ang = (arm / 3) * TAU + r * 3 + (Math.random() - 0.5) * 0.4;
      ps.push({
        ...mkP(0, 0, 0, 0, 220 + arm * 40, 1, 1.5 + Math.random() * 2),
        arm,
        r,
        ang,
      });
    }
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as (P & { arm: number; r: number; ang: number })[];
    const { ctx, w, h, time, audio } = dc;
    const s = sc(w, h) * 0.45;
    const rot = time * 0.0002;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6 + audio.bass * 0.2;
    for (const p of ps) {
      const spread = 1 + audio.bass * 0.5;
      const a = p.ang + rot / (0.5 + p.r);
      const px = w / 2 + cos(a) * p.r * s * spread;
      const py = h / 2 + sin(a) * p.r * s * spread * 0.6;
      glow(ctx, p.hue, 80, 45, 8);
      ctx.beginPath();
      ctx.arc(px, py, p.size * (s / 300), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 4: Constellation ─────────────────────────────────────────────────────────

const constellation: Scene = {
  name: "Constellation",
  init: () => {
    const ps: P[] = [];
    for (let i = 0; i < 120; i++)
      ps.push(
        mkP(
          Math.random(),
          Math.random(),
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
    const ps = _s as P[];
    const { ctx, w, h, time, audio } = dc;
    const s = sc(w, h);
    const linkDist = s * (0.1 + audio.mid * 0.08);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.5;
    glow(ctx, 220, 70, 50, 6);
    ctx.lineWidth = 0.5;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const dx = ps[i].x * w - ps[j].x * w,
          dy = ps[i].y * h - ps[j].y * h;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < linkDist) {
          ctx.globalAlpha = (1 - d / linkDist) * 0.4;
          ctx.beginPath();
          ctx.moveTo(ps[i].x * w, ps[i].y * h);
          ctx.lineTo(ps[j].x * w, ps[j].y * h);
          ctx.stroke();
        }
      }
    }
    for (const p of ps) {
      const twinkle = 0.4 + 0.4 * sin(time * 0.003 * ((p.hue % 5) + 1) + p.hue);
      ctx.globalAlpha = clamp(twinkle, 0.3, 0.8);
      glow(ctx, p.hue, 80, 50, 10);
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size * (s / 500), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  },
};

// ── 5: Meteor Shower ─────────────────────────────────────────────────────────

function resetMeteor(p: P, w: number, h: number) {
  p.x = Math.random() * w * 1.5;
  p.y = -10 - Math.random() * h * 0.3;
  const spd = 3 + Math.random() * 5;
  p.vx = -spd * 0.7;
  p.vy = spd;
  p.size = 1 + Math.random() * 2;
  p.hue = 20 + Math.random() * 40;
}

const meteorShower: Scene = {
  name: "Meteor Shower",
  init: () => {
    const ps: P[] = [];
    for (let i = 0; i < 100; i++) ps.push(mkP(0, 0, 0, 0, 30, 1, 2));
    return { ps, inited: false };
  },
  draw(dc, _s) {
    const st = _s as { ps: P[]; inited: boolean };
    const { ctx, w, h, audio } = dc;
    if (!st.inited) {
      for (const p of st.ps) {
        resetMeteor(p, w, h);
        p.y = Math.random() * h;
      }
      st.inited = true;
    }
    const boost = 1 + audio.energy * 2;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6;
    for (const p of st.ps) {
      p.x += p.vx * boost;
      p.y += p.vy * boost;
      if (p.y > h + 20 || p.x < -50) resetMeteor(p, w, h);
      const len = Math.sqrt(p.vx * p.vx + p.vy * p.vy) * 4 * boost;
      glow(ctx, p.hue, 90, 50, 8);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(
        p.x - (p.vx / Math.abs(p.vx || 1)) * len * 0.7,
        p.y - (p.vy / Math.abs(p.vy || 1)) * len,
      );
      ctx.lineWidth = p.size;
      ctx.stroke();
    }
    ctx.restore();
  },
};

// ── 6: Rising Bubbles ────────────────────────────────────────────────────────

function resetBubble(p: P, w: number, h: number) {
  p.x = Math.random() * w;
  p.y = h + 10 + Math.random() * 50;
  p.vy = -(0.5 + Math.random() * 1.5);
  p.vx = 0;
  p.size = 4 + Math.random() * 12;
  p.hue = 170 + Math.random() * 60;
}

const risingBubbles: Scene = {
  name: "Rising Bubbles",
  init: () => {
    const ps: P[] = [];
    for (let i = 0; i < 120; i++) ps.push(mkP(0, 0, 0, 0, 180, 1, 5));
    return { ps, inited: false };
  },
  draw(dc, _s) {
    const st = _s as { ps: P[]; inited: boolean };
    const { ctx, w, h, time, audio } = dc;
    const s = sc(w, h);
    if (!st.inited) {
      for (const p of st.ps) {
        resetBubble(p, w, h);
        p.y = Math.random() * h;
      }
      st.inited = true;
    }
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (const p of st.ps) {
      p.y += p.vy * (1 + audio.bass);
      p.x += sin(time * 0.002 + p.hue + p.size) * 0.5;
      if (p.y < -p.size * 2) resetBubble(p, w, h);
      ctx.globalAlpha = clamp(0.3 + (p.y / h) * 0.4, 0.3, 0.7);
      glow(ctx, p.hue, 75, 45, p.size * 0.6);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (s / 700), 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1.5;
    }
    ctx.restore();
  },
};

// ── 7: Swarm ─────────────────────────────────────────────────────────────────

const swarm: Scene = {
  name: "Swarm",
  init: () => {
    const ps: P[] = [];
    for (let i = 0; i < 200; i++)
      ps.push(
        mkP(
          Math.random(),
          Math.random(),
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          280 + Math.random() * 60,
          1,
          2 + Math.random() * 2,
        ),
      );
    return ps;
  },
  draw(dc, _s) {
    const ps = _s as P[];
    const { ctx, w, h, time, audio } = dc;
    const s = sc(w, h);
    const cx = w / 2 + sin(time * 0.001) * w * 0.2;
    const cy = h / 2 + cos(time * 0.0013) * h * 0.15;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.55;
    for (const p of ps) {
      const dx = cx - p.x * w,
        dy = cy - p.y * h;
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
      glow(ctx, p.hue, 85, 42, 10);
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size * (s / 600), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
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
