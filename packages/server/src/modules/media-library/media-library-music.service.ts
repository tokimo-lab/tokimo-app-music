import { Prisma } from "@prisma/client";
import type {
  MusicAlbumDetailOutput,
  MusicAlbumOutput,
  MusicArtistDetailOutput,
  MusicArtistOutput,
  MusicTrackOutput,
} from "@tokiomo/types";
import { TRPCError } from "@trpc/server";
import { prisma } from "../../db/client";

/** Only expose coverPath if it's a safe URL (storage / http), not raw filesystem paths */
function safeCoverPath(path: string | null): string | null {
  if (!path) return null;
  if (
    path.startsWith("/storage/") ||
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("/trpc/")
  )
    return path;
  return null;
}

type MusicListOptions = {
  page?: number;
  pageSize?: number;
  sortBy?: "title" | "year" | "artist" | "addedAt";
  sortDir?: "asc" | "desc";
  genre?: string;
  search?: string;
  artistId?: string;
};

const ARTIST_ROLES = ["artist", "albumArtist"];

function buildAlbumOrderBy(
  sortBy: NonNullable<MusicListOptions["sortBy"]>,
  sortDir: NonNullable<MusicListOptions["sortDir"]>,
): Prisma.MusicAlbumOrderByWithRelationInput {
  if (sortBy === "title") return { title: sortDir };
  if (sortBy === "year") return { year: sortDir };
  return { createdAt: sortDir };
}

function buildTrackOrderBy(
  sortBy: NonNullable<MusicListOptions["sortBy"]>,
  sortDir: NonNullable<MusicListOptions["sortDir"]>,
): Prisma.MusicTrackOrderByWithRelationInput {
  if (sortBy === "title") return { title: sortDir };
  return { album: { createdAt: sortDir } };
}

// ── Converter functions ──

type AlbumWithRelations = Prisma.MusicAlbumGetPayload<{
  include: {
    tracks: true;
    credits: { include: { personRef: true } };
    _count: { select: { tracks: true } };
  };
}>;

function toAlbumOutput(album: AlbumWithRelations): MusicAlbumOutput {
  const primaryCredit = album.credits.find((c) =>
    ARTIST_ROLES.includes(c.role),
  );
  const trackDurations = album.tracks
    .map((t) => t.duration)
    .filter((d): d is number => d != null);
  const totalDuration =
    trackDurations.length > 0
      ? trackDurations.reduce((sum, d) => sum + d, 0)
      : null;
  const genres = [
    ...new Set(
      album.tracks.map((t) => t.genre).filter((g): g is string => g != null),
    ),
  ];

  return {
    id: album.id,
    libraryId: album.libraryId,
    title: album.title,
    sortTitle: album.sortTitle,
    artistName: primaryCredit?.personRef.name ?? null,
    year: album.year,
    albumType: album.albumType,
    coverPath: safeCoverPath(album.coverPath),
    trackCount: album._count.tracks,
    totalDuration,
    genres: genres.length > 0 ? genres : undefined,
    isFavorite: album.isFavorite,
    mbAlbumId: album.mbAlbumId,
    spotifyId: album.spotifyId,
    createdAt: album.createdAt!.toISOString(),
    updatedAt: album.updatedAt!.toISOString(),
  };
}

type AlbumDetailPayload = Prisma.MusicAlbumGetPayload<{
  include: {
    tracks: { include: { files: true } };
    credits: { include: { personRef: true } };
    art: true;
    _count: { select: { tracks: true } };
  };
}>;

function toAlbumDetailOutput(
  album: AlbumDetailPayload,
): MusicAlbumDetailOutput {
  const primaryCredit = album.credits.find((c) =>
    ARTIST_ROLES.includes(c.role),
  );
  const trackDurations = album.tracks
    .map((t) => t.duration)
    .filter((d): d is number => d != null);
  const totalDuration =
    trackDurations.length > 0
      ? trackDurations.reduce((sum, d) => sum + d, 0)
      : null;
  const genres = [
    ...new Set(
      album.tracks.map((t) => t.genre).filter((g): g is string => g != null),
    ),
  ];

  return {
    id: album.id,
    libraryId: album.libraryId,
    title: album.title,
    sortTitle: album.sortTitle,
    artistName: primaryCredit?.personRef.name ?? null,
    year: album.year,
    albumType: album.albumType,
    coverPath: safeCoverPath(album.coverPath),
    trackCount: album._count.tracks,
    totalDuration,
    genres: genres.length > 0 ? genres : undefined,
    isFavorite: album.isFavorite,
    mbAlbumId: album.mbAlbumId,
    spotifyId: album.spotifyId,
    overview: album.overview,
    releaseDate: album.releaseDate?.toISOString().split("T")[0] ?? null,
    totalDiscs: album.totalDiscs,
    tracks: album.tracks.map((track) => toTrackOutput(track, album)),
    credits: album.credits.map((credit) => ({
      id: credit.id,
      role: credit.role,
      character: credit.character,
      sortOrder: credit.sortOrder,
      person: {
        id: credit.personRef.id,
        name: credit.personRef.name,
        originalName: credit.personRef.originalName,
        profilePath: credit.personRef.profilePath,
      },
    })),
    createdAt: album.createdAt!.toISOString(),
    updatedAt: album.updatedAt!.toISOString(),
  };
}

type TrackWithFiles = Prisma.MusicTrackGetPayload<{
  include: { files: true };
}>;

type AlbumForTrack = {
  title: string;
  coverPath: string | null;
  credits?: Array<{
    role: string;
    personRef: { name: string };
  }>;
};

function toTrackOutput(
  track: TrackWithFiles,
  album?: AlbumForTrack,
): MusicTrackOutput {
  const firstFile = track.files[0] ?? null;
  const artistCredit = album?.credits?.find((c) =>
    ARTIST_ROLES.includes(c.role),
  );

  return {
    id: track.id,
    albumId: track.albumId,
    albumTitle: album?.title ?? null,
    title: track.title,
    artistName: artistCredit?.personRef.name ?? null,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber,
    duration: track.duration,
    bitrate: track.bitrate,
    sampleRate: track.sampleRate,
    codec: track.codec,
    genre: track.genre,
    lyricsPath: track.lyricsPath,
    coverPath: safeCoverPath(album?.coverPath ?? null),
    fileId: firstFile?.id ?? null,
    file: firstFile
      ? {
          id: firstFile.id,
          path: firstFile.path,
          filename: firstFile.filename,
          streamKey: firstFile.streamKey,
          size: firstFile.size ? Number(firstFile.size) : null,
          mimeType: firstFile.mimeType,
          duration: firstFile.duration,
          checksum: firstFile.checksum,
          videoCodec: firstFile.videoCodec,
          videoWidth: firstFile.videoWidth,
          videoHeight: firstFile.videoHeight,
          videoProfile: firstFile.videoProfile,
          hdrType: firstFile.hdrType,
          videoStreams: firstFile.videoStreams,
          audioStreams: firstFile.audioStreams,
          ffprobeRaw: firstFile.ffprobeRaw,
          isAvailable: firstFile.isAvailable,
          scannedAt: firstFile.scannedAt?.toISOString() ?? null,
          createdAt: firstFile.createdAt?.toISOString() ?? null,
          updatedAt: firstFile.updatedAt?.toISOString() ?? null,
        }
      : null,
  };
}

// ── Service class ──

export class MediaLibraryMusicService {
  async listAlbums(libraryId: string, opts: MusicListOptions = {}) {
    const {
      page = 1,
      pageSize = 50,
      sortBy = "addedAt",
      sortDir = "desc",
      genre,
      search,
      artistId,
    } = opts;

    const where: Prisma.MusicAlbumWhereInput = {
      libraryId,
      ...(search
        ? {
            title: { contains: search, mode: "insensitive" as const },
          }
        : {}),
      ...(genre
        ? {
            tracks: {
              some: {
                genre: { contains: genre, mode: "insensitive" as const },
              },
            },
          }
        : {}),
      ...(artistId
        ? {
            credits: {
              some: { personId: artistId, role: { in: ARTIST_ROLES } },
            },
          }
        : {}),
    };

    // For "artist" sort, we sort in-memory after fetch since Prisma doesn't support
    // ordering by nested relation field directly for many-to-many via credits.
    const orderBy =
      sortBy === "artist"
        ? buildAlbumOrderBy("addedAt", sortDir)
        : buildAlbumOrderBy(sortBy, sortDir);

    const [items, total] = await Promise.all([
      prisma.musicAlbum.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          tracks: true,
          credits: { include: { personRef: true } },
          _count: { select: { tracks: true } },
        },
      }),
      prisma.musicAlbum.count({ where }),
    ]);

    const mapped = items.map(toAlbumOutput);

    if (sortBy === "artist") {
      mapped.sort((a, b) => {
        const nameA = a.artistName ?? "";
        const nameB = b.artistName ?? "";
        return sortDir === "asc"
          ? nameA.localeCompare(nameB)
          : nameB.localeCompare(nameA);
      });
    }

    return { items: mapped, total, page, pageSize };
  }

  async getAlbumDetail(albumId: string): Promise<MusicAlbumDetailOutput> {
    const album = await prisma.musicAlbum.findUnique({
      where: { id: albumId },
      include: {
        tracks: {
          orderBy: [{ discNumber: "asc" }, { trackNumber: "asc" }],
          include: { files: { take: 1 } },
        },
        credits: {
          orderBy: { sortOrder: "asc" },
          include: { personRef: true },
        },
        art: true,
        _count: { select: { tracks: true } },
      },
    });

    if (!album) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
    }

    return toAlbumDetailOutput(album);
  }

  async listTracks(libraryId: string, opts: MusicListOptions = {}) {
    const {
      page = 1,
      pageSize = 50,
      sortBy = "addedAt",
      sortDir = "desc",
      search,
      genre,
    } = opts;

    const where: Prisma.MusicTrackWhereInput = {
      album: { libraryId },
      ...(search
        ? { title: { contains: search, mode: "insensitive" as const } }
        : {}),
      ...(genre
        ? { genre: { contains: genre, mode: "insensitive" as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.musicTrack.findMany({
        where,
        orderBy: buildTrackOrderBy(sortBy, sortDir),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          files: { take: 1 },
          album: {
            include: {
              credits: { include: { personRef: true } },
            },
          },
        },
      }),
      prisma.musicTrack.count({ where }),
    ]);

    return {
      items: items.map((track) => toTrackOutput(track, track.album)),
      total,
      page,
      pageSize,
    };
  }

  async listArtists(libraryId: string, opts: MusicListOptions = {}) {
    const {
      page = 1,
      pageSize = 50,
      sortBy = "addedAt",
      sortDir = "desc",
      search,
    } = opts;

    // Find distinct persons with music credits in this library
    const searchFilter: Prisma.PersonWhereInput = search
      ? { name: { contains: search, mode: "insensitive" as const } }
      : {};

    const where: Prisma.PersonWhereInput = {
      credits: {
        some: {
          role: { in: ARTIST_ROLES },
          albumRef: { libraryId },
        },
      },
      ...searchFilter,
    };

    const personOrderBy: Prisma.PersonOrderByWithRelationInput =
      sortBy === "title" ? { name: sortDir } : { createdAt: sortDir };

    const [persons, total] = await Promise.all([
      prisma.person.findMany({
        where,
        orderBy: personOrderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          credits: {
            where: {
              role: { in: ARTIST_ROLES },
              albumRef: { libraryId },
            },
            include: {
              albumRef: {
                include: { _count: { select: { tracks: true } } },
              },
            },
          },
        },
      }),
      prisma.person.count({ where }),
    ]);

    const items: MusicArtistOutput[] = persons.map((person) => {
      const albumIds = new Set<string>();
      let trackCount = 0;
      for (const credit of person.credits) {
        if (credit.albumRef) {
          albumIds.add(credit.albumRef.id);
          trackCount += credit.albumRef._count.tracks;
        }
      }
      return {
        id: person.id,
        name: person.name,
        profilePath: person.profilePath,
        albumCount: albumIds.size,
        trackCount,
      };
    });

    return { items, total, page, pageSize };
  }

  async getArtistDetail(
    personId: string,
    libraryId: string,
  ): Promise<MusicArtistDetailOutput> {
    const person = await prisma.person.findUnique({
      where: { id: personId },
    });

    if (!person) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Artist not found" });
    }

    const albums = await prisma.musicAlbum.findMany({
      where: {
        libraryId,
        credits: {
          some: { personId, role: { in: ARTIST_ROLES } },
        },
      },
      orderBy: { year: "desc" },
      include: {
        tracks: true,
        credits: { include: { personRef: true } },
        _count: { select: { tracks: true } },
      },
    });

    const albumOutputs = albums.map(toAlbumOutput);
    const totalTrackCount = albumOutputs.reduce(
      (sum, a) => sum + a.trackCount,
      0,
    );

    return {
      id: person.id,
      name: person.name,
      profilePath: person.profilePath,
      biography: person.biography,
      aliases: person.aliases.length > 0 ? person.aliases : undefined,
      albumCount: albumOutputs.length,
      trackCount: totalTrackCount,
      albums: albumOutputs,
    };
  }

  async toggleAlbumFavorite(albumId: string): Promise<{ isFavorite: boolean }> {
    const album = await prisma.musicAlbum.findUnique({
      where: { id: albumId },
      select: { isFavorite: true },
    });

    if (!album) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Album not found" });
    }

    await prisma.musicAlbum.update({
      where: { id: albumId },
      data: { isFavorite: !album.isFavorite },
    });

    return { isFavorite: !album.isFavorite };
  }

  /**
   * Get lyrics for a track. Strategy:
   * 1. If lyricsPath exists, read the .lrc file from disk
   * 2. Otherwise, fetch from LRCLIB on-demand and cache to DB
   */
  async getTrackLyrics(
    trackId: string,
  ): Promise<{ syncedLyrics: string | null; plainLyrics: string | null }> {
    const track = await prisma.musicTrack.findUnique({
      where: { id: trackId },
      select: {
        id: true,
        title: true,
        duration: true,
        lyricsPath: true,
        album: {
          select: {
            title: true,
            credits: {
              where: { role: { in: ARTIST_ROLES } },
              select: { personRef: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!track) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Track not found" });
    }

    // 1) Try reading an existing .lrc file
    if (track.lyricsPath) {
      try {
        const { readFile } = await import("node:fs/promises");
        const content = await readFile(track.lyricsPath, "utf-8");
        const isSynced = /\[\d{1,2}:\d{2}/.test(content);
        return {
          syncedLyrics: isSynced ? content : null,
          plainLyrics: isSynced ? null : content,
        };
      } catch {
        // File missing — fall through to LRCLIB
      }
    }

    // 2) Fetch on-demand from LRCLIB
    const artistName = track.album?.credits?.[0]?.personRef?.name ?? null;
    if (!artistName) {
      return { syncedLyrics: null, plainLyrics: null };
    }

    try {
      const { fetchLyrics } = await import("../../lib/lrclib-client.js");
      const result = await fetchLyrics(
        artistName,
        track.title,
        track.album?.title ?? undefined,
        track.duration ?? undefined,
      );
      if (!result) {
        return { syncedLyrics: null, plainLyrics: null };
      }

      // Cache: write .lrc next to the first audio file if possible
      const firstFile = await prisma.mediaFile.findFirst({
        where: { trackId },
        select: { path: true },
      });
      if (firstFile?.path && result.syncedLyrics) {
        try {
          const { saveLrcFile } = await import("../../lib/lrclib-client.js");
          const savedPath = await saveLrcFile(firstFile.path, result);
          if (savedPath) {
            await prisma.musicTrack.update({
              where: { id: trackId },
              data: { lyricsPath: savedPath },
            });
          }
        } catch {
          // Non-critical — caching failure is OK
        }
      }

      return {
        syncedLyrics: result.syncedLyrics,
        plainLyrics: result.plainLyrics,
      };
    } catch (err) {
      console.error("[lyrics] Failed to fetch from LRCLIB:", err);
      return { syncedLyrics: null, plainLyrics: null };
    }
  }
}

export const mediaLibraryMusicService = new MediaLibraryMusicService();
