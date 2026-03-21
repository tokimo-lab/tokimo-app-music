import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  Group,
  LinearFilter,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Scene as ThreeScene,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import {
  applyMorph,
  BASE_Z,
  CAM_FOV,
  LINE_FS,
  LINE_VS,
  makeGlowTexture,
  makeLineGeo,
  makePointGeo,
  POINT_FS,
  POINT_VS,
  type PointSnapshot,
  snapshotPoints,
  uploadBuffer,
} from "./alchemy/gl-utils";
import { ALL_SCENES, SCENE_COUNT } from "./alchemy/registry";
import { SceneBuffer } from "./alchemy/scene-buffer";
import { createTransition, type TransitionEffect } from "./alchemy/transitions";
import type { AlchemySceneInfo, DrawCtx } from "./alchemy/types";
import { getAudioBands } from "./alchemy/utils";

export type { AlchemySceneInfo };

// ── Constants ────────────────────────────────────────────────────────────────

const SCENE_DURATION = 900;
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

    // ── Renderer ──────────────────────────────────────────────────────
    const renderer = new WebGLRenderer({ antialias: false, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.style.display = "block";
    container.appendChild(renderer.domElement);

    // ── 3D Scene ──────────────────────────────────────────────────────
    const mainScene = new ThreeScene();
    mainScene.background = new Color(0x000000);
    const camera = new PerspectiveCamera(CAM_FOV, 1, 0.1, 200);
    camera.position.set(0, 0, 0);

    const glowTex = makeGlowTexture();

    // Materials — separate instances per group for independent opacity
    function mkPointMat() {
      return new ShaderMaterial({
        uniforms: {
          glowMap: { value: glowTex },
          uScale: { value: 300 },
          uOpacity: { value: 1 },
        },
        vertexShader: POINT_VS,
        fragmentShader: POINT_FS,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
    }
    function mkLineMat() {
      return new ShaderMaterial({
        uniforms: { uOpacity: { value: 1 } },
        vertexShader: LINE_VS,
        fragmentShader: LINE_FS,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      });
    }
    const ptMatA = mkPointMat();
    const lineMatA = mkLineMat();

    const ptGeoA = makePointGeo();
    const lineGeoA = makeLineGeo();
    const groupA = new Group();
    groupA.add(
      new Points(ptGeoA, ptMatA),
      new LineSegments(lineGeoA, lineMatA),
    );
    mainScene.add(groupA);

    // Position groupA in front of camera
    groupA.position.set(0, 0, -BASE_Z);

    // ── RTT trail effect ──────────────────────────────────────────────
    let rtW = 2;
    let rtH = 2;
    const rtA = new WebGLRenderTarget(rtW, rtH, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    const rtB = new WebGLRenderTarget(rtW, rtH, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    const trail = { read: rtA, write: rtB };

    const ortho = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new PlaneGeometry(2, 2);
    const fadeScene = new ThreeScene();
    const fadeMat = new MeshBasicMaterial({ transparent: true, opacity: 0.94 });
    fadeScene.add(new Mesh(quadGeo, fadeMat));
    const displayScene = new ThreeScene();
    const displayMat = new MeshBasicMaterial();
    displayScene.add(new Mesh(quadGeo.clone(), displayMat));

    // ── Scene buffers ─────────────────────────────────────────────────
    const bufA = new SceneBuffer();

    // ── State ─────────────────────────────────────────────────────────
    let raf = 0;
    let time = 0;
    let frame = 0;
    let sceneTimer = 0;
    let currentSceneIdx = Math.floor(Math.random() * SCENE_COUNT);
    let nextSceneIdx = -1;
    let fadeProgress = 0;
    let morphSrc: PointSnapshot | null = null;
    let transition: TransitionEffect | null = null;
    let cssW = 0;
    let cssH = 0;

    const sceneStates = ALL_SCENES.map((s) => s.init());

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
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      ptMatA.uniforms.uScale.value = h * 0.5;

      // Resize RTTs
      const dpr = renderer.getPixelRatio();
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      if (pw !== rtW || ph !== rtH) {
        rtW = pw;
        rtH = ph;
        rtA.setSize(pw, ph);
        rtB.setSize(pw, ph);
      }
    }

    const ro = new ResizeObserver(() => syncSize());
    ro.observe(container);
    syncSize();

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

      // Audio-reactive camera Z breathing
      const camZBreath =
        (Math.sin(time * 0.5) * 30 +
          audio.bass * 60 +
          Math.sin(time * 1.3) * 15) *
        0.015;

      // ── Draw scene ────────────────────────────────────────────────
      const dc: DrawCtx = {
        buf: bufA,
        w,
        h,
        time,
        frame,
        audio,
        analyser,
        playing: isPlayingRef.current,
      };
      bufA.clear();
      const drawIdx = nextSceneIdx >= 0 ? nextSceneIdx : currentSceneIdx;
      const sc = ALL_SCENES[drawIdx];
      if (sc) sc.draw({ ...dc, buf: bufA }, sceneStates[drawIdx]);
      uploadBuffer(bufA, ptGeoA, lineGeoA, h);

      // ── Point-cloud morph transition ──────────────────────────────
      let transT = 0;
      if (nextSceneIdx >= 0 && morphSrc && transition) {
        fadeProgress++;
        transT = Math.min(1, fadeProgress / transition.duration);
        applyMorph(ptGeoA, morphSrc, transT, transition.morph);
        // Lines: hidden during morph, fade in near end
        const lf = transition.lineFadeIn;
        lineMatA.uniforms.uOpacity.value =
          transT < lf ? 0 : (transT - lf) / (1 - lf);

        if (transT >= 1) {
          currentSceneIdx = nextSceneIdx;
          nextSceneIdx = -1;
          sceneTimer = 0;
          fadeProgress = 0;
          morphSrc = null;
          transition = null;
          lineMatA.uniforms.uOpacity.value = 1;
          transT = 0;
        }
      }

      // ── Transition trigger ────────────────────────────────────────
      if (nextSceneIdx < 0 && sceneTimer >= SCENE_DURATION) {
        nextSceneIdx = pickNextScene(currentSceneIdx);
        fadeProgress = 0;
        morphSrc = snapshotPoints(ptGeoA);
        transition = createTransition();
      }

      // ── Camera wobble + Z breathing + transition effects ──────────
      const env = transition && transT > 0 ? Math.sin(transT * Math.PI) : 0;
      camera.rotation.set(
        Math.cos(time * 0.25) * 0.01 + (transition?.camRotX ?? 0) * env,
        Math.sin(time * 0.3) * 0.015 +
          audio.bass * 0.008 +
          (transition?.camRotY ?? 0) * env,
        0,
      );
      camera.position.set(0, 0, -camZBreath + (transition?.camPush ?? 0) * env);

      // ── RTT trail composite ───────────────────────────────────────
      const trailFade = 1 - (TRAIL_ALPHA + audio.energy * 0.04);

      // 1) Fade previous frame
      fadeMat.map = trail.read.texture;
      fadeMat.opacity = trailFade;
      renderer.setRenderTarget(trail.write);
      renderer.clear();
      renderer.render(fadeScene, ortho);

      // 2) Draw 3D scene on top (additive)
      renderer.autoClear = false;
      renderer.render(mainScene, camera);
      renderer.autoClear = true;

      // 3) Display to screen
      displayMat.map = trail.write.texture;
      renderer.setRenderTarget(null);
      renderer.clear();
      renderer.render(displayScene, ortho);

      // 4) Swap
      const tmp = trail.read;
      trail.read = trail.write;
      trail.write = tmp;

      // ── Scene info callback ───────────────────────────────────────
      onSceneInfoRef.current?.({
        scene: ALL_SCENES[currentSceneIdx]?.name ?? "?",
        nextScene:
          nextSceneIdx >= 0 ? (ALL_SCENES[nextSceneIdx]?.name ?? "?") : null,
        fadePct:
          nextSceneIdx >= 0
            ? Math.min(1, fadeProgress / (transition?.duration ?? 75))
            : 0,
        sceneTimer,
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ptGeoA.dispose();
      lineGeoA.dispose();
      ptMatA.dispose();
      lineMatA.dispose();
      glowTex.dispose();
      fadeMat.dispose();
      displayMat.dispose();
      quadGeo.dispose();
      rtA.dispose();
      rtB.dispose();
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
