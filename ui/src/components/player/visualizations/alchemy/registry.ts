import { curveScenes } from "./scenes-curves";
import { originalScenes } from "./scenes-original";
import { particleScenes } from "./scenes-particles";
import { particleScenes2 } from "./scenes-particles2";
import { radialFieldScenes } from "./scenes-radial-field";
import type { Scene } from "./types";

/** All registered Alchemy scenes — shuffled at startup for variety */
export const ALL_SCENES: Scene[] = [
  ...originalScenes,
  ...curveScenes,
  ...particleScenes,
  ...particleScenes2,
  ...radialFieldScenes,
];

export const SCENE_COUNT = ALL_SCENES.length;
