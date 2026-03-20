// Shared types for Alchemy visualizer scenes

export interface AudioBands {
  bass: number;
  mid: number;
  high: number;
  energy: number;
}

/** Context passed to every scene draw call */
export interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  time: number;
  frame: number;
  audio: AudioBands;
  analyser: AnalyserNode | null;
  playing: boolean;
}

/** A registered scene */
export interface Scene {
  name: string;
  init: () => unknown;
  draw: (dc: DrawCtx, state: unknown) => void;
}

export type AlchemySceneInfo = {
  scene: string;
  nextScene: string | null;
  fadePct: number;
  sceneTimer: number;
};
