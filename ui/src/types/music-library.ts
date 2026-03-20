import { z } from "zod";
import { CreditOutputSchema, MediaFileOutputSchema } from "./media-library";

// ==================== 音乐专辑输出 ====================

/** 专辑列表输出（供 listAlbums 使用） */
export const MusicAlbumOutputSchema = z.object({
  id: z.string(),
  libraryId: z.string(),
  title: z.string(),
  sortTitle: z.string().nullable().optional(),
  artistName: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  albumType: z.string().nullable().optional(),
  coverPath: z.string().nullable().optional(),
  trackCount: z.number(),
  totalDuration: z.number().nullable().optional(),
  genres: z.array(z.string()).optional(),
  isFavorite: z.boolean(),
  mbAlbumId: z.string().nullable().optional(),
  spotifyId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MusicAlbumOutput = z.infer<typeof MusicAlbumOutputSchema>;

// ==================== 音乐曲目输出 ====================

/** 曲目输出 */
export const MusicTrackOutputSchema = z.object({
  id: z.string(),
  albumId: z.string(),
  albumTitle: z.string().nullable().optional(),
  title: z.string(),
  artistName: z.string().nullable().optional(),
  trackNumber: z.number().nullable().optional(),
  discNumber: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  bitrate: z.number().nullable().optional(),
  sampleRate: z.number().nullable().optional(),
  codec: z.string().nullable().optional(),
  genre: z.string().nullable().optional(),
  lyricsPath: z.string().nullable().optional(),
  coverPath: z.string().nullable().optional(),
  fileId: z.string().nullable().optional(),
  file: MediaFileOutputSchema.nullable().optional(),
});
export type MusicTrackOutput = z.infer<typeof MusicTrackOutputSchema>;

// ==================== 专辑详情输出 ====================

/** 专辑详情（含曲目、演职人员、流派） */
export const MusicAlbumDetailOutputSchema = MusicAlbumOutputSchema.extend({
  overview: z.string().nullable().optional(),
  releaseDate: z.string().nullable().optional(),
  totalDiscs: z.number().nullable().optional(),
  tracks: z.array(MusicTrackOutputSchema).optional(),
  credits: z.array(CreditOutputSchema).optional(),
});
export type MusicAlbumDetailOutput = z.infer<
  typeof MusicAlbumDetailOutputSchema
>;

// ==================== 艺术家输出 ====================

/** 艺术家列表输出（从 MediaCredit + Person 聚合） */
export const MusicArtistOutputSchema = z.object({
  id: z.string(),
  name: z.string(),
  profilePath: z.string().nullable().optional(),
  albumCount: z.number(),
  trackCount: z.number(),
});
export type MusicArtistOutput = z.infer<typeof MusicArtistOutputSchema>;

/** 艺术家详情 */
export const MusicArtistDetailOutputSchema = MusicArtistOutputSchema.extend({
  biography: z.string().nullable().optional(),
  aliases: z.array(z.string()).optional(),
  albums: z.array(MusicAlbumOutputSchema).optional(),
});
export type MusicArtistDetailOutput = z.infer<
  typeof MusicArtistDetailOutputSchema
>;

// ==================== 歌词输出 ====================

/** 歌词查询结果 */
export const TrackLyricsOutputSchema = z.object({
  syncedLyrics: z.string().nullable(),
  plainLyrics: z.string().nullable(),
});
export type TrackLyricsOutput = z.infer<typeof TrackLyricsOutputSchema>;

// ==================== 查询输入 ====================

/** 音乐列表查询输入 */
export const ListMusicInputSchema = z.object({
  libraryId: z.string(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(200).default(50),
  sortBy: z
    .enum(["title", "year", "artist", "addedAt"])
    .optional()
    .default("addedAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  genre: z.string().optional(),
  search: z.string().optional(),
  artistId: z.string().optional(),
});
export type ListMusicInput = z.infer<typeof ListMusicInputSchema>;
