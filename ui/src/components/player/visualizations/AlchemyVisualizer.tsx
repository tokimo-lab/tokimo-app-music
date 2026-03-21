import { useEffect, useRef } from "react";
import {
  CanvasTexture,
  Color,
  Euler,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Scene as ThreeScene,
  Vector3,
  WebGLRenderer,
} from "three";
import { drawAmbient, initAmbientBubbles } from "./alchemy/ambient";
import { DEFAULT_FOV } from "./alchemy/perspective";
import { ALL_SCENES, SCENE_COUNT } from "./alchemy/registry";
import { type CameraTransition, createTransition } from "./alchemy/transitions";
import type { AlchemySceneInfo, DrawCtx } from "./alchemy/types";
import { getAudioBands } from "./alchemy/utils";

export type { AlchemySceneInfo };

// ── Constants ────────────────────────────────────────────────────────────────

const SCENE_DURATION = 900; // frames (~15s at 60fps)
const TRANSITION_FRAMES = 160; // ~2.7s camera rotation
const TRAIL_ALPHA = 0.06;
const CAM_FOV = 60;
const PLANE_DIST = 3;

// Plane height that exactly fills the viewport at PLANE_DIST
const PLANE_H = 2 * PLANE_DIST * Math.tan((CAM_FOV * Math.PI) / 180 / 2);

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
  const containerRef = useRef<HTMLDivElement>(null);
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
    const container = containerRef.current;
    if (!container) return;

    // ── Three.js setup ────────────────────────────────────────────────
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    const scene3d = new ThreeScene();
    scene3d.background = new Color(0x000000);

    const camera = new PerspectiveCamera(CAM_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, 0);

    // ── Offscreen 2D canvases for scene rendering ─────────────────────
    const bufA = document.createElement("canvas");
    const bufB = document.createElement("canvas");
    const ctxA = bufA.getContext("2d")!;
    const ctxB = bufB.getContext("2d")!;

    const texA = new CanvasTexture(bufA);
    const texB = new CanvasTexture(bufB);
    texA.minFilter = LinearFilter;
    texB.minFilter = LinearFilter;
    texA.colorSpace = SRGBColorSpace;
    texB.colorSpace = SRGBColorSpace;

    const geo = new PlaneGeometry(1, 1);
    const matA = new MeshBasicMaterial({ map: texA });
    const matB = new MeshBasicMaterial({ map: texB, visible: false });
    const meshA = new Mesh(geo, matA);
    const meshB = new Mesh(geo, matB);

    // meshA directly in front of camera at default orientation
    meshA.position.set(0, 0, -PLANE_DIST);
    scene3d.add(meshA, meshB);

    // ── State ─────────────────────────────────────────────────────────
    let raf = 0;
    let time = 0;
    let frame = 0;
    let sceneTimer = 0;
    let currentScene = Math.floor(Math.random() * SCENE_COUNT);
    let nextScene = -1;
    let fadeProgress = 0;
    let transition: CameraTransition | null = null;
    let cssW = 0;
    let cssH = 0;
    let camZ = 0;

    const startQuat = new Quaternion();
    const targetQuat = new Quaternion();
    const tmpEuler = new Euler(0, 0, 0, "YXZ");
    const tmpVec = new Vector3();

    const sceneStates = ALL_SCENES.map((s) => s.init());
    const ambientBubbles = initAmbientBubbles();

    function pickNextScene(cur: number): number {
      let n = Math.floor(Math.random() * (SCENE_COUNT - 1));
      if (n >= cur) n++;
      return n;
    }

    function syncSize() {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w === 0 || h === 0 || (w === cssW && h === cssH)) return;
      cssW = w;
      cssH = h;

      const aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);

      const pw = PLANE_H * aspect;
      meshA.scale.set(pw, PLANE_H, 1);
      meshB.scale.set(pw, PLANE_H, 1);

      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.round(w * dpr);
      const pxH = Math.round(h * dpr);
      for (const buf of [bufA, bufB]) {
        buf.width = pxW;
        buf.height = pxH;
      }
      ctxA.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(container);
    syncSize();

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

    // ── Animation loop ────────────────────────────────────────────────
    const tick = () => {
      const w = cssW;
      const h = cssH;
      if (w === 0 || h === 0) {
        raf = requestAnimationFrame(tick);
        return;
      }

      const analyser = getAnalyserRef.current();
      const audio = getAudioBands(analyser, isPlayingRef.current);

      time += 0.008 + audio.energy * 0.012;
      frame++;
      sceneTimer++;

      camZ =
        Math.sin(time * 0.5) * 30 + audio.bass * 60 + Math.sin(time * 1.3) * 15;

      const dc: DrawCtx = {
        ctx: ctxA,
        w,
        h,
        time,
        frame,
        audio,
        analyser,
        playing: isPlayingRef.current,
        cam: { z: camZ, fov: DEFAULT_FOV },
      };

      // ── Draw current scene to bufA ──────────────────────────────────
      ctxA.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA + audio.energy * 0.04})`;
      ctxA.fillRect(0, 0, w, h);
      drawSceneTo(ctxA, currentScene, w, h, dc);
      texA.needsUpdate = true;

      // ── Transition trigger ──────────────────────────────────────────
      if (nextScene < 0 && sceneTimer >= SCENE_DURATION) {
        nextScene = pickNextScene(currentScene);
        fadeProgress = 0;
        transition = createTransition();
        ctxB.clearRect(0, 0, w, h);

        // dirAngle → yaw / pitch
        const yaw = -Math.cos(transition.dirAngle) * transition.rotAngle;
        const pitch = -Math.sin(transition.dirAngle) * transition.rotAngle;

        startQuat.copy(camera.quaternion);
        tmpEuler.set(pitch, yaw, 0);
        targetQuat.setFromEuler(tmpEuler);

        // Place meshB at the target direction
        tmpVec.set(0, 0, -1).applyQuaternion(targetQuat);
        meshB.position.copy(tmpVec.multiplyScalar(PLANE_DIST));
        meshB.lookAt(0, 0, 0);
        matB.visible = true;
      }

      // ── Transition animation ────────────────────────────────────────
      if (nextScene >= 0 && transition) {
        fadeProgress++;
        const fadePct = Math.min(1, fadeProgress / TRANSITION_FRAMES);
        const eased = transition.easing(fadePct);

        // Draw next scene to bufB
        ctxB.fillStyle = `rgba(0, 0, 0, ${TRAIL_ALPHA + audio.energy * 0.04})`;
        ctxB.fillRect(0, 0, w, h);
        drawSceneTo(ctxB, nextScene, w, h, dc);
        texB.needsUpdate = true;

        // Slerp camera orientation
        camera.quaternion.slerpQuaternions(startQuat, targetQuat, eased);

        if (fadePct >= 1) {
          // Swap bufB → bufA
          ctxA.save();
          ctxA.setTransform(1, 0, 0, 1, 0, 0);
          ctxA.clearRect(0, 0, bufA.width, bufA.height);
          ctxA.drawImage(bufB, 0, 0);
          ctxA.restore();
          texA.needsUpdate = true;

          // Reset: meshA in front, camera at identity
          meshA.position.set(0, 0, -PLANE_DIST);
          meshA.quaternion.identity();
          camera.quaternion.identity();
          matB.visible = false;

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
      }

      // ── Subtle audio-reactive camera wobble ─────────────────────────
      if (transition === null) {
        camera.rotation.set(
          Math.cos(time * 0.25) * 0.01,
          Math.sin(time * 0.3) * 0.015 + audio.bass * 0.008,
          0,
        );
      }

      renderer.render(scene3d, camera);

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
      geo.dispose();
      matA.dispose();
      matB.dispose();
      texA.dispose();
      texB.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-72 w-full overflow-hidden rounded-2xl xl:h-80"
    />
  );
}
