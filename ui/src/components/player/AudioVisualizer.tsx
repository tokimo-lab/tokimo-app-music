import { useEffect, useRef } from "react";

const BAR_COUNT = 48;
const BAR_GAP = 3;
const MIN_BAR_HEIGHT = 2;
const BORDER_RADIUS = 2;

/**
 * Canvas-based audio frequency bars visualizer.
 * Reads frequency data from a Web Audio AnalyserNode and draws animated bars.
 */
export function AudioVisualizer({
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
  const dataRef = useRef<Uint8Array | null>(null);
  // Smooth falloff values for when audio pauses
  const smoothRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      const analyser = getAnalyser();

      if (!smoothRef.current || smoothRef.current.length !== BAR_COUNT) {
        smoothRef.current = new Float32Array(BAR_COUNT);
      }

      if (analyser && isPlaying) {
        const bufLen = analyser.frequencyBinCount;
        if (!dataRef.current || dataRef.current.length !== bufLen) {
          dataRef.current = new Uint8Array(bufLen);
        }
        analyser.getByteFrequencyData(dataRef.current);

        const step = Math.floor(bufLen / BAR_COUNT);
        for (let i = 0; i < BAR_COUNT; i++) {
          // Average a few bins for smoother bars
          let sum = 0;
          const start = i * step;
          for (let j = start; j < start + step && j < bufLen; j++) {
            sum += dataRef.current[j];
          }
          const raw = sum / step / 255;
          // Smooth towards target value
          smoothRef.current[i] += (raw - smoothRef.current[i]) * 0.3;
        }
      } else {
        // Decay bars when paused
        for (let i = 0; i < BAR_COUNT; i++) {
          smoothRef.current[i] *= 0.92;
        }
      }

      const barWidth = (w - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const maxBarH = h * 0.85;

      for (let i = 0; i < BAR_COUNT; i++) {
        const val = smoothRef.current[i];
        const barH = Math.max(MIN_BAR_HEIGHT, val * maxBarH);
        const x = i * (barWidth + BAR_GAP);
        const y = h / 2 - barH / 2;

        // Gradient per bar: accent color at center fading to transparent
        const gradient = ctx.createLinearGradient(x, y, x, y + barH);
        gradient.addColorStop(0, `${accentColor}40`);
        gradient.addColorStop(0.3, `${accentColor}cc`);
        gradient.addColorStop(0.5, accentColor);
        gradient.addColorStop(0.7, `${accentColor}cc`);
        gradient.addColorStop(1, `${accentColor}40`);

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, BORDER_RADIUS);
        ctx.fillStyle = gradient;
        ctx.fill();
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
