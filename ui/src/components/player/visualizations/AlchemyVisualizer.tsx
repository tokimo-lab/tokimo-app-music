import { useEffect, useRef } from "react";

// ── Constants ────────────────────────────────────────────────────────────────

const SCENE_DURATION = 900; // frames (~15s at 60fps)
const CROSSFADE_FRAMES = 120; // ~2s transition
const TRAIL_ALPHA = 0.06;
const POINTS = 200;
const SPIRO_POINTS = 300;
const SPIRO_LAYERS = 2;

// ── Audio helpers ────────────────────────────────────────────────────────────

interface AudioBands {
  bass: number;
  mid: number;
  high: number;
  energy: number;
}

function getAudioBands(
  analyser: AnalyserNode | null,
  playing: boolean,
): AudioBands {
  if (!analyser || !playing) return { bass: 0, mid: 0, high: 0, energy: 0 };
  const data = new Uint8Array(
    analyser.frequencyBinCount,
  ) as Uint8Array<ArrayBuffer>;
  analyser.getByteFrequencyData(data);
  const len = data.length;
  const third = Math.floor(len / 3);
  let bassSum = 0;
  let midSum = 0;
  let highSum = 0;
  for (let i = 0; i < third; i++) bassSum += data[i];
  for (let i = third; i < third * 2; i++) midSum += data[i];
  for (let i = third * 2; i < len; i++) highSum += data[i];
  const bass = bassSum / (third * 255);
  const mid = midSum / (third * 255);
  const high = highSum / ((len - third * 2) * 255);
  return { bass, mid, high, energy: (bass + mid + high) / 3 };
}

// ── Math helpers ─────────────────────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function ease(t: number): number {
  return t * t * (3 - 2 * t);
}

function randomFreq(): number {
  return 1 + Math.floor(Math.random() * 7);
}

// ── Shared ambient glow layer ─────────────────────────────────────────────
// Soft bubbles scattered across viewport, breathing in/out independently

const AMBIENT_BLOBS = 12;
const BUBBLE_LIFETIME = 480; // frames per bubble cycle (~8s at 60fps)

interface AmbientBubble {
  x: number; // 0–1 normalized position
  y: number;
  hue: number;
  birth: number; // frame when spawned
  lifetime: number; // frames until respawn
  cell: number; // grid cell index for spatial distribution
}

// Distribute bubbles across a grid to avoid clustering.
// Viewport is divided into cells; each bubble picks a cell that no
// other living bubble currently occupies (or the least-used one).
function pickScatteredPosition(
  bubbles: AmbientBubble[],
  selfIdx: number,
): { x: number; y: number; cell: number } {
  const cols = 4;
  const rows = 3;
  const totalCells = cols * rows;

  // Count how many living bubbles are in each cell
  const usage = new Uint8Array(totalCells);
  for (let i = 0; i < bubbles.length; i++) {
    if (i !== selfIdx && bubbles[i].cell >= 0) {
      usage[bubbles[i].cell]++;
    }
  }

  // Pick least-used cell (random among ties)
  let minUse = 255;
  for (let c = 0; c < totalCells; c++) {
    if (usage[c] < minUse) minUse = usage[c];
  }
  const candidates: number[] = [];
  for (let c = 0; c < totalCells; c++) {
    if (usage[c] === minUse) candidates.push(c);
  }
  const cell = candidates[Math.floor(Math.random() * candidates.length)];

  const col = cell % cols;
  const row = Math.floor(cell / cols);
  // Jitter within cell (20% padding from cell edges)
  const x = (col + 0.2 + Math.random() * 0.6) / cols;
  const y = (row + 0.2 + Math.random() * 0.6) / rows;
  return { x, y, cell };
}

function spawnBubble(
  frame: number,
  bubbles: AmbientBubble[],
  selfIdx: number,
): AmbientBubble {
  const pos = pickScatteredPosition(bubbles, selfIdx);
  return {
    ...pos,
    hue: Math.random() * 360,
    birth: frame,
    lifetime: BUBBLE_LIFETIME * (0.7 + Math.random() * 0.6),
  };
}

function initAmbientBubbles(count: number): AmbientBubble[] {
  const bubbles: AmbientBubble[] = [];
  for (let i = 0; i < count; i++) {
    const pos = pickScatteredPosition(bubbles, -1);
    bubbles.push({
      ...pos,
      hue: Math.random() * 360,
      birth: -Math.floor((i / count) * BUBBLE_LIFETIME),
      lifetime: BUBBLE_LIFETIME * (0.7 + Math.random() * 0.6),
    });
  }
  return bubbles;
}

function drawAmbient(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: number,
  audio: AudioBands,
  bubbles: AmbientBubble[],
) {
  const radius = Math.max(w, h) * 0.4;

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const age = frame - b.birth;

    // Respawn when lifetime exceeded — picks a new scattered position
    if (age >= b.lifetime) {
      bubbles[i] = spawnBubble(frame, bubbles, i);
      continue;
    }

    // Smooth bell-curve fade: slow breathe in → peak → breathe out
    const t = age / b.lifetime; // 0→1
    const alpha = Math.sin(t * Math.PI) * (0.03 + audio.energy * 0.025);

    if (alpha < 0.002) continue;

    const bx = b.x * w;
    const by = b.y * h;
    const hue = (b.hue + frame * 0.3) % 360;
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
    grad.addColorStop(0, `hsla(${hue}, 50%, 25%, ${alpha})`);
    grad.addColorStop(0.45, `hsla(${hue}, 40%, 18%, ${alpha * 0.3})`);
    grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

// ── Scene: Lissajous Ribbons ─────────────────────────────────────────────────
// Flowing neon parametric curves that morph between shapes

interface RibbonState {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  targetAx: number;
  targetAy: number;
  targetBx: number;
  targetBy: number;
  phase: number;
  hue: number;
  targetHue: number;
  morphT: number;
  morphDur: number;
}

function initRibbon(i: number, count: number): RibbonState {
  return {
    ax: randomFreq(),
    ay: randomFreq(),
    bx: randomFreq(),
    by: randomFreq(),
    targetAx: randomFreq(),
    targetAy: randomFreq(),
    targetBx: randomFreq(),
    targetBy: randomFreq(),
    phase: (i / count) * Math.PI * 2,
    hue: (i / count) * 360,
    targetHue: Math.random() * 360,
    morphT: 0,
    morphDur: 250 + Math.random() * 250,
  };
}

function drawRibbons(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  ribbons: RibbonState[],
) {
  const cx = w / 2;
  const cy = h / 2;
  const baseScale = Math.min(w, h) * 0.3;

  // ── Main sharp pass ──────────────────────────────────────────────────────
  for (const r of ribbons) {
    r.morphT++;
    if (r.morphT >= r.morphDur) {
      r.morphT = 0;
      r.morphDur = 250 + Math.random() * 250;
      r.ax = r.targetAx;
      r.ay = r.targetAy;
      r.bx = r.targetBx;
      r.by = r.targetBy;
      r.hue = r.targetHue;
      r.targetAx = randomFreq();
      r.targetAy = randomFreq();
      r.targetBx = randomFreq();
      r.targetBy = randomFreq();
      r.targetHue = Math.random() * 360;
    }
    const mt = ease(r.morphT / r.morphDur);
    const ax = lerp(r.ax, r.targetAx, mt);
    const ay = lerp(r.ay, r.targetAy, mt);
    const bx = lerp(r.bx, r.targetBx, mt);
    const by = lerp(r.by, r.targetBy, mt);
    const hue = lerp(r.hue, r.targetHue, mt);
    const amp = 0.5 + audio.bass * 0.5;
    const lw = 1.2 + audio.mid * 2;
    const po = r.phase + time;

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6 + audio.energy * 0.15;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let p = 0; p < POINTS; p++) {
      const t = (p / POINTS) * Math.PI * 2;
      const x =
        cx +
        baseScale *
          amp *
          (Math.sin(ax * t + po) + 0.3 * Math.sin(bx * t * 2.1 + po * 1.3));
      const y =
        cy +
        baseScale *
          amp *
          (Math.cos(ay * t + po * 0.7) +
            0.3 * Math.cos(by * t * 1.7 + po * 0.9));
      if (p === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const sat = 80 + audio.energy * 15;
    const lit = 42 + audio.energy * 13;
    const color = `hsl(${hue}, ${sat}%, ${lit}%)`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 + audio.energy * 10;
    ctx.stroke();
    ctx.restore();
  }
}

// ── Scene: Spirograph ────────────────────────────────────────────────────────
// Rotating epicycloid patterns — classic Spirograph toy look

interface SpiroState {
  R: number;
  r: number;
  d: number;
  targetR: number;
  targetr: number;
  targetd: number;
  hueBase: number;
  morphT: number;
  morphDur: number;
}

function initSpiro(): SpiroState {
  return {
    R: 3 + Math.random() * 5,
    r: 1 + Math.random() * 3,
    d: 1 + Math.random() * 4,
    targetR: 3 + Math.random() * 5,
    targetr: 1 + Math.random() * 3,
    targetd: 1 + Math.random() * 4,
    hueBase: Math.random() * 360,
    morphT: 0,
    morphDur: 400,
  };
}

function drawSpirograph(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  spiro: SpiroState,
) {
  spiro.morphT++;
  if (spiro.morphT >= spiro.morphDur) {
    spiro.morphT = 0;
    spiro.morphDur = 300 + Math.random() * 300;
    spiro.R = spiro.targetR;
    spiro.r = spiro.targetr;
    spiro.d = spiro.targetd;
    spiro.targetR = 3 + Math.random() * 5;
    spiro.targetr = 1 + Math.random() * 3;
    spiro.targetd = 1 + Math.random() * 4;
  }
  const mt = ease(spiro.morphT / spiro.morphDur);
  const R = lerp(spiro.R, spiro.targetR, mt);
  const r = lerp(spiro.r, spiro.targetr, mt);
  const d = lerp(spiro.d, spiro.targetd, mt);
  const cx = w / 2;
  const cy = h / 2;
  const scale = Math.min(w, h) * 0.3 * (0.6 + audio.energy * 0.4);

  for (let layer = 0; layer < SPIRO_LAYERS; layer++) {
    const hue = (spiro.hueBase + layer * 150 + time * 20) % 360;
    const layerPhase = time * (1 + layer * 0.3);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.6 + audio.energy * 0.2;
    ctx.lineWidth = 0.8 + audio.bass * 1.2;
    ctx.beginPath();
    for (let i = 0; i < SPIRO_POINTS; i++) {
      const t = (i / SPIRO_POINTS) * Math.PI * 2 * Math.ceil(r);
      const rr = r + layer * 0.3;
      const x =
        cx +
        scale *
          ((R - rr) * Math.cos(t + layerPhase) +
            d * Math.cos(((R - rr) / rr) * t + layerPhase));
      const y =
        cy +
        scale *
          ((R - rr) * Math.sin(t + layerPhase) +
            d * Math.sin(((R - rr) / rr) * t + layerPhase));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const sat = 75 + audio.mid * 15;
    const lit = 40 + audio.high * 15;
    const color = `hsl(${hue}, ${sat}%, ${lit}%)`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 + audio.energy * 6;
    ctx.stroke();
    ctx.restore();
  }
  spiro.hueBase = (spiro.hueBase + 0.15) % 360;
}

// ── Scene: Plasma Waves ──────────────────────────────────────────────────────
// Overlapping radial gradients that pulse with music

function drawPlasma(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
) {
  const cx = w / 2;
  const cy = h / 2;
  const blobCount = 5;
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let i = 0; i < blobCount; i++) {
    const angle = (i / blobCount) * Math.PI * 2 + time * (0.3 + i * 0.1);
    const dist = Math.min(w, h) * 0.15 * (1 + audio.bass * 0.8);
    const bx = cx + Math.cos(angle) * dist;
    const by = cy + Math.sin(angle) * dist;
    const radius =
      Math.min(w, h) *
      (0.2 + audio.energy * 0.25 + Math.sin(time * 2 + i) * 0.05);
    const hue = (time * 30 + i * 72) % 360;
    const grad = ctx.createRadialGradient(bx, by, 0, bx, by, radius);
    grad.addColorStop(0, `hsla(${hue}, 90%, 60%, ${0.3 + audio.mid * 0.3})`);
    grad.addColorStop(
      0.5,
      `hsla(${(hue + 40) % 360}, 85%, 45%, ${0.15 + audio.high * 0.15})`,
    );
    grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

// ── Scene: Starburst ─────────────────────────────────────────────────────────
// Radial lines from center pulsing with frequency data

function drawStarburst(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  audio: AudioBands,
  analyser: AnalyserNode | null,
  playing: boolean,
) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.42;
  const rays = 128;

  let freqData: Uint8Array<ArrayBuffer> | null = null;
  if (analyser && playing) {
    freqData = new Uint8Array(
      analyser.frequencyBinCount,
    ) as Uint8Array<ArrayBuffer>;
    analyser.getByteFrequencyData(freqData);
  }

  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const rotation = time * 0.15;

  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2 + rotation;
    const val = freqData ? freqData[i % freqData.length] / 255 : 0;
    const len = maxR * (0.1 + val * 0.9);
    const hue = (i / rays) * 360 + time * 40;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
    const color = `hsl(${hue % 360}, ${80 + val * 15}%, ${35 + val * 25}%)`;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4 + val * 6;
    ctx.lineWidth = 0.8 + val * 1.8;
    ctx.stroke();
  }

  // Center glow
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.15);
  coreGrad.addColorStop(
    0,
    `hsla(${(time * 60) % 360}, 80%, 70%, ${0.3 + audio.bass * 0.3})`,
  );
  coreGrad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
  ctx.fillStyle = coreGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ── Scene: Vortex ────────────────────────────────────────────────────────────
// Particles spiraling into/out of center with trailing arcs

interface VortexParticle {
  angle: number;
  radius: number;
  speed: number;
  hue: number;
  size: number;
}

function initVortexParticles(count: number): VortexParticle[] {
  const particles: VortexParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      radius: Math.random(),
      speed: 0.5 + Math.random() * 1.5,
      hue: Math.random() * 360,
      size: 1 + Math.random() * 2,
    });
  }
  return particles;
}

function drawVortex(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  _time: number,
  audio: AudioBands,
  particles: VortexParticle[],
) {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) * 0.42;

  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (const p of particles) {
    p.angle += p.speed * 0.02 * (1 + audio.energy);
    p.radius += (0.003 + audio.bass * 0.005) * p.speed;
    if (p.radius > 1) {
      p.radius = 0;
      p.hue = Math.random() * 360;
      p.angle = Math.random() * Math.PI * 2;
    }
    p.hue = (p.hue + 0.3) % 360;

    const r = p.radius * maxR;
    const x = cx + Math.cos(p.angle) * r;
    const y = cy + Math.sin(p.angle) * r;
    const alpha = Math.sin(p.radius * Math.PI);
    const sz = p.size * (1 + audio.mid * 2) * alpha;

    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    const color = `hsla(${p.hue}, 90%, ${55 + audio.high * 20}%, ${alpha * 0.8})`;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + audio.energy * 8;
    ctx.fill();
  }
  ctx.restore();
}

// ── Main component ───────────────────────────────────────────────────────────

const SCENE_COUNT = 5;
const SCENE_NAMES = [
  "Ribbons",
  "Spirograph",
  "Plasma",
  "Starburst",
  "Vortex",
] as const;

export type AlchemySceneInfo = {
  scene: string;
  nextScene: string | null;
  fadePct: number;
  sceneTimer: number;
};

interface Props {
  getAnalyser: () => AnalyserNode | null;
  isPlaying: boolean;
  accentColor: string;
  ambientBgEnabled?: boolean;
  onSceneInfo?: (info: AlchemySceneInfo) => void;
}

export function AlchemyVisualizer({
  getAnalyser,
  isPlaying,
  accentColor,
  ambientBgEnabled = false,
  onSceneInfo,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getAnalyserRef = useRef(getAnalyser);
  const isPlayingRef = useRef(isPlaying);
  const accentColorRef = useRef(accentColor);
  const ambientBgRef = useRef(ambientBgEnabled);
  const onSceneInfoRef = useRef(onSceneInfo);
  getAnalyserRef.current = getAnalyser;
  isPlayingRef.current = isPlaying;
  accentColorRef.current = accentColor;
  ambientBgRef.current = ambientBgEnabled;
  onSceneInfoRef.current = onSceneInfo;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Offscreen buffers for proper crossfade (trails can't fade on a shared canvas)
    const bufA = document.createElement("canvas");
    const bufB = document.createElement("canvas");
    const ctxA = bufA.getContext("2d")!;
    const ctxB = bufB.getContext("2d")!;

    let raf = 0;
    let time = 0;
    let frame = 0;
    let sceneTimer = 0;
    let currentScene = Math.floor(Math.random() * SCENE_COUNT);
    let nextScene = -1;
    let fadeProgress = 0;
    let bufW = 0;
    let bufH = 0;

    // Scene-specific state
    const ribbons = Array.from({ length: 5 }, (_, i) => initRibbon(i, 5));
    const spiro = initSpiro();
    const vortexParticles = initVortexParticles(200);
    const ambientBubbles = initAmbientBubbles(AMBIENT_BLOBS);

    function pickNextScene(cur: number): number {
      let n = Math.floor(Math.random() * (SCENE_COUNT - 1));
      if (n >= cur) n++;
      return n;
    }

    function syncBufferSize(w: number, h: number, dpr: number) {
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (bufW === pw && bufH === ph) return;
      bufW = pw;
      bufH = ph;
      for (const buf of [bufA, bufB]) {
        buf.width = pw;
        buf.height = ph;
      }
      ctxA.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const ro = new ResizeObserver(([entry]) => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = entry.contentRect;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      syncBufferSize(width, height, dpr);
    });
    ro.observe(canvas);

    function drawSceneTo(
      target: CanvasRenderingContext2D,
      scene: number,
      w: number,
      h: number,
      audio: AudioBands,
    ) {
      // Shared ambient glow behind all scenes (toggled by user)
      if (ambientBgRef.current) {
        drawAmbient(target, w, h, frame, audio, ambientBubbles);
      }
      switch (scene) {
        case 0:
          drawRibbons(target, w, h, time, audio, ribbons);
          break;
        case 1:
          drawSpirograph(target, w, h, time, audio, spiro);
          break;
        case 2:
          drawPlasma(target, w, h, time, audio);
          break;
        case 3:
          drawStarburst(
            target,
            w,
            h,
            time,
            audio,
            getAnalyserRef.current(),
            isPlayingRef.current,
          );
          break;
        case 4:
          drawVortex(target, w, h, time, audio, vortexParticles);
          break;
      }
    }

    const tick = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      syncBufferSize(w, h, dpr);

      const analyser = getAnalyserRef.current();
      const audio = getAudioBands(analyser, isPlayingRef.current);

      time += 0.008 + audio.energy * 0.012;
      frame++;
      sceneTimer++;

      // Start crossfade
      if (nextScene < 0 && sceneTimer >= SCENE_DURATION) {
        nextScene = pickNextScene(currentScene);
        fadeProgress = 0;
        // Clear incoming buffer so it starts fresh
        ctxB.clearRect(0, 0, w, h);
      }

      // Clear main canvas
      ctx.clearRect(0, 0, w, h);

      if (nextScene >= 0) {
        fadeProgress++;
        const fadePct = Math.min(1, fadeProgress / CROSSFADE_FRAMES);
        const fadeEased = ease(fadePct);

        // Draw current scene into buffer A with trail overlay
        ctxA.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA + audio.energy * 0.04})`;
        ctxA.fillRect(0, 0, w, h);
        drawSceneTo(ctxA, currentScene, w, h, audio);

        // Draw next scene into buffer B with trail overlay
        ctxB.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA + audio.energy * 0.04})`;
        ctxB.fillRect(0, 0, w, h);
        drawSceneTo(ctxB, nextScene, w, h, audio);

        // Composite: old fades out, new fades in
        ctx.globalAlpha = 1 - fadeEased;
        ctx.drawImage(bufA, 0, 0, w, h);
        ctx.globalAlpha = fadeEased;
        ctx.drawImage(bufB, 0, 0, w, h);
        ctx.globalAlpha = 1;

        if (fadePct >= 1) {
          // Swap: copy B → A in raw pixel space (bypass DPR transform)
          ctxA.save();
          ctxA.setTransform(1, 0, 0, 1, 0, 0);
          ctxA.clearRect(0, 0, bufA.width, bufA.height);
          ctxA.drawImage(bufB, 0, 0);
          ctxA.restore();
          ctxB.save();
          ctxB.setTransform(1, 0, 0, 1, 0, 0);
          ctxB.clearRect(0, 0, bufB.width, bufB.height);
          ctxB.restore();
          currentScene = nextScene;
          nextScene = -1;
          sceneTimer = 0;
          fadeProgress = 0;
        }
      } else {
        // Single scene: draw into buffer A, then copy to main canvas
        ctxA.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA + audio.energy * 0.04})`;
        ctxA.fillRect(0, 0, w, h);
        drawSceneTo(ctxA, currentScene, w, h, audio);
        ctx.drawImage(bufA, 0, 0, w, h);
      }

      // Report scene info for debug overlay
      onSceneInfoRef.current?.({
        scene: SCENE_NAMES[currentScene],
        nextScene: nextScene >= 0 ? SCENE_NAMES[nextScene] : null,
        fadePct:
          nextScene >= 0 ? Math.min(1, fadeProgress / CROSSFADE_FRAMES) : 0,
        sceneTimer,
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="h-72 w-full rounded-2xl xl:h-80" />;
}
