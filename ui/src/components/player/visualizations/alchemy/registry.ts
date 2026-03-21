import { audioScenes } from "./scenes-audio";
import { curveScenes } from "./scenes-curves";
import { extCurveScenes } from "./scenes-curves-ext";
import { geometricScenes } from "./scenes-geometric";
import { organicScenes } from "./scenes-organic";
import { originalScenes } from "./scenes-original";
import { particleScenes } from "./scenes-particles";
import { particleScenes2 } from "./scenes-particles2";
import { radialFieldScenes } from "./scenes-radial-field";
import { radialFieldScenes2 } from "./scenes-radial-field2";
import { spatialScenes } from "./scenes-spatial";
import { waveScenes } from "./scenes-wave";
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
  ...geometricScenes,
  ...waveScenes,
  ...organicScenes,
  ...spatialScenes,
  ...audioScenes,
];

export const SCENE_COUNT = ALL_SCENES.length;
