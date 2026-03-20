/**
 * 音乐库同步逻辑 — 处理音频文件的标签读取、专辑分组、数据库写入。
 */
import * as fsNode from "node:fs/promises";
import * as nodePath from "node:path";
import { prisma } from "../../db/client";
import type { AudioTagInfo } from "../../lib/audio-tag-reader";
import { readAudioTags } from "../../lib/audio-tag-reader";
import { logger } from "../../lib/logger";
import { parseMusicFilename } from "../../lib/media-parser";
import type { AudioFileInfo } from "./media-library-file-walker";
import type { SyncProgressUpdate } from "./media-library-sync.service";

// ==================== Constants ====================

const AUDIO_MIME_TYPES: Record<string, string> = {
  ".flac": "audio/flac",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".wma": "audio/x-ms-wma",
  ".ape": "audio/x-ape",
  ".alac": "audio/mp4",
  ".dsf": "audio/dsf",
  ".dff": "audio/dff",
  ".aiff": "audio/aiff",
  ".aif": "audio/aiff",
};

const COVER_ART_NAMES = [
  "cover.jpg",
  "cover.png",
  "folder.jpg",
  "folder.png",
  "front.jpg",
  "front.png",
  "album.jpg",
  "album.png",
];

// ==================== Types ====================

interface CollectedAudioFile extends AudioFileInfo {
  sourceId: string;
  tags: AudioTagInfo | null;
}

interface AlbumGroup {
  artistName: string;
  albumTitle: string;
  year: number | null;
  dirPath: string;
  files: CollectedAudioFile[];
}

// ==================== Helpers ====================

function getAudioMimeType(filePath: string): string {
  const ext = nodePath.extname(filePath).toLowerCase();
  return AUDIO_MIME_TYPES[ext] ?? "audio/unknown";
}

async function findLocalCoverArt(dirPath: string): Promise<string | null> {
  for (const name of COVER_ART_NAMES) {
    const coverPath = nodePath.join(dirPath, name);
    try {
      await fsNode.access(coverPath);
      return coverPath;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function getAlbumInfo(file: CollectedAudioFile): {
  artistName: string;
  albumTitle: string;
  year: number | null;
} {
  const { tags } = file;
  if (tags?.album) {
    return {
      artistName: tags.albumArtist || tags.artist || "Unknown Artist",
      albumTitle: tags.album,
      year: tags.year ?? null,
    };
  }
  const parsed = parseMusicFilename(
    nodePath.basename(file.filePath),
    file.dirPath.split(/[\\/]/).pop(),
  );
  const dirName = file.dirPath.split(/[\\/]/).pop() || "Unknown Album";
  return {
    artistName: parsed.artist || tags?.artist || "Unknown Artist",
    albumTitle: parsed.album || dirName,
    year: tags?.year ?? null,
  };
}

function groupFilesIntoAlbums(files: CollectedAudioFile[]): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>();
  for (const file of files) {
    const info = getAlbumInfo(file);
    const key = `${info.artistName.toLowerCase()}||${info.albumTitle.toLowerCase()}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        artistName: info.artistName,
        albumTitle: info.albumTitle,
        year: info.year,
        dirPath: file.dirPath,
        files: [],
      };
      groups.set(key, group);
    }
    group.files.push(file);
    if (!group.year && info.year) group.year = info.year;
  }
  return Array.from(groups.values());
}

// ==================== DB Operations ====================

async function findOrCreatePerson(name: string): Promise<string> {
  const existing = await prisma.person.findFirst({
    where: { name },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.person.create({
    data: { name },
    select: { id: true },
  });
  return created.id;
}

async function findOrCreateAlbum(
  libraryId: string,
  group: AlbumGroup,
): Promise<string> {
  const candidates = await prisma.musicAlbum.findMany({
    where: { libraryId, title: group.albumTitle },
    select: {
      id: true,
      credits: {
        select: { personRef: { select: { name: true } } },
      },
    },
  });
  // Match by artist name via credits
  for (const c of candidates) {
    const match = c.credits.some(
      (cr) =>
        cr.personRef.name.toLowerCase() === group.artistName.toLowerCase(),
    );
    if (match) return c.id;
  }

  const maxDisc = Math.max(
    ...group.files.map((f) => f.tags?.discNumber ?? 1),
    1,
  );
  const album = await prisma.musicAlbum.create({
    data: {
      libraryId,
      title: group.albumTitle,
      sortTitle: group.albumTitle.replace(/^(the|a|an)\s+/i, ""),
      year: group.year,
      totalTracks: group.files.length,
      totalDiscs: maxDisc,
    },
    select: { id: true },
  });
  return album.id;
}

async function ensureArtistCredit(
  albumId: string,
  personId: string,
): Promise<void> {
  const existing = await prisma.mediaCredit.findFirst({
    where: { personId, albumId, role: "artist" },
    select: { id: true },
  });
  if (existing) return;
  await prisma.mediaCredit.create({
    data: { personId, albumId, role: "artist" },
  });
}

async function upsertTrack(
  albumId: string,
  file: CollectedAudioFile,
): Promise<string> {
  const { tags } = file;
  const parsed = parseMusicFilename(
    nodePath.basename(file.filePath),
    file.dirPath.split(/[\\/]/).pop(),
  );

  const trackTitle =
    tags?.title ||
    parsed.trackTitle ||
    nodePath.basename(file.filePath, nodePath.extname(file.filePath));
  const trackNumber = tags?.trackNumber ?? parsed.trackNumber ?? null;
  const discNumber = tags?.discNumber ?? null;

  const existing = await prisma.musicTrack.findFirst({
    where: {
      albumId,
      title: trackTitle,
      ...(trackNumber != null ? { trackNumber } : {}),
      ...(discNumber != null ? { discNumber } : {}),
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.musicTrack.update({
      where: { id: existing.id },
      data: {
        ...(tags?.discNumber != null ? { discNumber: tags.discNumber } : {}),
        ...(tags?.duration != null ? { duration: tags.duration } : {}),
        ...(tags?.genre ? { genre: tags.genre } : {}),
        ...(tags?.bitrate != null ? { bitrate: tags.bitrate } : {}),
        ...(tags?.sampleRate != null ? { sampleRate: tags.sampleRate } : {}),
        ...(tags?.codec ? { codec: tags.codec } : {}),
      },
    });
    return existing.id;
  }

  // Check mbTrackId uniqueness before creating
  let safeMbTrackId: string | null = null;
  if (tags?.mbTrackId) {
    const conflict = await prisma.musicTrack.findUnique({
      where: { mbTrackId: tags.mbTrackId },
      select: { id: true },
    });
    if (!conflict) safeMbTrackId = tags.mbTrackId;
  }

  const track = await prisma.musicTrack.create({
    data: {
      albumId,
      title: trackTitle,
      trackNumber,
      discNumber,
      duration: tags?.duration ?? null,
      genre: tags?.genre ?? null,
      bitrate: tags?.bitrate ?? null,
      sampleRate: tags?.sampleRate ?? null,
      codec: tags?.codec ?? null,
      mbTrackId: safeMbTrackId,
    },
    select: { id: true },
  });
  return track.id;
}

async function upsertMediaFile(
  file: CollectedAudioFile,
  trackId: string,
): Promise<void> {
  const checksum = `${file.fileSize}:${file.mtime}`;
  const existing = await prisma.mediaFile.findFirst({
    where: { sourceId: file.sourceId, path: file.filePath },
    select: { id: true, checksum: true, trackId: true },
  });

  if (existing) {
    if (existing.checksum === checksum && existing.trackId === trackId) return;
    await prisma.mediaFile.update({
      where: { id: existing.id },
      data: {
        checksum,
        trackId,
        size: BigInt(file.fileSize),
        mimeType: getAudioMimeType(file.filePath),
        duration: file.tags?.duration ?? null,
        filename: nodePath.basename(file.filePath),
        scannedAt: new Date(),
        updatedAt: new Date(),
      },
    });
    return;
  }

  await prisma.mediaFile.create({
    data: {
      sourceId: file.sourceId,
      path: file.filePath,
      filename: nodePath.basename(file.filePath),
      size: BigInt(file.fileSize),
      mimeType: getAudioMimeType(file.filePath),
      duration: file.tags?.duration ?? null,
      checksum,
      trackId,
      scannedAt: new Date(),
    },
  });
}

async function updateAlbumMetadata(
  albumId: string,
  group: AlbumGroup,
  isLocal: boolean,
): Promise<void> {
  const maxDisc = Math.max(
    ...group.files.map((f) => f.tags?.discNumber ?? 1),
    1,
  );
  const mbAlbumId = group.files.find((f) => f.tags?.mbAlbumId)?.tags?.mbAlbumId;

  // Check mbAlbumId uniqueness
  let safeMbAlbumId: string | undefined;
  if (mbAlbumId) {
    const conflict = await prisma.musicAlbum.findUnique({
      where: { mbAlbumId },
      select: { id: true },
    });
    if (!conflict || conflict.id === albumId) safeMbAlbumId = mbAlbumId;
  }

  await prisma.musicAlbum.update({
    where: { id: albumId },
    data: {
      totalTracks: group.files.length,
      totalDiscs: maxDisc,
      ...(group.year != null ? { year: group.year } : {}),
      ...(safeMbAlbumId ? { mbAlbumId: safeMbAlbumId } : {}),
      ...(!isLocal ? { metadata: { needsTagRead: true } } : {}),
      updatedAt: new Date(),
    },
  });

  if (isLocal) {
    const coverPath = await findLocalCoverArt(group.dirPath);
    if (coverPath) {
      await prisma.musicAlbum.update({
        where: { id: albumId },
        data: { coverPath },
      });
    }
  }
}

async function processAlbumGroup(
  libraryId: string,
  group: AlbumGroup,
  isLocal: boolean,
): Promise<void> {
  const albumId = await findOrCreateAlbum(libraryId, group);
  const personId = await findOrCreatePerson(group.artistName);
  await ensureArtistCredit(albumId, personId);

  for (const file of group.files) {
    try {
      const trackId = await upsertTrack(albumId, file);
      await upsertMediaFile(file, trackId);
    } catch (error) {
      logger.error(
        "LibrarySync",
        `曲目处理失败 "${nodePath.basename(file.filePath)}": ${error}`,
      );
    }
  }

  await updateAlbumMetadata(albumId, group, isLocal);
}

// ==================== Public API ====================

/**
 * 处理本地音频文件：读取标签 → 分组专辑 → 写入数据库
 */
export async function processLocalAudioFiles(
  libraryId: string,
  sourceId: string,
  files: AudioFileInfo[],
  onProgress: (update: SyncProgressUpdate) => Promise<void>,
): Promise<number> {
  const collected: CollectedAudioFile[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const checksum = `${file.fileSize}:${file.mtime}`;
    const existing = await prisma.mediaFile.findFirst({
      where: { sourceId, path: file.filePath, trackId: { not: null } },
      select: { id: true, checksum: true },
    });
    if (existing?.checksum === checksum) continue;

    let tags: AudioTagInfo | null = null;
    try {
      tags = await readAudioTags(file.filePath);
    } catch (error) {
      logger.warn("LibrarySync", `音频标签读取失败 ${file.filePath}: ${error}`);
    }
    collected.push({ ...file, sourceId, tags });

    if ((i + 1) % 100 === 0) {
      await onProgress({
        message: `正在读取音频标签... (${i + 1}/${files.length})`,
        progress: Math.round(((i + 1) / files.length) * 30),
        totalItems: files.length,
        syncedItems: i + 1,
      });
    }
  }

  if (collected.length === 0) return 0;

  const albumGroups = groupFilesIntoAlbums(collected);
  logger.log(
    "LibrarySync",
    `本地音频分组: ${collected.length} 个文件 → ${albumGroups.length} 个专辑`,
  );

  for (let i = 0; i < albumGroups.length; i++) {
    try {
      await processAlbumGroup(libraryId, albumGroups[i], true);
    } catch (error) {
      logger.error(
        "LibrarySync",
        `专辑处理失败 "${albumGroups[i].albumTitle}" by "${albumGroups[i].artistName}": ${error}`,
      );
    }
    if ((i + 1) % 10 === 0 || i === albumGroups.length - 1) {
      await onProgress({
        message: `正在同步专辑... (${i + 1}/${albumGroups.length})`,
        progress: 30 + Math.round(((i + 1) / albumGroups.length) * 50),
        totalItems: albumGroups.length,
        syncedItems: i + 1,
      });
    }
  }

  return collected.length;
}

/**
 * 处理远端音频文件：按文件名解析 → 分组专辑 → 写入数据库
 */
export async function processRemoteAudioFiles(
  libraryId: string,
  sourceId: string,
  files: AudioFileInfo[],
  onProgress: (update: SyncProgressUpdate) => Promise<void>,
): Promise<number> {
  const collected: CollectedAudioFile[] = [];

  for (const file of files) {
    const checksum = `${file.fileSize}:${file.mtime}`;
    const existing = await prisma.mediaFile.findFirst({
      where: { sourceId, path: file.filePath, trackId: { not: null } },
      select: { id: true, checksum: true },
    });
    if (existing?.checksum === checksum) continue;
    collected.push({ ...file, sourceId, tags: null });
  }

  if (collected.length === 0) return 0;

  const albumGroups = groupFilesIntoAlbums(collected);
  logger.log(
    "LibrarySync",
    `远端音频分组: ${collected.length} 个文件 → ${albumGroups.length} 个专辑`,
  );

  for (let i = 0; i < albumGroups.length; i++) {
    try {
      await processAlbumGroup(libraryId, albumGroups[i], false);
    } catch (error) {
      logger.error(
        "LibrarySync",
        `远端专辑处理失败 "${albumGroups[i].albumTitle}": ${error}`,
      );
    }
    if ((i + 1) % 10 === 0 || i === albumGroups.length - 1) {
      await onProgress({
        message: `正在同步远端专辑... (${i + 1}/${albumGroups.length})`,
        progress: 30 + Math.round(((i + 1) / albumGroups.length) * 50),
        totalItems: albumGroups.length,
        syncedItems: i + 1,
      });
    }
  }

  return collected.length;
}
