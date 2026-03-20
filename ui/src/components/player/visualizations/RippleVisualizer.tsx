import { useEffect, useRef } from "react";

const MAX_RIPPLES = 15;
const DOT_GRID_COLS = 10;
const DOT_GRID_ROWS = 10;
const RIPPLE_HIT_RANGE = 10;
const BASS_TRIGGER_FACTOR = 1.4;
const FADE_RATE = 0.97;
const EXPAND_SPEED = 2;

interface Ripple {
  cx: number;
  cy: number;
  radius: number;
  opacity: number;
  lineWidth: number;
}

interface GridDot {
  x: number;
  y: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.substring(0, 2), 16),
    g: Number.parseInt(h.substring(2, 4), 16),
    b: Number.parseInt(h.substring(4, 6), 16),
  };
}

function buildGrid(w: number, h: number): GridDot[] {
  const dots: GridDot[] = [];
  const spacingX = w / (DOT_GRID_COLS + 1);
  const spacingY = h / (DOT_GRID_ROWS + 1);
  for (let row = 1; row <= DOT_GRID_ROWS; row++) {
    for (let col = 1; col <= DOT_GRID_COLS; col++) {
      dots.push({ x: col * spacingX, y: row * spacingY });
    }
  }
  return dots;
}

export function RippleVisualizer({
  getAnalyser,
  isPlaying,
  accentColor,
}: {
  getAnalyser: () => AnalyserNode | null;
  isPlaying: boolean;
  accentColor: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const ripplesRef = useRef<Ripple[]>([]);
  const gridRef = useRef<GridDot[]>([]);
  const bassAvgRef = useRef(0);
  const midAvgRef = useRef(0);

  // Store props in refs so the RAF loop always reads current values
  const getAnalyserRef = useRef(getAnalyser);
  const isPlayingRef = useRef(isPlaying);
  const accentColorRef = useRef(accentColor);
  getAnalyserRef.current = getAnalyser;
  isPlayingRef.current = isPlaying;
  accentColorRef.current = accentColor;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      ctx.scale(dpr, dpr);
      gridRef.current = buildGrid(cssW, cssH);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const draw = () => {
      const analyser = getAnalyserRef.current();
      let bassEnergy = 0;
      let midEnergy = 0;

      if (analyser) {
        if (
          !dataRef.current ||
          dataRef.current.length !== analyser.frequencyBinCount
        ) {
          dataRef.current = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(dataRef.current);
        const len = dataRef.current.length;
        const bassEnd = Math.floor(len / 4);
        const midEnd = Math.floor(len / 2);

        let bassTotal = 0;
        let midTotal = 0;
        for (let i = 0; i < bassEnd; i++) bassTotal += dataRef.current[i];
        for (let i = bassEnd; i < midEnd; i++) midTotal += dataRef.current[i];

        bassEnergy = bassTotal / bassEnd;
        midEnergy = midTotal / (midEnd - bassEnd);
      }

      // Running averages
      bassAvgRef.current += (bassEnergy - bassAvgRef.current) * 0.05;
      midAvgRef.current += (midEnergy - midAvgRef.current) * 0.05;

      const ripples = ripplesRef.current;
      const rgb = hexToRgb(accentColorRef.current);

      // Beat detection & spawning
      if (isPlayingRef.current) {
        if (
          bassEnergy > bassAvgRef.current * BASS_TRIGGER_FACTOR &&
          bassEnergy > 60 &&
          ripples.length < MAX_RIPPLES
        ) {
          const strength = Math.min(1, bassEnergy / 200);
          ripples.push({
            cx: cssW / 2 + (Math.random() - 0.5) * 20,
            cy: cssH / 2 + (Math.random() - 0.5) * 20,
            radius: 5,
            opacity: 0.6 + strength * 0.4,
            lineWidth: 2 + strength * 2,
          });
        }

        if (
          midEnergy > midAvgRef.current * BASS_TRIGGER_FACTOR &&
          midEnergy > 50 &&
          ripples.length < MAX_RIPPLES
        ) {
          const strength = Math.min(1, midEnergy / 200);
          ripples.push({
            cx: Math.random() * cssW,
            cy: Math.random() * cssH,
            radius: 5,
            opacity: 0.4 + strength * 0.3,
            lineWidth: 2 + strength * 1,
          });
        }
      }

      ctx.clearRect(0, 0, cssW, cssH);

      // Draw grid dots
      const dots = gridRef.current;
      for (let d = 0; d < dots.length; d++) {
        const dot = dots[d];
        let influence = 0;

        for (let r = 0; r < ripples.length; r++) {
          const rip = ripples[r];
          const dx = dot.x - rip.cx;
          const dy = dot.y - rip.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const diff = Math.abs(dist - rip.radius);
          if (diff < RIPPLE_HIT_RANGE) {
            influence += (1 - diff / RIPPLE_HIT_RANGE) * rip.opacity;
          }
        }
        influence = Math.min(1, influence);

        const dotRadius = 1 + influence * 2.5;
        const dotOpacity = 0.08 + influence * 0.7;

        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${dotOpacity})`;
        ctx.fill();
      }

      // Update & draw ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rip = ripples[i];
        rip.radius += EXPAND_SPEED;
        rip.opacity *= FADE_RATE;

        if (rip.opacity < 0.01) {
          ripples.splice(i, 1);
          continue;
        }

        // Glow layer
        ctx.beginPath();
        ctx.arc(rip.cx, rip.cy, rip.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${rip.opacity * 0.3})`;
        ctx.lineWidth = rip.lineWidth * 3;
        ctx.stroke();

        // Main ring
        ctx.beginPath();
        ctx.arc(rip.cx, rip.cy, rip.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${rip.opacity})`;
        ctx.lineWidth = rip.lineWidth;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-72 w-72 xl:h-80 xl:w-80"
      style={{ imageRendering: "auto" }}
    />
  );
}
