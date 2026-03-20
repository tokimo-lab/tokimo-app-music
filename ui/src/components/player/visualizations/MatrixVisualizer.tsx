import { useEffect, useRef } from "react";

const COLUMN_COUNT = 30;
const CHAR_SET =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
const FONT_SIZE = 14;
const MIN_TRAIL = 8;
const MAX_TRAIL = 20;

interface RainColumn {
  y: number;
  speed: number;
  trailLen: number;
  chars: string[];
}

function randomChar(): string {
  return CHAR_SET[Math.floor(Math.random() * CHAR_SET.length)];
}

function initColumn(canvasH: number): RainColumn {
  const trailLen =
    MIN_TRAIL + Math.floor(Math.random() * (MAX_TRAIL - MIN_TRAIL));
  return {
    y: -Math.random() * canvasH,
    speed: 1.5 + Math.random() * 2.5,
    trailLen,
    chars: Array.from({ length: trailLen }, randomChar),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: Number.parseInt(h.substring(0, 2), 16),
    g: Number.parseInt(h.substring(2, 4), 16),
    b: Number.parseInt(h.substring(4, 6), 16),
  };
}

export function MatrixVisualizer({
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
  const columnsRef = useRef<RainColumn[]>([]);
  const frameCountRef = useRef(0);

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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    if (columnsRef.current.length !== COLUMN_COUNT) {
      columnsRef.current = Array.from({ length: COLUMN_COUNT }, () =>
        initColumn(cssH || 300),
      );
    }

    const draw = () => {
      const analyser = getAnalyserRef.current();
      const freqBinCount = analyser ? analyser.frequencyBinCount : 128;

      if (!dataRef.current || dataRef.current.length !== freqBinCount) {
        dataRef.current = new Uint8Array(
          freqBinCount,
        ) as Uint8Array<ArrayBuffer>;
      }

      const data = dataRef.current;
      const columns = columnsRef.current;
      const frame = frameCountRef.current++;

      if (analyser && isPlayingRef.current) {
        analyser.getByteFrequencyData(data);
      } else if (!isPlayingRef.current) {
        // Fade frequency data toward zero when paused
        for (let i = 0; i < data.length; i++) {
          data[i] = Math.floor(data[i] * 0.92);
        }
      }

      // Calculate bass energy for burst triggers
      let bassEnergy = 0;
      const bassEnd = Math.floor(freqBinCount * 0.15);
      for (let i = 0; i < bassEnd; i++) {
        bassEnergy += data[i];
      }
      bassEnergy /= bassEnd * 255;

      const { r, g, b } = hexToRgb(accentColorRef.current);

      // Fade effect: semi-transparent black overlay
      const fadeAlpha = isPlayingRef.current ? 0.05 : 0.15;
      if (frame % 120 === 0) {
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fillRect(0, 0, cssW, cssH);
      } else {
        ctx.fillStyle = `rgba(0,0,0,${fadeAlpha})`;
        ctx.fillRect(0, 0, cssW, cssH);
      }

      const colWidth = cssW / COLUMN_COUNT;
      const binsPerCol = Math.floor(freqBinCount / COLUMN_COUNT);

      ctx.font = `${FONT_SIZE}px monospace`;
      ctx.textAlign = "center";

      for (let c = 0; c < COLUMN_COUNT; c++) {
        const col = columns[c];

        // Column frequency energy
        let colEnergy = 0;
        const start = c * binsPerCol;
        for (let j = start; j < start + binsPerCol && j < freqBinCount; j++) {
          colEnergy += data[j];
        }
        colEnergy /= binsPerCol * 255;

        // Audio modulation
        const speedMul = isPlayingRef.current ? 1 + colEnergy * 3 : 0.15;
        col.speed = 1.5 + colEnergy * 4;
        col.trailLen =
          MIN_TRAIL + Math.floor(colEnergy * (MAX_TRAIL - MIN_TRAIL));

        // Bass burst: reset some columns to top
        if (isPlayingRef.current && bassEnergy > 0.7 && Math.random() < 0.1) {
          col.y = 0;
          col.speed = 4 + Math.random() * 3;
          col.trailLen = MAX_TRAIL;
        }

        // Randomly mutate 1-2 chars in trail
        const mutations = 1 + Math.floor(Math.random() * 2);
        for (let m = 0; m < mutations; m++) {
          const idx = Math.floor(Math.random() * col.chars.length);
          col.chars[idx] = randomChar();
        }

        // Ensure chars array matches trail length
        while (col.chars.length < col.trailLen) col.chars.push(randomChar());

        // Draw characters in trail
        const x = c * colWidth + colWidth / 2;
        for (let i = 0; i < col.trailLen; i++) {
          const charY = col.y - i * FONT_SIZE;
          if (charY < -FONT_SIZE || charY > cssH + FONT_SIZE) continue;

          const charIdx = i % col.chars.length;

          if (i === 0) {
            // Lead character: full brightness
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.shadowColor = accentColorRef.current;
            ctx.shadowBlur = 8;
          } else {
            // Trail: fade from bright to dim
            const fade = 1 - i / col.trailLen;
            const alpha = Math.max(fade * 0.9, 0.1);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.shadowColor = "transparent";
            ctx.shadowBlur = 0;
          }

          ctx.fillText(col.chars[charIdx], x, charY);
        }

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Advance column position
        col.y += col.speed * speedMul;

        // Reset column when fully off screen
        if (col.y - col.trailLen * FONT_SIZE > cssH) {
          columns[c] = initColumn(cssH);
        }
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
