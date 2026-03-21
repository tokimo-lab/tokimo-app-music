import { useEffect, useRef } from "react";
import { drawAmbient, initAmbientBubbles } from "./alchemy/ambient";
import { DEFAULT_FOV } from "./alchemy/perspective";
import { ALL_SCENES, SCENE_COUNT } from "./alchemy/registry";
import {
  type CameraTransition,
  compositeBuffer,
  createTransition,
  getTransitionOffsets,
} from "./alchemy/transitions";
import type { AlchemySceneInfo, DrawCtx } from "./alchemy/types";
import { getAudioBands } from "./alchemy/utils";

export type { AlchemySceneInfo };

// ── Constants ────────────────────────────────────────────────────────────────

const SCENE_DURATION = 900; // frames (~15s at 60fps)
const TRANSITION_FRAMES = 160; // ~2.7s camera movement
const TRAIL_ALPHA = 0.06;

// ── Main component ───────────────────────────────────────────────────────────

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
    let transition: CameraTransition | null = null;
    let bufW = 0;
    let bufH = 0;
    let camZ = 0;

    const sceneStates = ALL_SCENES.map((s) => s.init());
    const ambientBubbles = initAmbientBubbles();

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
      sceneIdx: number,
      w: number,
      h: number,
      dc: DrawCtx,
    ) {
      if (ambientBgRef.current) {
        drawAmbient(target, w, h, frame, dc.audio, ambientBubbles);
      }
      const scene = ALL_SCENES[sceneIdx];
      if (scene) {
        scene.draw({ ...dc, ctx: target }, sceneStates[sceneIdx]);
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

      // Audio-reactive camera — gentle z-breathing + bass punch
      camZ =
        Math.sin(time * 0.5) * 30 + audio.bass * 60 + Math.sin(time * 1.3) * 15;

      const dc: DrawCtx = {
        ctx,
        w,
        h,
        time,
        frame,
        audio,
        analyser,
        playing: isPlayingRef.current,
        cam: { z: camZ, fov: DEFAULT_FOV },
      };

      if (nextScene < 0 && sceneTimer >= SCENE_DURATION) {
        nextScene = pickNextScene(currentScene);
        fadeProgress = 0;
        transition = createTransition();
        ctxB.clearRect(0, 0, w, h);
      }

      ctx.clearRect(0, 0, w, h);

      if (nextScene >= 0 && transition) {
        fadeProgress++;
        const fadePct = Math.min(1, fadeProgress / TRANSITION_FRAMES);
        const eased = transition.easing(fadePct);

        // Draw both scenes to their respective buffers
        ctxA.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA + audio.energy * 0.04})`;
        ctxA.fillRect(0, 0, w, h);
        drawSceneTo(ctxA, currentScene, w, h, dc);

        ctxB.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA + audio.energy * 0.04})`;
        ctxB.fillRect(0, 0, w, h);
        drawSceneTo(ctxB, nextScene, w, h, dc);

        // Composite with camera-movement transforms
        const off = getTransitionOffsets(transition.dir, eased, w, h);
        compositeBuffer(
          ctx,
          bufA,
          w,
          h,
          off.oldDx,
          off.oldDy,
          off.oldScale,
          off.oldAlpha,
        );
        compositeBuffer(
          ctx,
          bufB,
          w,
          h,
          off.newDx,
          off.newDy,
          off.newScale,
          off.newAlpha,
        );

        if (fadePct >= 1) {
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
          transition = null;
        }
      } else {
        ctxA.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA + audio.energy * 0.04})`;
        ctxA.fillRect(0, 0, w, h);
        drawSceneTo(ctxA, currentScene, w, h, dc);
        ctx.drawImage(bufA, 0, 0, w, h);
      }

      onSceneInfoRef.current?.({
        scene: ALL_SCENES[currentScene]?.name ?? "?",
        nextScene: nextScene >= 0 ? (ALL_SCENES[nextScene]?.name ?? "?") : null,
        fadePct:
          nextScene >= 0 ? Math.min(1, fadeProgress / TRANSITION_FRAMES) : 0,
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
