import { curveScenes } from "./scenes-curves";
import { extCurveScenes } from "./scenes-curves-ext";
import { originalScenes } from "./scenes-original";
import { particleScenes } from "./scenes-particles";
import { particleScenes2 } from "./scenes-particles2";
import { radialFieldScenes } from "./scenes-radial-field";
import { radialFieldScenes2 } from "./scenes-radial-field2";
import type { Scene } from "./types";

/** All registered Alchemy scenes — shuffled at startup for variety */
export const ALL_SCENES: Scene[] = [
  ...originalScenes,
  ...curveScenes,
  ...extCurveScenes,
  ...particleScenes,
  ...particleScenes2,
  ...radialFieldScenes,
  ...radialFieldScenes2,
];

export const SCENE_COUNT = ALL_SCENES.length;
