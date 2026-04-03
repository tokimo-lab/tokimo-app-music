import { useEffect, useRef } from "react";

const RING_COUNT = 18;
const BASE_VERTICES = 36;
const MORPH_DURATION = 600; // frames (~10s at 60fps)
const BASE_TUNNEL_SPEED = 0.005;
const BASS_BURST_FRAMES = 10;
const BASS_THRESHOLD = 0.6;
const SMOOTH_ALPHA = 0.2;

// Effect modes
const EFFECT_CLOUD = 0;
const EFFECT_SPIRAL = 1;
const _EFFECT_CRYSTAL = 2;
const EFFECT_COUNT = 3;

interface EffectParams {
  vertexCount: number;
  lineWidth: number;
  opacityMult: number;
  twistPerRing: number;
  blurriness: number;
  deformStrength: number;
}

const EFFECT_PRESETS: EffectParams[] = [
  // Cloud/Fog
  {
    vertexCount: 24,
    lineWidth: 3,
    opacityMult: 0.5,
    twistPerRing: 0,
    blurriness: 4,
    deformStrength: 0.25,
  },
  // Spiral
  {
    vertexCount: BASE_VERTICES,
    lineWidth: 1.5,
    opacityMult: 0.8,
    twistPerRing: 0.15,
    blurriness: 0,
    deformStrength: 0.3,
  },
  // Crystal
  {
    vertexCount: 7,
    lineWidth: 1.8,
    opacityMult: 1.0,
    twistPerRing: 0,
    blurriness: 0,
    deformStrength: 0.15,
  },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpParams(a: EffectParams, b: EffectParams, t: number): EffectParams {
  return {
    vertexCount: Math.round(lerp(a.vertexCount, b.vertexCount, t)),
    lineWidth: lerp(a.lineWidth, b.lineWidth, t),
    opacityMult: lerp(a.opacityMult, b.opacityMult, t),
    twistPerRing: lerp(a.twistPerRing, b.twistPerRing, t),
    blurriness: lerp(a.blurriness, b.blurriness, t),
    deformStrength: lerp(a.deformStrength, b.deformStrength, t),
  };
}

export function TunnelVisualizer({
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
  const smoothedRef = useRef<Float32Array | null>(null);

  // Ring depth values (0=far/center, 1=near/edge)
  const ringDepthsRef = useRef<Float32Array>(new Float32Array(RING_COUNT));
  // Random seed per ring for variation
  const ringSeedsRef = useRef<Float32Array>(new Float32Array(RING_COUNT));

  // Morphing state
  const morphFrameRef = useRef(0);
  const currentEffectRef = useRef(EFFECT_SPIRAL);
  const nextEffectRef = useRef(EFFECT_CLOUD);

  // Bass burst
  const bassBurstRef = useRef(0);
  const totalEnergyRef = useRef(0);
  const bassEnergyRef = useRef(0);

  // Wisp particles for cloud mode
  const wispsRef = useRef<
    {
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      maxLife: number;
    }[]
  >([]);

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

    // Initialize ring depths evenly spaced
    const depths = ringDepthsRef.current;
    const seeds = ringSeedsRef.current;
    for (let i = 0; i < RING_COUNT; i++) {
      depths[i] = i / RING_COUNT;
      seeds[i] = Math.random() * Math.PI * 2;
    }

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
      const analyser = getAnalyserRef.current();
      const freqBinCount = analyser ? analyser.frequencyBinCount : 128;

      if (!dataRef.current || dataRef.current.length !== freqBinCount) {
        dataRef.current = new Uint8Array(
          freqBinCount,
        ) as Uint8Array<ArrayBuffer>;
      }
      if (!smoothedRef.current || smoothedRef.current.length !== freqBinCount) {
        smoothedRef.current = new Float32Array(freqBinCount);
      }

      const data = dataRef.current;
      const smoothed = smoothedRef.current;

      let totalEnergy = 0;
      let bassEnergy = 0;
      const bassEnd = Math.floor(freqBinCount / 6);

      if (analyser && isPlayingRef.current) {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < freqBinCount; i++) {
          const raw = data[i] / 255;
          smoothed[i] += (raw - smoothed[i]) * SMOOTH_ALPHA;
          totalEnergy += smoothed[i];
          if (i < bassEnd) bassEnergy += smoothed[i];
        }
        totalEnergy /= freqBinCount;
        bassEnergy = bassEnd > 0 ? bassEnergy / bassEnd : 0;
      } else {
        for (let i = 0; i < freqBinCount; i++) {
          smoothed[i] *= 0.94;
          totalEnergy += smoothed[i];
          if (i < bassEnd) bassEnergy += smoothed[i];
        }
        totalEnergy /= freqBinCount;
        bassEnergy = bassEnd > 0 ? bassEnergy / bassEnd : 0;
      }

      totalEnergyRef.current += (totalEnergy - totalEnergyRef.current) * 0.15;
      bassEnergyRef.current += (bassEnergy - bassEnergyRef.current) * 0.15;

      // Bass burst detection
      if (bassEnergyRef.current > BASS_THRESHOLD && bassBurstRef.current <= 0) {
        bassBurstRef.current = BASS_BURST_FRAMES;
      }
      if (bassBurstRef.current > 0) bassBurstRef.current--;

      // Morphing
      if (isPlayingRef.current) {
        morphFrameRef.current++;
      }
      const morphT = morphFrameRef.current / MORPH_DURATION;
      // Cosine interpolation: 0→1→0 over one full cycle
      const morphPhase = (1 - Math.cos(morphT * Math.PI * 2)) / 2;

      if (morphFrameRef.current >= MORPH_DURATION) {
        morphFrameRef.current = 0;
        currentEffectRef.current = nextEffectRef.current;
        // Pick a different random effect
        let next: number;
        do {
          next = Math.floor(Math.random() * EFFECT_COUNT);
        } while (next === currentEffectRef.current);
        nextEffectRef.current = next;
      }

      const params = lerpParams(
        EFFECT_PRESETS[currentEffectRef.current],
        EFFECT_PRESETS[nextEffectRef.current],
        morphPhase,
      );

      // Tunnel speed
      const burstMult = bassBurstRef.current > 0 ? 1.5 : 1.0;
      const speedMult = isPlayingRef.current
        ? (1.0 + totalEnergyRef.current * 2.0) * burstMult
        : 0.15;
      const tunnelSpeed = BASE_TUNNEL_SPEED * speedMult;

      // Advance ring depths
      for (let i = 0; i < RING_COUNT; i++) {
        depths[i] += tunnelSpeed;
        if (depths[i] > 1.0) {
          depths[i] -= 1.0;
          seeds[i] = Math.random() * Math.PI * 2;
        }
      }

      // Bass breathing
      const breathScale = 1 + bassEnergyRef.current * 0.08;

      ctx.clearRect(0, 0, cssW, cssH);

      const cx = cssW / 2;
      const cy = cssH / 2;
      const maxRadius = Math.min(cssW, cssH) * 0.48;
      const [r, g, bl] = hexToRgb(accentColorRef.current);

      // Sort rings by depth (far first, near on top)
      const sortedIndices: number[] = [];
      for (let i = 0; i < RING_COUNT; i++) sortedIndices.push(i);
      sortedIndices.sort((a, b) => depths[a] - depths[b]);

      // Cloud wisps
      const wisps = wispsRef.current;
      const isCloudish = params.blurriness > 1;
      if (isCloudish && isPlayingRef.current && wisps.length < 15) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * maxRadius * 0.6;
        wisps.push({
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          life: 0,
          maxLife: 80 + Math.random() * 60,
        });
      }

      // Draw wisps behind rings
      if (wisps.length > 0) {
        for (let i = wisps.length - 1; i >= 0; i--) {
          const w = wisps[i];
          w.x += w.vx;
          w.y += w.vy;
          w.life++;
          if (w.life >= w.maxLife) {
            wisps.splice(i, 1);
            continue;
          }
          const fadeIn = Math.min(w.life / 15, 1);
          const fadeOut = 1 - w.life / w.maxLife;
          const alpha = fadeIn * fadeOut * 0.1 * params.blurriness * 0.25;
          ctx.beginPath();
          ctx.moveTo(w.x - 15, w.y);
          ctx.bezierCurveTo(
            w.x - 5,
            w.y - 10,
            w.x + 5,
            w.y + 10,
            w.x + 15,
            w.y,
          );
          ctx.strokeStyle = `rgba(${r},${g},${bl},${Math.min(alpha, 0.15)})`;
          ctx.lineWidth = 2 + params.blurriness * 0.5;
          ctx.stroke();
        }
      }

      // Draw rings
      const vertexCount = params.vertexCount;

      // For crystal mode: store ring vertices for connecting lines
      const ringVertices: { x: number; y: number }[][] = [];

      for (const ri of sortedIndices) {
        const depth = depths[ri]; // 0=far, 1=near
        const ringRadius = maxRadius * (1 - (1 - depth) ** 1.5) * breathScale;
        if (ringRadius < 2) continue;

        const nearness = depth;
        const opacity = (0.08 + nearness * 0.72) * params.opacityMult;
        const lw = lerp(0.5, params.lineWidth, nearness);
        const twist = params.twistPerRing * ri;
        const seed = seeds[ri];

        const vertices: { x: number; y: number }[] = [];

        for (let v = 0; v < vertexCount; v++) {
          const angle = (v / vertexCount) * Math.PI * 2 + twist;

          // Audio deformation: map angle to frequency bin
          const freqIdx =
            Math.floor(
              ((angle + Math.PI) / (Math.PI * 2)) * (freqBinCount - 1),
            ) % freqBinCount;
          const amp = smoothed[Math.abs(freqIdx)];

          const deformation =
            amp * params.deformStrength * ringRadius +
            Math.sin(angle * 3 + seed) * ringRadius * 0.04;

          const finalR = ringRadius + deformation;
          vertices.push({
            x: cx + Math.cos(angle) * finalR,
            y: cy + Math.sin(angle) * finalR,
          });
        }

        ringVertices.push(vertices);

        // Apply blur for cloud mode
        ctx.save();
        if (params.blurriness > 0.5) {
          ctx.filter = `blur(${params.blurriness * nearness}px)`;
        }

        // Draw ring polygon
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let v = 1; v < vertices.length; v++) {
          ctx.lineTo(vertices[v].x, vertices[v].y);
        }
        ctx.closePath();

        ctx.strokeStyle = `rgba(${r},${g},${bl},${Math.min(opacity, 0.85)})`;
        ctx.lineWidth = lw;
        ctx.stroke();

        // Subtle fill for near rings
        if (nearness > 0.7) {
          const fillAlpha = (nearness - 0.7) * 0.08 * params.opacityMult;
          ctx.fillStyle = `rgba(${r},${g},${bl},${fillAlpha})`;
          ctx.fill();
        }

        ctx.restore();
      }

      // Crystal connecting lines between adjacent rings
      if (params.vertexCount <= 10 && ringVertices.length > 1) {
        ctx.save();
        for (let ri = 0; ri < ringVertices.length - 1; ri++) {
          const curr = ringVertices[ri];
          const next = ringVertices[ri + 1];
          const minVerts = Math.min(curr.length, next.length);
          const step = Math.max(1, Math.floor(minVerts / 7));
          for (let v = 0; v < minVerts; v += step) {
            ctx.beginPath();
            ctx.moveTo(curr[v].x, curr[v].y);
            ctx.lineTo(next[v].x, next[v].y);
            ctx.strokeStyle = "rgba(255,255,255,0.12)";
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
        ctx.restore();
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
