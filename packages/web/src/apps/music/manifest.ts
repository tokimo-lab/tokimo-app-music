import { Music } from "lucide-react";
import type { AppManifest } from "../_framework/types";

export const manifest: AppManifest = {
  id: "music",
  name: "TokimoMusic",
  category: "system",
  fullBleed: true,
  defaultSize: { width: 1200, height: 800 },
  icon: Music,
  image: "/page-icons/music.png",
  color: "#ec4899",
  labelKey: "music",
  order: 2,
  component: () => import("./components/MusicApp"),
  menuBar: () => import("./components/MusicMenuBar"),
  views: {
    "/": () => import("./components/MusicApp"),
    "/albums/:albumId": () => import("./pages/MusicAlbumDetailPage"),
    "/artists/:personId": () => import("./pages/MusicArtistPage"),
  },
};
