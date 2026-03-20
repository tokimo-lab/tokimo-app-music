import type { AudioBands } from "./types";

const AMBIENT_BLOBS = 12;
const BUBBLE_LIFETIME = 480;

interface AmbientBubble {
  x: number;
  y: number;
  hue: number;
  birth: number;
  lifetime: number;
  cell: number;
}

function pickScatteredPosition(
  bubbles: AmbientBubble[],
  selfIdx: number,
): { x: number; y: number; cell: number } {
  const cols = 4;
  const rows = 3;
  const totalCells = cols * rows;
  const usage = new Uint8Array(totalCells);
  for (let i = 0; i < bubbles.length; i++) {
    if (i !== selfIdx && bubbles[i].cell >= 0) {
      usage[bubbles[i].cell]++;
    }
  }
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

export function initAmbientBubbles(): AmbientBubble[] {
  const bubbles: AmbientBubble[] = [];
  for (let i = 0; i < AMBIENT_BLOBS; i++) {
    const pos = pickScatteredPosition(bubbles, -1);
    bubbles.push({
      ...pos,
      hue: Math.random() * 360,
      birth: -Math.floor((i / AMBIENT_BLOBS) * BUBBLE_LIFETIME),
      lifetime: BUBBLE_LIFETIME * (0.7 + Math.random() * 0.6),
    });
  }
  return bubbles;
}

export function drawAmbient(
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
    if (age >= b.lifetime) {
      bubbles[i] = spawnBubble(frame, bubbles, i);
      continue;
    }
    const t = age / b.lifetime;
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
