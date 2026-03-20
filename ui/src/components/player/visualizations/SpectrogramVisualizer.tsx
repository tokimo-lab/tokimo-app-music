import { useEffect, useRef } from "react";

const FREQ_BANDS = 64;
const SCROLL_PX = 2;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Map a normalised amplitude (0–1) to an RGBA colour.
 *   0–0.30  → transparent → accentColor @20%
 *   0.30–0.60 → accentColor @20–80%
 *   0.60–0.85 → accentColor @80–100%
 *   0.85–1.00 → accentColor → white
 */
function amplitudeToColor(
  v: number,
  r: number,
  g: number,
  b: number,
): [number, number, number, number] {
  if (v < 0.3) {
    const t = v / 0.3;
    return [r, g, b, t * 0.2];
  }
  if (v < 0.6) {
    const t = (v - 0.3) / 0.3;
    return [r, g, b, 0.2 + t * 0.6];
  }
  if (v < 0.85) {
    const t = (v - 0.6) / 0.25;
    return [r, g, b, 0.8 + t * 0.2];
  }
  // Blend toward white
  const t = (v - 0.85) / 0.15;
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return [mix(r), mix(g), mix(b), 1.0];
}

/**
 * Scrolling spectrogram / heatmap visualizer.
 * X = time (scrolling left), Y = frequency (low bottom, high top).
 */
export function SpectrogramVisualizer({
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
  // Offscreen canvas holds the accumulated spectrogram
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const fadeOpacityRef = useRef(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cssW = 0;
    let cssH = 0;
    let pixelW = 0;
    let pixelH = 0;

    const ensureOffscreen = () => {
      if (
        !offscreenRef.current ||
        offscreenRef.current.width !== pixelW ||
        offscreenRef.current.height !== pixelH
      ) {
        const prev = offscreenRef.current;
        const off = document.createElement("canvas");
        off.width = pixelW;
        off.height = pixelH;
        // Copy old content if resizing
        if (prev && prev.width > 0 && prev.height > 0) {
          const offCtx = off.getContext("2d");
          if (offCtx) offCtx.drawImage(prev, 0, 0, pixelW, pixelH);
        }
        offscreenRef.current = off;
      }
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      cssW = rect.width;
      cssH = rect.height;
      pixelW = Math.round(cssW * dpr);
      pixelH = Math.round(cssH * dpr);
      canvas.width = pixelW;
      canvas.height = pixelH;
      ctx.scale(dpr, dpr);
      ensureOffscreen();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    // Build a logarithmic frequency-bin-to-y mapping
    const buildBinMap = (binCount: number): Float32Array => {
      const map = new Float32Array(FREQ_BANDS);
      for (let i = 0; i < FREQ_BANDS; i++) {
        // Map band index [0..FREQ_BANDS-1] logarithmically into [0..binCount-1]
        const t = i / (FREQ_BANDS - 1);
        const logIndex = 2 ** (t * Math.log2(binCount)) - 1;
        map[i] = Math.min(logIndex, binCount - 1);
      }
      return map;
    };

    let binMap: Float32Array | null = null;

    const draw = () => {
      const analyser = getAnalyser();
      const off = offscreenRef.current;
      if (!off) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const offCtx = off.getContext("2d");
      if (!offCtx) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const [r, g, b] = hexToRgb(accentColor);

      if (analyser && isPlaying) {
        fadeOpacityRef.current = 1;
        const bufLen = analyser.frequencyBinCount;
        if (!dataRef.current || dataRef.current.length !== bufLen) {
          dataRef.current = new Uint8Array(bufLen) as Uint8Array<ArrayBuffer>;
        }
        if (!binMap || binMap.length !== FREQ_BANDS) {
          binMap = buildBinMap(bufLen);
        }
        analyser.getByteFrequencyData(dataRef.current);

        // Shift existing spectrogram left
        offCtx.globalCompositeOperation = "copy";
        offCtx.drawImage(off, -SCROLL_PX, 0);
        offCtx.globalCompositeOperation = "source-over";

        // Draw new column on the right edge
        const colX = pixelW - SCROLL_PX;
        const bandH = pixelH / FREQ_BANDS;

        for (let i = 0; i < FREQ_BANDS; i++) {
          const binIdx = binMap[i];
          const lo = Math.floor(binIdx);
          const hi = Math.min(lo + 1, bufLen - 1);
          const frac = binIdx - lo;
          const val =
            (dataRef.current[lo] * (1 - frac) + dataRef.current[hi] * frac) /
            255;

          const [cr, cg, cb, ca] = amplitudeToColor(val, r, g, b);
          // Low frequencies at bottom → invert y
          const y = pixelH - (i + 1) * bandH;
          offCtx.fillStyle = `rgba(${cr},${cg},${cb},${ca})`;
          offCtx.fillRect(colX, y, SCROLL_PX, Math.ceil(bandH));
        }
      } else {
        // Slowly fade when paused
        fadeOpacityRef.current = Math.max(0.15, fadeOpacityRef.current * 0.995);
      }

      // Render offscreen → onscreen
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.save();
      ctx.globalAlpha = fadeOpacityRef.current;
      ctx.drawImage(off, 0, 0, cssW, cssH);
      ctx.restore();

      // Left-edge fade gradient (oldest data fades out)
      const fadeW = cssW * 0.12;
      const fadeGrad = ctx.createLinearGradient(0, 0, fadeW, 0);
      fadeGrad.addColorStop(0, "rgba(0,0,0,1)");
      fadeGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(0, 0, fadeW, cssH);
      ctx.restore();

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
      className="h-72 w-72 xl:h-80 xl:w-80 rounded-xl"
      style={{ imageRendering: "auto" }}
    />
  );
}
