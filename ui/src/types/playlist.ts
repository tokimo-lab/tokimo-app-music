import { z } from "zod";
import { MusicTrackOutputSchema } from "./music-library";

// ==================== 播放列表 ====================

/** 播放列表输出 */
const PlaylistOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  coverPath: z.string().nullable().optional(),
  isPublic: z.boolean(),
  trackCount: z.number(),
  totalDuration: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlaylistOutput = z.infer<typeof PlaylistOutputSchema>;

/** 播放列表项 */
const PlaylistItemOutputSchema = z.object({
  id: z.string(),
  sortOrder: z.number(),
  addedAt: z.string(),
  track: MusicTrackOutputSchema.nullable().optional(),
});

/** 播放列表详情（含曲目列表） */
const PlaylistDetailOutputSchema = PlaylistOutputSchema.extend({
  items: z.array(PlaylistItemOutputSchema),
});
export type PlaylistDetailOutput = z.infer<typeof PlaylistDetailOutputSchema>;
