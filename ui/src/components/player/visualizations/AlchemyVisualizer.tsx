import { useEffect, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Euler,
  Group,
  LinearFilter,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  Scene as ThreeScene,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { ALL_SCENES, SCENE_COUNT } from "./alchemy/registry";
import { SceneBuffer } from "./alchemy/scene-buffer";
import { type CameraTransition, createTransition } from "./alchemy/transitions";
import type { AlchemySceneInfo, DrawCtx } from "./alchemy/types";
import { getAudioBands } from "./alchemy/utils";

export type { AlchemySceneInfo };

// ── Constants ────────────────────────────────────────────────────────────────

const SCENE_DURATION = 900;
const TRANSITION_FRAMES = 160;
const TRAIL_ALPHA = 0.06;
const CAM_FOV = 60;
const BASE_Z = 10;
const MAX_DEPTH = 1200;
const DEPTH_RANGE = 8;
const MAX_PTS = 4000;
const MAX_SEGS = 8000;

function makeGlowTexture(size = 64): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const center = size / 2;
  const grad = g.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.15, "rgba(255,255,255,0.8)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.3)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(c);
  tex.minFilter = NearestFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const POINT_VS = `
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
uniform float uScale;
uniform float uOpacity;
void main() {
  vColor = aColor * vec4(1.0, 1.0, 1.0, uOpacity);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = max(1.0, aSize * (uScale / -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FS = `
uniform sampler2D glowMap;
varying vec4 vColor;
void main() {
  vec4 t = texture2D(glowMap, gl_PointCoord);
  gl_FragColor = vColor * t;
  if (gl_FragColor.a < 0.005) discard;
}`;

const LINE_VS = `
attribute vec4 aColor;
varying vec4 vColor;
uniform float uOpacity;
void main() {
  vColor = aColor * vec4(1.0, 1.0, 1.0, uOpacity);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LINE_FS = `
varying vec4 vColor;
void main() {
  gl_FragColor = vColor;
  if (gl_FragColor.a < 0.005) discard;
}`;

// ── Geometry builders ─────────────────────────────────────────────────────────

function makePointGeo() {
  const geo = new BufferGeometry();
  geo.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(MAX_PTS * 3), 3),
  );
  geo.setAttribute(
    "aColor",
    new BufferAttribute(new Float32Array(MAX_PTS * 4), 4),
  );
  geo.setAttribute("aSize", new BufferAttribute(new Float32Array(MAX_PTS), 1));
  geo.setDrawRange(0, 0);
  return geo;
}

function makeLineGeo() {
  const geo = new BufferGeometry();
  const v = MAX_SEGS * 2;
  geo.setAttribute("position", new BufferAttribute(new Float32Array(v * 3), 3));
  geo.setAttribute("aColor", new BufferAttribute(new Float32Array(v * 4), 4));
  geo.setDrawRange(0, 0);
  return geo;
}

// ── Upload SceneBuffer → GPU ─────────────────────────────────────────────────

function uploadBuffer(
  buf: SceneBuffer,
  ptGeo: BufferGeometry,
  lineGeo: BufferGeometry,
  h: number,
) {
  const ps = (2 * BASE_Z * Math.tan((CAM_FOV * Math.PI) / 360)) / h;
  const ds = DEPTH_RANGE / MAX_DEPTH;
  const ss = (2 * BASE_Z) / h;
  const pp = ptGeo.attributes.position as BufferAttribute;
  const pc = ptGeo.attributes.aColor as BufferAttribute;
  const pz = ptGeo.attributes.aSize as BufferAttribute;
  for (let i = 0; i < buf.ptN; i++) {
    const si = i * 8;
    pp.array[i * 3] = buf.pts[si] * ps;
    pp.array[i * 3 + 1] = -buf.pts[si + 1] * ps;
    pp.array[i * 3 + 2] = -buf.pts[si + 2] * ds;
    pc.array[i * 4] = buf.pts[si + 3];
    pc.array[i * 4 + 1] = buf.pts[si + 4];
    pc.array[i * 4 + 2] = buf.pts[si + 5];
    pc.array[i * 4 + 3] = buf.pts[si + 6];
    pz.array[i] = buf.pts[si + 7] * ss;
  }
  ptGeo.setDrawRange(0, buf.ptN);
  pp.needsUpdate = pc.needsUpdate = pz.needsUpdate = true;

  const lp = lineGeo.attributes.position as BufferAttribute;
  const lc = lineGeo.attributes.aColor as BufferAttribute;
  for (let i = 0; i < buf.segN; i++) {
    const si = i * 14;
    for (let v = 0; v < 2; v++) {
      const vi = i * 2 + v,
        so = si + v * 7;
      lp.array[vi * 3] = buf.segs[so] * ps;
      lp.array[vi * 3 + 1] = -buf.segs[so + 1] * ps;
      lp.array[vi * 3 + 2] = -buf.segs[so + 2] * ds;
      lc.array[vi * 4] = buf.segs[so + 3];
      lc.array[vi * 4 + 1] = buf.segs[so + 4];
      lc.array[vi * 4 + 2] = buf.segs[so + 5];
      lc.array[vi * 4 + 3] = buf.segs[so + 6];
    }
  }
  lineGeo.setDrawRange(0, buf.segN * 2);
  lp.needsUpdate = true;
  lc.needsUpdate = true;
}

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
    const ptMatB = mkPointMat();
    const lineMatA = mkLineMat();
    const lineMatB = mkLineMat();

    // Two groups that alternate roles (current / next)
    const ptGeoA = makePointGeo();
    const lineGeoA = makeLineGeo();
    const ptGeoB = makePointGeo();
    const lineGeoB = makeLineGeo();
    const groupA = new Group();
    const groupB = new Group();
    groupA.add(
      new Points(ptGeoA, ptMatA),
      new LineSegments(lineGeoA, lineMatA),
    );
    groupB.add(
      new Points(ptGeoB, ptMatB),
      new LineSegments(lineGeoB, lineMatB),
    );
    groupB.visible = false;
    mainScene.add(groupA, groupB);

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
    const bufB = new SceneBuffer();

    // ── State ─────────────────────────────────────────────────────────
    let raf = 0;
    let time = 0;
    let frame = 0;
    let sceneTimer = 0;
    let currentSceneIdx = Math.floor(Math.random() * SCENE_COUNT);
    let nextSceneIdx = -1;
    let fadeProgress = 0;
    let transition: CameraTransition | null = null;
    let cssW = 0;
    let cssH = 0;

    // Camera tracking — accumulates across transitions
    const cameraQuat = new Quaternion();
    const startQuat = new Quaternion();
    const targetQuat = new Quaternion();
    const wobbleQuat = new Quaternion();
    const wobbleEuler = new Euler(0, 0, 0, "YXZ");
    const tmpEuler = new Euler(0, 0, 0, "YXZ");
    const tmpVec = new Vector3();

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
      ptMatB.uniforms.uScale.value = h * 0.5;

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

      // ── Draw current scene to bufA ────────────────────────────────
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
      const scA = ALL_SCENES[currentSceneIdx];
      if (scA) scA.draw({ ...dc, buf: bufA }, sceneStates[currentSceneIdx]);
      uploadBuffer(bufA, ptGeoA, lineGeoA, h);

      // ── Transition trigger ────────────────────────────────────────
      if (nextSceneIdx < 0 && sceneTimer >= SCENE_DURATION) {
        nextSceneIdx = pickNextScene(currentSceneIdx);
        fadeProgress = 0;
        transition = createTransition();

        startQuat.copy(cameraQuat);
        const yaw = -Math.cos(transition.dirAngle) * transition.rotAngle;
        const pitch = -Math.sin(transition.dirAngle) * transition.rotAngle;
        tmpEuler.set(pitch, yaw, 0);
        targetQuat
          .copy(startQuat)
          .multiply(new Quaternion().setFromEuler(tmpEuler));

        // Place groupB at target direction
        tmpVec.set(0, 0, -1).applyQuaternion(targetQuat);
        groupB.position.copy(tmpVec.multiplyScalar(BASE_Z));
        groupB.visible = true;
      }

      // ── Transition animation ──────────────────────────────────────
      if (nextSceneIdx >= 0 && transition) {
        fadeProgress++;
        const fadePct = Math.min(1, fadeProgress / TRANSITION_FRAMES);
        const eased = transition.easing(fadePct);

        // Draw next scene to bufB
        bufB.clear();
        const scB = ALL_SCENES[nextSceneIdx];
        if (scB) scB.draw({ ...dc, buf: bufB }, sceneStates[nextSceneIdx]);
        uploadBuffer(bufB, ptGeoB, lineGeoB, h);

        // Slerp camera
        cameraQuat.slerpQuaternions(startQuat, targetQuat, eased);

        // Fade out old scene via uniform
        const fadeOutAlpha = Math.max(0, 1 - fadePct * 1.5);
        ptMatA.uniforms.uOpacity.value = fadeOutAlpha;
        lineMatA.uniforms.uOpacity.value = fadeOutAlpha;

        if (fadePct >= 1) {
          // Transition complete — swap groups
          currentSceneIdx = nextSceneIdx;
          nextSceneIdx = -1;
          sceneTimer = 0;
          fadeProgress = 0;
          transition = null;

          // Move groupA to where groupB is (the new forward direction)
          groupA.position.copy(groupB.position);
          groupB.visible = false;

          // Copy bufB data into ptGeoA / lineGeoA
          uploadBuffer(bufB, ptGeoA, lineGeoA, h);

          // Restore opacity
          ptMatA.uniforms.uOpacity.value = 1;
          lineMatA.uniforms.uOpacity.value = 1;
        }
      }

      // ── Camera: base quat + wobble + Z breathing ──────────────────
      wobbleEuler.set(
        Math.cos(time * 0.25) * 0.01,
        Math.sin(time * 0.3) * 0.015 + audio.bass * 0.008,
        0,
      );
      wobbleQuat.setFromEuler(wobbleEuler);
      camera.quaternion.multiplyQuaternions(cameraQuat, wobbleQuat);
      // Z breathing: push camera slightly forward from origin
      tmpVec.set(0, 0, -1).applyQuaternion(cameraQuat);
      camera.position.copy(tmpVec.multiplyScalar(camZBreath));

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
          nextSceneIdx >= 0 ? Math.min(1, fadeProgress / TRANSITION_FRAMES) : 0,
        sceneTimer,
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ptGeoA.dispose();
      ptGeoB.dispose();
      lineGeoA.dispose();
      lineGeoB.dispose();
      ptMatA.dispose();
      ptMatB.dispose();
      lineMatA.dispose();
      lineMatB.dispose();
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
