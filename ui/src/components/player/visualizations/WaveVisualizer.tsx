import { useEffect, useRef } from "react";

const WAVE_LAYERS = 4;
const CURVE_POINTS = 120;

const AMPLITUDE_MULT = [0.3, 0.5, 0.7, 1.0];
const OPACITY = [0.15, 0.25, 0.4, 0.6];
// Phase speed per layer (radians/frame)
const PHASE_SPEED = [0.012, 0.018, 0.009, 0.015];
const SECONDARY_FREQ = [1.8, 2.3, 1.5, 2.7];
const SECONDARY_AMP = [0.3, 0.25, 0.35, 0.2];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Flowing multi-layer sine-wave visualizer driven by frequency data.
 * Divides the spectrum into 4 bands; each band modulates one wave layer.
 */
export function WaveVisualizer({
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
  // Smoothed energy per band (4 values)
  const bandRef = useRef(new Float32Array(WAVE_LAYERS));
  // Running phase offset per layer
  const phaseRef = useRef(new Float32Array(WAVE_LAYERS));

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
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const draw = () => {
      const analyser = getAnalyser();
      const bands = bandRef.current;
      const phases = phaseRef.current;

      if (analyser && isPlaying) {
        const bufLen = analyser.frequencyBinCount;
        if (!dataRef.current || dataRef.current.length !== bufLen) {
          dataRef.current = new Uint8Array(bufLen) as Uint8Array<ArrayBuffer>;
        }
        analyser.getByteFrequencyData(dataRef.current);

        // Split into 4 bands: sub-bass, bass, mid, high
        const bandSize = Math.floor(bufLen / WAVE_LAYERS);
        for (let b = 0; b < WAVE_LAYERS; b++) {
          let sum = 0;
          const start = b * bandSize;
          const end = Math.min(start + bandSize, bufLen);
          for (let j = start; j < end; j++) {
            sum += dataRef.current[j];
          }
          const raw = sum / (end - start) / 255;
          bands[b] += (raw - bands[b]) * 0.18;
        }
      } else {
        // Decay toward 0 when paused
        for (let b = 0; b < WAVE_LAYERS; b++) {
          bands[b] *= 0.94;
        }
      }

      // Always advance phase for continuous flow
      for (let b = 0; b < WAVE_LAYERS; b++) {
        phases[b] += PHASE_SPEED[b];
      }

      ctx.clearRect(0, 0, cssW, cssH);

      const centerY = cssH * 0.5;
      const maxAmp = cssH * 0.35;
      const [r, g, bl] = hexToRgb(accentColor);

      // Draw layers back-to-front (lowest opacity first)
      for (let layer = 0; layer < WAVE_LAYERS; layer++) {
        const energy = bands[layer];
        const amp = energy * maxAmp * AMPLITUDE_MULT[layer];
        const phase = phases[layer];
        const opacity = OPACITY[layer];

        // Primary wave frequency (cycles across canvas width)
        const primaryFreq = (2 + layer * 0.5) * Math.PI * 2;
        const secFreq = primaryFreq * SECONDARY_FREQ[layer];
        const secAmp = SECONDARY_AMP[layer];

        // Build bezier path
        ctx.beginPath();
        const xs: number[] = [];
        const ys: number[] = [];

        for (let i = 0; i <= CURVE_POINTS; i++) {
          const t = i / CURVE_POINTS;
          const x = t * cssW;
          const primary = Math.sin(t * primaryFreq + phase);
          const secondary = Math.sin(t * secFreq + phase * 1.7) * secAmp;
          const y = centerY + amp * (primary + secondary);
          xs.push(x);
          ys.push(y);
        }

        // Start from the first point
        ctx.moveTo(xs[0], ys[0]);
        // Connect with bezier curves through all points
        for (let i = 1; i < xs.length - 1; i += 2) {
          const cpX = xs[i];
          const cpY = ys[i];
          const endX = i + 1 < xs.length ? xs[i + 1] : xs[xs.length - 1];
          const endY = i + 1 < ys.length ? ys[i + 1] : ys[ys.length - 1];
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        }
        // If odd number of remaining points, line to last
        if (xs.length % 2 === 0) {
          ctx.lineTo(xs[xs.length - 1], ys[ys.length - 1]);
        }

        // Fill below the wave
        ctx.lineTo(cssW, cssH);
        ctx.lineTo(0, cssH);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, centerY - amp, 0, cssH);
        grad.addColorStop(0, `rgba(${r},${g},${bl},${opacity})`);
        grad.addColorStop(0.6, `rgba(${r},${g},${bl},${opacity * 0.3})`);
        grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
        ctx.fillStyle = grad;
        ctx.fill();

        // Stroke the top edge for definition
        ctx.beginPath();
        ctx.moveTo(xs[0], ys[0]);
        for (let i = 1; i < xs.length - 1; i += 2) {
          const cpX = xs[i];
          const cpY = ys[i];
          const endX = i + 1 < xs.length ? xs[i + 1] : xs[xs.length - 1];
          const endY = i + 1 < ys.length ? ys[i + 1] : ys[ys.length - 1];
          ctx.quadraticCurveTo(cpX, cpY, endX, endY);
        }
        if (xs.length % 2 === 0) {
          ctx.lineTo(xs[xs.length - 1], ys[ys.length - 1]);
        }
        ctx.strokeStyle = `rgba(${r},${g},${bl},${opacity * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      resizeObserver.disconnect();
    };
  }, [getAnalyser, isPlaying, accentColor]);

  return (
    <canvas
      ref={canvasRef}
      className="h-72 w-72 xl:h-80 xl:w-80"
      style={{ imageRendering: "auto" }}
    />
  );
}
