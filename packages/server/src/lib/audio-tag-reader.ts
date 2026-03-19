/**
 * 音频标签读取器
 * 使用 music-metadata 解析 ID3v2/Vorbis Comments/MP4 Atoms 等音频标签
 */

import * as mm from "music-metadata";

/** 音频标签信息 */
export interface AudioTagInfo {
  title?: string;
  artist?: string;
  albumArtist?: string;
  album?: string;
  trackNumber?: number;
  discNumber?: number;
  totalTracks?: number;
  totalDiscs?: number;
  year?: number;
  genre?: string;
  duration?: number; // 秒
  bitrate?: number;
  sampleRate?: number;
  codec?: string; // FLAC, MP3, AAC 等
  hasCoverArt: boolean;
  coverArt?: { data: Buffer; format: string };
  /** MusicBrainz Picard 写入的标签 */
  mbTrackId?: string;
  mbAlbumId?: string;
  mbArtistId?: string;
}

/**
 * 读取音频文件标签信息
 * @param filePath 音频文件完整路径
 * @returns 解析出的标签信息，损坏文件返回 partial 结果
 */
export const readAudioTags = async (
  filePath: string,
): Promise<AudioTagInfo> => {
  try {
    const metadata = await mm.parseFile(filePath);
    const { common, format } = metadata;

    // 提取封面
    let coverArt: AudioTagInfo["coverArt"] | undefined;
    const pic = common.picture?.[0];
    if (pic) {
      coverArt = {
        data: Buffer.from(pic.data),
        format: pic.format, // e.g. "image/jpeg"
      };
    }

    return {
      title: common.title || undefined,
      artist: common.artist || undefined,
      albumArtist: common.albumartist || undefined,
      album: common.album || undefined,
      trackNumber: common.track?.no ?? undefined,
      discNumber: common.disk?.no ?? undefined,
      totalTracks: common.track?.of ?? undefined,
      totalDiscs: common.disk?.of ?? undefined,
      year: common.year || undefined,
      genre: common.genre?.[0] || undefined,
      duration: format.duration ? Math.round(format.duration) : undefined,
      bitrate: format.bitrate ? Math.round(format.bitrate / 1000) : undefined,
      sampleRate: format.sampleRate || undefined,
      codec: format.codec || undefined,
      hasCoverArt: !!pic,
      coverArt,
      mbTrackId: common.musicbrainz_recordingid || undefined,
      mbAlbumId: common.musicbrainz_albumid || undefined,
      mbArtistId: common.musicbrainz_artistid?.[0] || undefined,
    };
  } catch (error) {
    // 损坏/不支持的文件 → 返回最小信息
    console.error(`[audio-tag-reader] Failed to parse ${filePath}:`, error);
    return { hasCoverArt: false };
  }
};
