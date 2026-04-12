import { Music } from "lucide-react";
import type { AppManifest } from "../_framework/types";

export const manifest: AppManifest = {
  id: "music",
  category: "system",
  fullBleed: true,
  defaultSize: { width: 1200, height: 800 },
  icon: Music,
  image: "/page-icons/music.png",
  color: "#ec4899",
  appName: "dashboard.menu.music",
  order: 2,
  component: () => import("./components/MusicApp"),
  menuBar: () => import("./components/MusicMenuBar"),
  views: {
    "/": () => import("./components/MusicApp"),
    "/albums/:albumId": () => import("./pages/MusicAlbumDetailPage"),
    "/artists/:personId": () => import("./pages/MusicArtistPage"),
  },

  userSettings: {
    order: 11,
    libraryDomain: "music",
    sections: [
      {
        key: "sidebar",
        label: "settings.sidebar.title",
        preferenceScope: { scope: "component", scopeId: "music" },
        fields: [
          {
            key: "sidebarCollapsed",
            type: "boolean",
            label: "settings.sidebar.defaultCollapsed",
            defaultValue: false,
          },
        ],
      },
      {
        key: "display",
        label: "settings.library.display",
        fields: [
          {
            key: "defaultSort",
            type: "select",
            label: "settings.library.defaultSort",
            defaultValue: "addedAt",
            options: [
              { label: "settings.library.sortAddedAt", value: "addedAt" },
              { label: "settings.library.sortTitleAsc", value: "title_asc" },
              { label: "settings.library.sortYearDesc", value: "year_desc" },
            ],
          },
        ],
      },
    ],
  },
};
