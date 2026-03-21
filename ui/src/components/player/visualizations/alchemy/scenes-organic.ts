import { S, snoise, TAU } from "./helpers";
import { hsl } from "./scene-buffer";
import type { Scene } from "./types";
import { clamp, hash } from "./utils";

// ── Neural Network ───────────────────────────────────────────────────────────

interface NeuralNode {
  x: number;
  y: number;
  layer: number;
  idx: number;
  fire: number;
}

interface NeuralState {
  nodes: NeuralNode[];
  connections: [number, number, number][];
  wave: number;
}

function initNeural(): NeuralState {
  const layers = [6, 10, 10, 6];
  const nodes: NeuralNode[] = [];
  let idx = 0;
  for (let l = 0; l < layers.length; l++) {
    const count = layers[l];
    for (let n = 0; n < count; n++) {
      const lx = (l / (layers.length - 1)) * 2 - 1;
      const ly = (n / (count - 1)) * 2 - 1;
      nodes.push({ x: lx, y: ly, layer: l, idx: idx++, fire: 0 });
    }
  }
  const connections: [number, number, number][] = [];
  for (const a of nodes) {
    for (const b of nodes) {
      if (b.layer === a.layer + 1 && hash(a.idx * 97 + b.idx) > 0.35) {
        connections.push([a.idx, b.idx, hash(a.idx * 31 + b.idx * 13)]);
      }
    }
  }
  return { nodes, connections, wave: 0 };
}

function drawNeural(dc: Parameters<Scene["draw"]>[0], state: NeuralState) {
  const { buf, w, h, time, audio } = dc;
  const scale = S(w, h) * 0.38;
  state.wave += 0.02 + audio.bass * 0.08;
  for (const node of state.nodes) {
    const wavePos = (node.layer / 3) * TAU;
    const pulse = Math.sin(state.wave - wavePos);
    node.fire = clamp(pulse > 0.3 ? pulse : node.fire * 0.92, 0, 1);
  }
  for (const [ai, bi, seed] of state.connections) {
    const a = state.nodes[ai];
    const b = state.nodes[bi];
    const strength = (a.fire + b.fire) * 0.5;
    const hue = (200 + seed * 60 + time * 10) % 360;
    const alpha = 0.15 + strength * 0.5;
    const [cr, cg, cb] = hsl(hue, 80, 45 + strength * 15);
    const z = 100 + seed * 200;
    buf.lineStart();
    buf.lineTo(a.x * scale, a.y * scale * 0.8, z, cr, cg, cb, alpha);
    buf.lineTo(b.x * scale, b.y * scale * 0.8, z, cr, cg, cb, alpha);
  }
  for (const node of state.nodes) {
    const hue = (180 + node.layer * 40 + time * 15) % 360;
    const [cr, cg, cb] = hsl(hue, 85, 50 + node.fire * 15);
    const sz = 3 + node.fire * 6 + audio.energy * 3;
    buf.point(node.x * scale, node.y * scale * 0.8, 50, cr, cg, cb, 0.7, sz);
  }
}

// ── DNA Helix ────────────────────────────────────────────────────────────────

function drawDnaHelix(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, time, audio } = dc;
  const radius = S(w, h) * 0.15;
  const height = S(w, h) * 0.42;
  const steps = 80;
  const twist = 1.5 + audio.mid * 0.5;
  const scroll = time * 0.8 + audio.bass * 0.5;

  for (let strand = 0; strand < 2; strand++) {
    const offset = strand * Math.PI;
    const hue = strand === 0 ? 190 + time * 8 : 320 + time * 8;
    const [cr, cg, cb] = hsl(hue % 360, 82, 48 + audio.energy * 10);
    buf.lineStart();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = (t - 0.5) * height * 2;
      const angle = t * TAU * twist + scroll + offset;
      const x = Math.cos(angle) * radius;
      const z = 100 + Math.sin(angle) * 150;
      buf.lineTo(x, y, z, cr, cg, cb, 0.6);
    }
  }
  const rungInterval = 4;
  for (let i = 0; i <= steps; i += rungInterval) {
    const t = i / steps;
    const y = (t - 0.5) * height * 2;
    const angle = t * TAU * twist + scroll;
    const x1 = Math.cos(angle) * radius;
    const z1 = 100 + Math.sin(angle) * 150;
    const x2 = Math.cos(angle + Math.PI) * radius;
    const z2 = 100 + Math.sin(angle + Math.PI) * 150;
    const hue = (60 + t * 120 + time * 20) % 360;
    const [cr, cg, cb] = hsl(hue, 75, 50);
    const alpha = 0.4 + audio.high * 0.2;
    buf.lineStart();
    buf.lineTo(x1, y, z1, cr, cg, cb, alpha);
    buf.lineTo(x2, y, z2, cr, cg, cb, alpha);
  }
}

// ── Coral Growth ─────────────────────────────────────────────────────────────

interface CoralBranch {
  x: number;
  y: number;
  angle: number;
  len: number;
  depth: number;
  hue: number;
  parent: number;
}

interface CoralState {
  branches: CoralBranch[];
  maxBranches: number;
  growTimer: number;
}

function initCoral(): CoralState {
  const trunk: CoralBranch = {
    x: 0,
    y: S(600, 600) * 0.35,
    angle: -Math.PI / 2,
    len: 40,
    depth: 0,
    hue: 0,
    parent: -1,
  };
  return { branches: [trunk], maxBranches: 120, growTimer: 0 };
}

function drawCoral(dc: Parameters<Scene["draw"]>[0], state: CoralState) {
  const { buf, w, h, time, audio } = dc;
  const scale = S(w, h) / 600;
  state.growTimer += 1 + audio.bass * 3;
  if (state.growTimer > 8 && state.branches.length < state.maxBranches) {
    state.growTimer = 0;
    const parentIdx = Math.floor(
      hash(state.branches.length * 7 + time * 3) * state.branches.length,
    );
    const parent = state.branches[parentIdx];
    const forkAngle = (hash(state.branches.length * 13) - 0.5) * 1.2;
    const newLen = parent.len * (0.7 + hash(state.branches.length * 17) * 0.3);
    const tipX = parent.x + Math.cos(parent.angle) * parent.len;
    const tipY = parent.y + Math.sin(parent.angle) * parent.len;
    state.branches.push({
      x: tipX,
      y: tipY,
      angle: parent.angle + forkAngle,
      len: newLen * (0.8 + audio.energy * 0.3),
      depth: parent.depth + 1,
      hue: (parent.hue + 25 + hash(state.branches.length) * 20) % 360,
      parent: parentIdx,
    });
  }
  for (const br of state.branches) {
    const tipX = br.x + Math.cos(br.angle) * br.len;
    const tipY = br.y + Math.sin(br.angle) * br.len;
    const hue = (br.hue + 340 + time * 5) % 360;
    const alpha = 0.5 + audio.energy * 0.2;
    const z = 50 + br.depth * 30;
    const [cr, cg, cb] = hsl(hue, 78, 45 + audio.mid * 10);
    buf.lineStart();
    buf.lineTo(br.x * scale, br.y * scale, z, cr, cg, cb, alpha);
    buf.lineTo(tipX * scale, tipY * scale, z, cr, cg, cb, alpha);
    const [pr, pg, pb] = hsl((hue + 30) % 360, 85, 55);
    buf.point(
      tipX * scale,
      tipY * scale,
      z,
      pr,
      pg,
      pb,
      0.5,
      2 + audio.high * 2,
    );
  }
}

// ── Mycelium Network ─────────────────────────────────────────────────────────

interface MyceliumNode {
  x: number;
  y: number;
  connections: number[];
  age: number;
}

interface MyceliumState {
  nodes: MyceliumNode[];
  maxNodes: number;
  spawnTimer: number;
}

function initMycelium(): MyceliumState {
  const nodes: MyceliumNode[] = [{ x: 0, y: 0, connections: [], age: 0 }];
  return { nodes, maxNodes: 80, spawnTimer: 0 };
}

function drawMycelium(dc: Parameters<Scene["draw"]>[0], state: MyceliumState) {
  const { buf, w, h, time, audio } = dc;
  const scale = S(w, h) * 0.4;
  for (const n of state.nodes) n.age += 0.01;
  state.spawnTimer += audio.bass * 2 + 0.5;
  if (state.spawnTimer > 5 && state.nodes.length < state.maxNodes) {
    state.spawnTimer = 0;
    const parentIdx = Math.floor(
      hash(state.nodes.length * 11 + time) * state.nodes.length,
    );
    const parent = state.nodes[parentIdx];
    const angle = hash(state.nodes.length * 23 + time * 7) * TAU;
    const dist = 0.1 + hash(state.nodes.length * 37) * 0.2;
    const nx = clamp(parent.x + Math.cos(angle) * dist, -0.9, 0.9);
    const ny = clamp(parent.y + Math.sin(angle) * dist, -0.9, 0.9);
    const newIdx = state.nodes.length;
    state.nodes.push({ x: nx, y: ny, connections: [], age: 0 });
    parent.connections.push(newIdx);
    // connect to nearest existing neighbor
    let bestDist = 999;
    let bestIdx = -1;
    for (let i = 0; i < state.nodes.length - 1; i++) {
      if (i === parentIdx) continue;
      const dx = state.nodes[i].x - nx;
      const dy = state.nodes[i].y - ny;
      const d = dx * dx + dy * dy;
      if (d < bestDist && d < 0.06) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) state.nodes[newIdx].connections.push(bestIdx);
  }
  for (let i = 0; i < state.nodes.length; i++) {
    const node = state.nodes[i];
    for (const ci of node.connections) {
      const other = state.nodes[ci];
      const midX = (node.x + other.x) / 2 + snoise(node.x * 5, time) * 0.04;
      const midY = (node.y + other.y) / 2 + snoise(node.y * 5, time) * 0.04;
      const hue = (60 + i * 3 + time * 8) % 360;
      const [cr, cg, cb] = hsl(hue, 75, 42 + audio.energy * 12);
      const z = 80 + snoise(node.x * 3, node.y * 3) * 120;
      const alpha = 0.4 + audio.mid * 0.2;
      buf.lineStart();
      buf.lineTo(node.x * scale, node.y * scale, z, cr, cg, cb, alpha);
      buf.lineTo(midX * scale, midY * scale, z + 20, cr, cg, cb, alpha * 0.8);
      buf.lineTo(other.x * scale, other.y * scale, z, cr, cg, cb, alpha);
    }
    const [pr, pg, pb] = hsl((90 + time * 12) % 360, 90, 55);
    const glow = 2 + Math.sin(time * 3 + i) * 1 + audio.high * 3;
    buf.point(node.x * scale, node.y * scale, 60, pr, pg, pb, 0.65, glow);
  }
}

// ── Jellyfish ────────────────────────────────────────────────────────────────

interface JellyEntity {
  cx: number;
  cy: number;
  baseZ: number;
  size: number;
  hue: number;
  phase: number;
  tentacles: number;
}

function initJellyfish(): JellyEntity[] {
  return Array.from({ length: 4 }, (_, i) => ({
    cx: (hash(i * 41) - 0.5) * 1.2,
    cy: (hash(i * 67) - 0.5) * 0.8,
    baseZ: 50 + i * 100,
    size: 0.12 + hash(i * 89) * 0.08,
    hue: i * 70 + 200,
    phase: hash(i * 113) * TAU,
    tentacles: 5 + Math.floor(hash(i * 53) * 4),
  }));
}

function drawJellyfish(
  dc: Parameters<Scene["draw"]>[0],
  jellies: JellyEntity[],
) {
  const { buf, w, h, time, audio } = dc;
  const scale = S(w, h);
  for (const jf of jellies) {
    const pulse =
      0.8 + Math.sin(time * 2.5 + jf.phase) * 0.2 + audio.bass * 0.15;
    const bellR = jf.size * scale * pulse;
    const cx = jf.cx * scale * 0.4;
    const cy = jf.cy * scale * 0.4;
    const hue = (jf.hue + time * 12) % 360;
    const [cr, cg, cb] = hsl(hue, 80, 48 + audio.energy * 10);
    const alpha = 0.55 + audio.mid * 0.15;
    // bell (top arc)
    buf.arc(cx, cy, jf.baseZ, bellR, Math.PI, TAU, cr, cg, cb, alpha, 24);
    // rim line
    buf.lineStart();
    const rimSteps = 20;
    for (let i = 0; i <= rimSteps; i++) {
      const t = i / rimSteps;
      const angle = Math.PI + t * Math.PI;
      const rx =
        cx + Math.cos(angle) * bellR * (1 + Math.sin(t * Math.PI * 4) * 0.06);
      const ry = cy + Math.sin(angle) * bellR * 0.3;
      buf.lineTo(rx, ry, jf.baseZ + 10, cr, cg, cb, alpha * 0.8);
    }
    // tentacles
    const tentLen = bellR * 2.5;
    for (let t = 0; t < jf.tentacles; t++) {
      const tx = cx + (t / (jf.tentacles - 1) - 0.5) * bellR * 1.6;
      const thue = (hue + t * 20) % 360;
      const [tr, tg, tb] = hsl(thue, 75, 52);
      buf.lineStart();
      const segs = 12;
      for (let s = 0; s <= segs; s++) {
        const st = s / segs;
        const sx =
          tx + Math.sin(time * 3 + st * 5 + t + jf.phase) * bellR * 0.3 * st;
        const sy = cy + st * tentLen;
        const sz = jf.baseZ + 20 + st * 40;
        const ta = (0.5 - st * 0.3) * alpha;
        buf.lineTo(sx, sy, sz, tr, tg, tb, ta);
      }
    }
  }
}

// ── Seashell Spiral ──────────────────────────────────────────────────────────

function drawSeashell(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, time, audio } = dc;
  const scale = S(w, h) * 0.08;
  const a = 0.15;
  const b = 0.18 + audio.mid * 0.04;
  const maxTheta = 6 * Math.PI;
  const steps = 200;
  const rotation = time * 0.3;

  // main spiral
  const hueBase = (30 + time * 10) % 360;
  const [cr, cg, cb] = hsl(hueBase, 78, 48 + audio.energy * 8);
  buf.lineStart();
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * maxTheta;
    const r = a * Math.exp(b * theta) * scale;
    const x = r * Math.cos(theta + rotation);
    const y = r * Math.sin(theta + rotation);
    const z = 100 + (i / steps) * 250;
    const alpha = 0.3 + (i / steps) * 0.4;
    buf.lineTo(x, y, z, cr, cg, cb, alpha);
  }
  // radial ribs
  const ribCount = 24;
  for (let ri = 0; ri < ribCount; ri++) {
    const theta = (ri / ribCount) * maxTheta;
    const r = a * Math.exp(b * theta) * scale;
    const rInner = r * (0.3 + audio.bass * 0.2);
    const x1 = rInner * Math.cos(theta + rotation);
    const y1 = rInner * Math.sin(theta + rotation);
    const x2 = r * Math.cos(theta + rotation);
    const y2 = r * Math.sin(theta + rotation);
    const z = 100 + (theta / maxTheta) * 250;
    const ribHue = (hueBase + ri * 8) % 360;
    const [rr, rg, rb] = hsl(ribHue, 72, 44 + audio.high * 10);
    const alpha = 0.35 + audio.energy * 0.2;
    buf.lineStart();
    buf.lineTo(x1, y1, z, rr, rg, rb, alpha);
    buf.lineTo(x2, y2, z, rr, rg, rb, alpha);
  }
}

// ── Fern Fractal ─────────────────────────────────────────────────────────────

function drawFern(dc: Parameters<Scene["draw"]>[0]) {
  const { buf, w, h, time, audio } = dc;
  const scale = S(w, h) * 0.04;
  const iterations = 2500;
  let x = 0;
  let y = 0;
  const drift = audio.bass * 0.02;

  for (let i = 0; i < iterations; i++) {
    const r = hash(i * 7 + Math.floor(time * 2));
    let nx: number;
    let ny: number;
    let branch: number;
    if (r < 0.01) {
      nx = 0;
      ny = 0.16 * y;
      branch = 0;
    } else if (r < 0.86) {
      nx = 0.85 * x + (0.04 + drift) * y;
      ny = -0.04 * x + 0.85 * y + 1.6;
      branch = 1;
    } else if (r < 0.93) {
      nx = 0.2 * x - 0.26 * y;
      ny = 0.23 * x + 0.22 * y + 1.6;
      branch = 2;
    } else {
      nx = -0.15 * x + 0.28 * y;
      ny = 0.26 * x + 0.24 * y + 0.44;
      branch = 3;
    }
    x = nx;
    y = ny;
    if (i < 20) continue;
    const px = x * scale;
    const py = (y - 5) * scale * -1;
    const hues = [120, 140, 80, 160];
    const hue = (hues[branch] + time * 6) % 360;
    const [cr, cg, cb] = hsl(hue, 82, 40 + audio.energy * 15);
    const z = 80 + branch * 60 + snoise(x, y) * 40;
    const sz = 1.5 + audio.mid * 1.5;
    buf.point(px, py, z, cr, cg, cb, 0.55, sz);
  }
}

// ── Branching Tree ───────────────────────────────────────────────────────────

interface TreeState {
  windPhase: number;
}

function drawTree(dc: Parameters<Scene["draw"]>[0], state: TreeState) {
  const { buf, w, h, time, audio } = dc;
  const scale = S(w, h);
  state.windPhase += 0.02 + audio.bass * 0.06;
  const windStrength = 0.08 + audio.energy * 0.12;

  function branch(
    x1: number,
    y1: number,
    angle: number,
    length: number,
    depth: number,
    maxDepth: number,
  ) {
    if (depth > maxDepth || length < 2) return;
    const windOffset =
      Math.sin(state.windPhase + y1 * 0.005 + depth * 0.5) *
      windStrength *
      depth;
    const a = angle + windOffset;
    const x2 = x1 + Math.cos(a) * length;
    const y2 = y1 + Math.sin(a) * length;
    const t = depth / maxDepth;
    const hue = (100 + t * 60 + time * 8) % 360;
    const lit = 35 + t * 15 + audio.high * 8;
    const [cr, cg, cb] = hsl(hue, 72 + audio.mid * 15, lit);
    const z = 50 + depth * 40;
    const alpha = 0.55 + (1 - t) * 0.2;
    buf.lineStart();
    buf.lineTo(x1, y1, z, cr, cg, cb, alpha);
    buf.lineTo(x2, y2, z, cr, cg, cb, alpha);
    const nextLen = length * (0.65 + hash(depth * 31 + Math.floor(x1)) * 0.1);
    const spread = 0.4 + audio.mid * 0.15;
    branch(x2, y2, a - spread, nextLen, depth + 1, maxDepth);
    branch(x2, y2, a + spread, nextLen, depth + 1, maxDepth);
    if (depth > 2 && hash(depth * 17 + Math.floor(y1)) > 0.6) {
      branch(x2, y2, a, nextLen * 0.8, depth + 1, maxDepth);
    }
  }

  const trunkLen = scale * 0.14;
  const startY = scale * 0.38;
  branch(0, startY, -Math.PI / 2, trunkLen, 0, 7);
}

// ── Heartbeat Pulse ──────────────────────────────────────────────────────────

interface HeartState {
  phase: number;
  pulses: { x: number; y: number; r: number; alpha: number }[];
}

function initHeart(): HeartState {
  return { phase: 0, pulses: [] };
}

function drawHeartbeat(dc: Parameters<Scene["draw"]>[0], state: HeartState) {
  const { buf, w, h, audio } = dc;
  const waveW = S(w, h) * 0.85;
  const leads = 3;
  const bpm = 60 + audio.bass * 80;
  state.phase += (bpm / 60) * 0.016;

  // spawn pulse ring on bass
  if (
    audio.bass > 0.5 &&
    (state.pulses.length === 0 || state.pulses[state.pulses.length - 1].r > 20)
  ) {
    state.pulses.push({ x: 0, y: 0, r: 5, alpha: 0.7 });
  }
  // update and draw pulse rings
  for (let i = state.pulses.length - 1; i >= 0; i--) {
    const p = state.pulses[i];
    p.r += 3 + audio.energy * 2;
    p.alpha *= 0.96;
    if (p.alpha < 0.02) {
      state.pulses.splice(i, 1);
      continue;
    }
    const [cr, cg, cb] = hsl(0, 80, 50);
    buf.circle(p.x, p.y, 200, p.r, cr, cg, cb, p.alpha, 32);
  }

  for (let lead = 0; lead < leads; lead++) {
    const yOff = (lead - 1) * S(w, h) * 0.18;
    const z = 50 + lead * 120;
    const hue = (lead * 40 + 350) % 360;
    const [cr, cg, cb] = hsl(hue, 85, 45 + audio.energy * 10);
    const alpha = 0.55 + lead * 0.05;
    buf.lineStart();
    const steps = 200;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (t - 0.5) * waveW;
      const ecgT = (t + state.phase + lead * 0.1) % 1;
      let y = 0;
      // P wave
      if (ecgT > 0.05 && ecgT < 0.15) {
        y = Math.sin(((ecgT - 0.05) / 0.1) * Math.PI) * 15;
      }
      // QRS complex
      if (ecgT > 0.2 && ecgT < 0.22) y = -12;
      if (ecgT > 0.22 && ecgT < 0.28) y = 55 * (1 + audio.bass * 0.6);
      if (ecgT > 0.28 && ecgT < 0.3) y = -18;
      // T wave
      if (ecgT > 0.35 && ecgT < 0.48) {
        y = Math.sin(((ecgT - 0.35) / 0.13) * Math.PI) * 20;
      }
      const scale = S(w, h) * 0.003;
      buf.lineTo(x, yOff + y * scale, z, cr, cg, cb, alpha);
    }
  }
}

// ── Cell Division ────────────────────────────────────────────────────────────

interface CellState {
  divisionPhase: number;
  cycleTime: number;
}

function initCell(): CellState {
  return { divisionPhase: 0, cycleTime: 0 };
}

function drawCellDivision(dc: Parameters<Scene["draw"]>[0], state: CellState) {
  const { buf, w, h, time, audio } = dc;
  const scale = S(w, h);
  state.cycleTime += 0.003 + audio.bass * 0.008;
  state.divisionPhase = state.cycleTime % 1;
  const dp = state.divisionPhase;
  const cellR = scale * 0.18;
  const separation = dp * cellR * 1.4;

  // two cells separating
  for (let cell = 0; cell < 2; cell++) {
    const sign = cell === 0 ? -1 : 1;
    const cx = sign * separation * 0.5;
    const squeeze = dp < 0.5 ? 1 - dp * 0.3 : 0.85 + (dp - 0.5) * 0.3;
    const r = cellR * squeeze;
    const hue = (140 + cell * 30 + time * 6) % 360;
    const [cr, cg, cb] = hsl(hue, 78, 44 + audio.energy * 10);
    // cell membrane
    buf.circle(cx, 0, 100, r, cr, cg, cb, 0.55, 36);
    // nucleus
    const nucleusR = r * (0.25 + dp * 0.1);
    const nHue = (200 + time * 10) % 360;
    const [nr, ng, nb] = hsl(nHue, 85, 50);
    buf.circle(cx, 0, 80, nucleusR, nr, ng, nb, 0.5, 20);
    // cytoplasm lines radiating outward
    const rays = 8;
    for (let ri = 0; ri < rays; ri++) {
      const angle = (ri / rays) * TAU + time * 0.4 + cell * 0.3;
      const innerR = nucleusR * 1.2;
      const outerR = r * 0.85;
      const rx1 = cx + Math.cos(angle) * innerR;
      const ry1 = Math.sin(angle) * innerR;
      const rx2 = cx + Math.cos(angle) * outerR;
      const ry2 = Math.sin(angle) * outerR;
      const [lr, lg, lb] = hsl((hue + 60) % 360, 70, 50);
      buf.lineStart();
      buf.lineTo(rx1, ry1, 90, lr, lg, lb, 0.3);
      buf.lineTo(rx2, ry2, 90, lr, lg, lb, 0.3);
    }
  }

  // cleavage furrow
  if (dp > 0.15 && dp < 0.85) {
    const furrowLen = cellR * (1 - Math.abs(dp - 0.5) * 1.5) * 1.2;
    const [fr, fg, fb] = hsl(60, 80, 55);
    const alpha = 0.5 * (1 - Math.abs(dp - 0.5) * 2);
    buf.lineStart();
    buf.lineTo(0, -furrowLen, 110, fr, fg, fb, alpha);
    buf.lineTo(0, furrowLen, 110, fr, fg, fb, alpha);
  }

  // spindle fibers connecting nuclei during early division
  if (dp > 0.05 && dp < 0.6) {
    const fiberAlpha = dp < 0.3 ? (dp / 0.3) * 0.4 : ((0.6 - dp) / 0.3) * 0.4;
    const n1x = -separation * 0.5;
    const n2x = separation * 0.5;
    const [sr, sg, sb] = hsl(280, 75, 50);
    const fibers = 6;
    for (let fi = 0; fi < fibers; fi++) {
      const yOff = (fi / (fibers - 1) - 0.5) * cellR * 0.4;
      buf.lineStart();
      buf.lineTo(n1x, yOff, 70, sr, sg, sb, fiberAlpha);
      buf.lineTo(n2x, yOff, 70, sr, sg, sb, fiberAlpha);
    }
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

const nil = () => null;

export const organicScenes: Scene[] = [
  {
    name: "Neural Network",
    init: () => initNeural(),
    draw: (dc, state) => {
      drawNeural(dc, state as NeuralState);
    },
  },
  {
    name: "DNA Helix",
    init: nil,
    draw: (dc) => {
      drawDnaHelix(dc);
    },
  },
  {
    name: "Coral Growth",
    init: () => initCoral(),
    draw: (dc, state) => {
      drawCoral(dc, state as CoralState);
    },
  },
  {
    name: "Mycelium Network",
    init: () => initMycelium(),
    draw: (dc, state) => {
      drawMycelium(dc, state as MyceliumState);
    },
  },
  {
    name: "Jellyfish",
    init: () => initJellyfish(),
    draw: (dc, state) => {
      drawJellyfish(dc, state as JellyEntity[]);
    },
  },
  {
    name: "Seashell Spiral",
    init: nil,
    draw: (dc) => {
      drawSeashell(dc);
    },
  },
  {
    name: "Fern Fractal",
    init: nil,
    draw: (dc) => {
      drawFern(dc);
    },
  },
  {
    name: "Branching Tree",
    init: (): TreeState => ({ windPhase: 0 }),
    draw: (dc, state) => {
      drawTree(dc, state as TreeState);
    },
  },
  {
    name: "Heartbeat Pulse",
    init: () => initHeart(),
    draw: (dc, state) => {
      drawHeartbeat(dc, state as HeartState);
    },
  },
  {
    name: "Cell Division",
    init: () => initCell(),
    draw: (dc, state) => {
      drawCellDivision(dc, state as CellState);
    },
  },
];
