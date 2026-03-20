import { z } from "zod";
import { MusicTrackOutputSchema } from "./music-library";

// ==================== 播放列表 ====================

/** 播放列表输出 */
export const PlaylistOutputSchema = z.object({
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
export const PlaylistItemOutputSchema = z.object({
  id: z.string(),
  sortOrder: z.number(),
  addedAt: z.string(),
  track: MusicTrackOutputSchema.nullable().optional(),
});
export type PlaylistItemOutput = z.infer<typeof PlaylistItemOutputSchema>;

/** 播放列表详情（含曲目列表） */
export const PlaylistDetailOutputSchema = PlaylistOutputSchema.extend({
  items: z.array(PlaylistItemOutputSchema),
});
export type PlaylistDetailOutput = z.infer<typeof PlaylistDetailOutputSchema>;

// ==================== 输入 ====================

export const CreatePlaylistInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export type CreatePlaylistInput = z.infer<typeof CreatePlaylistInputSchema>;

export const UpdatePlaylistInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  coverPath: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
});
export type UpdatePlaylistInput = z.infer<typeof UpdatePlaylistInputSchema>;

export const AddToPlaylistInputSchema = z.object({
  playlistId: z.string(),
  trackIds: z.array(z.string()).min(1),
});
export type AddToPlaylistInput = z.infer<typeof AddToPlaylistInputSchema>;

export const RemoveFromPlaylistInputSchema = z.object({
  playlistId: z.string(),
  itemIds: z.array(z.string()).min(1),
});
export type RemoveFromPlaylistInput = z.infer<
  typeof RemoveFromPlaylistInputSchema
>;

export const ReorderPlaylistInputSchema = z.object({
  playlistId: z.string(),
  itemIds: z.array(z.string()),
});
export type ReorderPlaylistInput = z.infer<typeof ReorderPlaylistInputSchema>;
