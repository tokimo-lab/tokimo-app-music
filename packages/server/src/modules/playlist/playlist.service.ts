import type {
  CreatePlaylistInput,
  MusicTrackOutput,
  PlaylistDetailOutput,
  PlaylistItemOutput,
  PlaylistOutput,
  UpdatePlaylistInput,
} from "@acme/types";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../db/client";

// PlaylistItem has no Prisma relation to MusicTrack, so tracks are loaded separately.

interface PlaylistRecord {
  id: string;
  name: string;
  description: string | null;
  coverPath: string | null;
  isPublic: boolean;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { items: number };
}

function toPlaylistOutput(
  playlist: PlaylistRecord,
  totalDuration: number | null,
): PlaylistOutput {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description ?? null,
    coverPath: playlist.coverPath ?? null,
    isPublic: playlist.isPublic,
    trackCount: playlist._count.items,
    totalDuration,
    createdAt: playlist.createdAt.toISOString(),
    updatedAt: playlist.updatedAt.toISOString(),
  };
}

interface TrackWithRelations {
  id: string;
  albumId: string;
  title: string;
  trackNumber: number | null;
  discNumber: number | null;
  duration: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  codec: string | null;
  genre: string | null;
  album: {
    title: string;
    coverPath: string | null;
    credits: Array<{
      role: string;
      personRef: { name: string };
    }>;
  };
  files: Array<{
    id: string;
    path: string;
    filename: string;
    streamKey: string | null;
    size: bigint | null;
    mimeType: string | null;
    duration: number | null;
    isAvailable: boolean;
  }>;
}

function toMusicTrackOutput(track: TrackWithRelations): MusicTrackOutput {
  const artistCredit = track.album.credits.find(
    (c) => c.role === "artist" || c.role === "albumArtist",
  );
  const file = track.files[0] ?? null;

  return {
    id: track.id,
    albumId: track.albumId,
    albumTitle: track.album.title,
    title: track.title,
    artistName: artistCredit?.personRef.name ?? null,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    duration: track.duration,
    bitrate: track.bitrate,
    sampleRate: track.sampleRate,
    codec: track.codec,
    genre: track.genre,
    coverPath: track.album.coverPath ?? null,
    fileId: file?.id ?? null,
    file: file
      ? {
          id: file.id,
          path: file.path,
          filename: file.filename,
          streamKey: file.streamKey ?? null,
          size: file.size == null ? null : Number(file.size),
          mimeType: file.mimeType,
          duration: file.duration,
          isAvailable: file.isAvailable,
        }
      : null,
  };
}

const TRACK_INCLUDE = {
  album: {
    select: {
      title: true,
      coverPath: true,
      credits: {
        where: { role: { in: ["artist", "albumArtist"] } },
        select: {
          role: true,
          personRef: { select: { name: true } },
        },
        take: 1,
      },
    },
  },
  files: {
    select: {
      id: true,
      path: true,
      filename: true,
      streamKey: true,
      size: true,
      mimeType: true,
      duration: true,
      isAvailable: true,
    },
    take: 1,
  },
};

/** Fetch tracks by IDs and return a Map keyed by track ID */
async function loadTracksMap(
  trackIds: string[],
): Promise<Map<string, TrackWithRelations>> {
  if (trackIds.length === 0) return new Map();

  const tracks = await prisma.musicTrack.findMany({
    where: { id: { in: trackIds } },
    include: TRACK_INCLUDE,
  });

  const map = new Map<string, TrackWithRelations>();
  for (const t of tracks) {
    map.set(t.id, t as unknown as TrackWithRelations);
  }
  return map;
}

/** Compute total duration from a set of track IDs */
async function computeTotalDuration(
  trackIds: string[],
): Promise<number | null> {
  if (trackIds.length === 0) return null;

  const result = await prisma.musicTrack.aggregate({
    where: { id: { in: trackIds } },
    _sum: { duration: true },
  });

  return result._sum.duration ?? null;
}

/** Build a simple PlaylistOutput from a playlist + its items' trackIds */
async function buildPlaylistOutput(
  playlist: PlaylistRecord,
): Promise<PlaylistOutput> {
  const items = await prisma.playlistItem.findMany({
    where: { playlistId: playlist.id },
    select: { trackId: true },
  });

  const trackIds = items
    .map((i) => i.trackId)
    .filter((id): id is string => id != null);
  const totalDuration = await computeTotalDuration(trackIds);

  return toPlaylistOutput(playlist, totalDuration);
}

class PlaylistService {
  async list(userId: string): Promise<PlaylistOutput[]> {
    const playlists = await prisma.playlist.findMany({
      where: { userId },
      include: {
        _count: { select: { items: true } },
        items: { select: { trackId: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // Collect all trackIds across all playlists for a single batch query
    const allTrackIds = playlists.flatMap((p) =>
      p.items.map((i) => i.trackId).filter((id): id is string => id != null),
    );

    const durationMap = new Map<string, number>();
    if (allTrackIds.length > 0) {
      const tracks = await prisma.musicTrack.findMany({
        where: { id: { in: allTrackIds } },
        select: { id: true, duration: true },
      });
      for (const t of tracks) {
        if (t.duration != null) durationMap.set(t.id, t.duration);
      }
    }

    return playlists.map((p) => {
      const totalDuration = p.items.reduce((sum, item) => {
        if (!item.trackId) return sum;
        return sum + (durationMap.get(item.trackId) ?? 0);
      }, 0);

      return toPlaylistOutput(p, totalDuration || null);
    });
  }

  async getById(
    playlistId: string,
    userId: string,
  ): Promise<PlaylistDetailOutput> {
    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId },
      include: {
        _count: { select: { items: true } },
        items: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!playlist) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (playlist.userId !== userId && !playlist.isPublic) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const trackIds = playlist.items
      .map((i) => i.trackId)
      .filter((id): id is string => id != null);

    const tracksMap = await loadTracksMap(trackIds);

    let totalDuration = 0;
    for (const id of trackIds) {
      totalDuration += tracksMap.get(id)?.duration ?? 0;
    }

    const base = toPlaylistOutput(playlist, totalDuration || null);

    const items: PlaylistItemOutput[] = playlist.items.map((item) => {
      const track = item.trackId ? tracksMap.get(item.trackId) : undefined;
      return {
        id: item.id,
        sortOrder: item.sortOrder,
        addedAt: item.addedAt.toISOString(),
        track: track ? toMusicTrackOutput(track) : null,
      };
    });

    return { ...base, items };
  }

  async create(
    userId: string,
    input: CreatePlaylistInput,
  ): Promise<PlaylistOutput> {
    const playlist = await prisma.playlist.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
      },
      include: { _count: { select: { items: true } } },
    });

    return toPlaylistOutput(playlist, null);
  }

  async update(
    userId: string,
    input: UpdatePlaylistInput,
  ): Promise<PlaylistOutput> {
    const existing = await prisma.playlist.findFirst({
      where: { id: input.id },
    });

    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (existing.userId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const playlist = await prisma.playlist.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && {
          description: input.description,
        }),
        ...(input.coverPath !== undefined && { coverPath: input.coverPath }),
        ...(input.isPublic !== undefined && { isPublic: input.isPublic }),
        updatedAt: new Date(),
      },
      include: { _count: { select: { items: true } } },
    });

    return buildPlaylistOutput(playlist);
  }

  async delete(playlistId: string, userId: string): Promise<void> {
    const existing = await prisma.playlist.findFirst({
      where: { id: playlistId },
    });

    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (existing.userId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await prisma.playlist.delete({ where: { id: playlistId } });
  }

  async addTracks(
    playlistId: string,
    userId: string,
    trackIds: string[],
  ): Promise<void> {
    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId },
    });

    if (!playlist) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (playlist.userId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const lastItem = await prisma.playlistItem.findFirst({
      where: { playlistId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });

    let nextOrder = (lastItem?.sortOrder ?? -1) + 1;

    await prisma.playlistItem.createMany({
      data: trackIds.map((trackId) => ({
        playlistId,
        trackId,
        sortOrder: nextOrder++,
      })),
    });

    await prisma.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });
  }

  async removeItems(
    playlistId: string,
    userId: string,
    itemIds: string[],
  ): Promise<void> {
    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId },
    });

    if (!playlist) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (playlist.userId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await prisma.playlistItem.deleteMany({
      where: {
        id: { in: itemIds },
        playlistId,
      },
    });

    // Re-index sortOrder
    const remaining = await prisma.playlistItem.findMany({
      where: { playlistId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });

    await prisma.$transaction(
      remaining.map((item, index) =>
        prisma.playlistItem.update({
          where: { id: item.id },
          data: { sortOrder: index },
        }),
      ),
    );

    await prisma.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });
  }

  async reorder(
    playlistId: string,
    userId: string,
    itemIds: string[],
  ): Promise<void> {
    const playlist = await prisma.playlist.findFirst({
      where: { id: playlistId },
    });

    if (!playlist) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }
    if (playlist.userId !== userId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    await prisma.$transaction(
      itemIds.map((id, index) =>
        prisma.playlistItem.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    await prisma.playlist.update({
      where: { id: playlistId },
      data: { updatedAt: new Date() },
    });
  }
}

export const playlistService = new PlaylistService();
