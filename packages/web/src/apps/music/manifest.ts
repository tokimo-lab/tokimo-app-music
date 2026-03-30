import type { SettingsSectionDef } from "@/lib/settings-defs";
import type { AppManifest } from "../_framework/types";

function audioLibrarySettings(): SettingsSectionDef[] {
  return [
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
            { label: "settings.library.sortTitleDesc", value: "title_desc" },
            { label: "settings.library.sortYearDesc", value: "year_desc" },
            { label: "settings.library.sortYearAsc", value: "year_asc" },
          ],
        },
      ],
    },
  ];
}

export const manifest: AppManifest = {
  id: "music",
  name: "Music Library",
  category: "page",
  supportedTypes: ["music", "audiobook", "podcast"],
  defaultSize: { width: 1200, height: 800 },
  component: () => import("./pages/MusicAppPage"),

  settings: audioLibrarySettings(),
  settingsByType: {
    music: [
      ...audioLibrarySettings(),
      {
        key: "playback",
        label: "settings.music.playback",
        fields: [
          {
            key: "crossfade",
            type: "slider",
            label: "settings.music.crossfade",
            description: "settings.music.crossfadeDesc",
            defaultValue: 0,
            min: 0,
            max: 12,
            step: 1,
          },
          {
            key: "gapless",
            type: "boolean",
            label: "settings.music.gapless",
            defaultValue: true,
          },
        ],
      },
    ],
  },
};
