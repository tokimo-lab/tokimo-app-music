import type { AppManifest } from "../_framework/types";

export const manifest: AppManifest = {
  id: "music",
  name: "Music Library",
  category: "library",
  supportedTypes: ["music", "audiobook", "podcast"],
  defaultSize: { width: 1200, height: 800 },
  component: () => import("./pages/MusicAppPage"),
};
