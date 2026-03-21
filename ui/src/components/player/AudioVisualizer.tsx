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
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const smoothRef = useRef<Float32Array | null>(null);

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

      const analyser = getAnalyserRef.current();

      if (!smoothRef.current || smoothRef.current.length !== BAR_COUNT) {
        smoothRef.current = new Float32Array(BAR_COUNT);
      }

      if (analyser && isPlayingRef.current) {
        const bufLen = analyser.frequencyBinCount;
        if (!dataRef.current || dataRef.current.length !== bufLen) {
          dataRef.current = new Uint8Array(bufLen);
        }
        analyser.getByteFrequencyData(dataRef.current);

        const step = Math.floor(bufLen / BAR_COUNT);
        for (let i = 0; i < BAR_COUNT; i++) {
          let sum = 0;
          const start = i * step;
          for (let j = start; j < start + step && j < bufLen; j++) {
            sum += dataRef.current[j];
          }
          const raw = sum / step / 255;
          smoothRef.current[i] += (raw - smoothRef.current[i]) * 0.3;
        }
      } else {
        for (let i = 0; i < BAR_COUNT; i++) {
          smoothRef.current[i] *= 0.92;
        }
      }

      const color = accentColorRef.current;
      const barWidth = (w - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const maxBarH = h * 0.85;

      for (let i = 0; i < BAR_COUNT; i++) {
        const val = smoothRef.current[i];
        const barH = Math.max(MIN_BAR_HEIGHT, val * maxBarH);
        const x = i * (barWidth + BAR_GAP);
        const y = h / 2 - barH / 2;

        const gradient = ctx.createLinearGradient(x, y, x, y + barH);
        gradient.addColorStop(0, `${color}40`);
        gradient.addColorStop(0.3, `${color}cc`);
        gradient.addColorStop(0.5, color);
        gradient.addColorStop(0.7, `${color}cc`);
        gradient.addColorStop(1, `${color}40`);

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
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-72 w-72 xl:h-80 xl:w-80"
      style={{ imageRendering: "auto" }}
    />
  );
}
