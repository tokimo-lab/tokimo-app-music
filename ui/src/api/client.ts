import {
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
  useMutation,
  useQuery,
} from "@tanstack/react-query";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

type QueryOptions<T> = Omit<
  UseQueryOptions<T, Error, T, QueryKey>,
  "queryKey" | "queryFn"
>;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, credentials: "include" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const json = (await r.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error ?? "API request failed");
  }
  return json.data as T;
}

async function vfsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, { ...init, credentials: "include" });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const json = (await r.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new Error(json.error ?? "API request failed");
  }
  return json.data as T;
}

const API_BASE = "/api/apps/music";

export interface VfsDto {
  id: string;
  name: string;
  type: string;
}

interface MusicSource {
  sourceId: string;
  rootPath: string;
  sortOrder?: number;
  isDefaultDownload?: boolean;
  sourceName?: string;
  sourceType?: string;
}

interface LibraryDto {
  id: string;
  userId?: string | null;
  name: string;
  type?: string;
  avatar?: unknown;
  description?: string | null;
  sources?: MusicSource[];
  rootPath: string;
  sourceId?: string | null;
  sourceType?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface TrackDto {
  id: string;
  libraryId?: string | null;
  filePath: string;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  durationSecs?: number | null;
  sizeBytes?: number | null;
  mime?: string | null;
  albumId?: string | null;
  artistId?: string | null;
  genreId?: string | null;
  lyricsText?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AlbumDto {
  id: string;
  libraryId?: string | null;
  name: string;
  artist?: string | null;
  year?: number | null;
  coverUrl?: string | null;
  isFavorite: boolean;
  trackCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ArtistDto {
  id: string;
  libraryId?: string | null;
  name: string;
  bio?: string | null;
  photoUrl?: string | null;
  albumCount?: number;
  trackCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface GenreDto {
  id: string;
  name: string;
  trackCount: number;
}

interface SyncStatusDto {
  libraryId: string;
  status: string;
  progress?: unknown;
}

interface RawPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size?: number;
  pageSize?: number;
}

export interface MusicOutput {
  id: string;
  name: string;
  type?: string;
  avatar?: unknown;
  description?: string | null;
  sources?: MusicSource[];
  storageBindingId?: string | null;
  rootPath: string;
  sourceId?: string | null;
  sourceType?: string | null;
  itemCount: number;
  syncStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MusicTrackOutput {
  id: string;
  musicId: string;
  libraryId?: string | null;
  title: string;
  artistName?: string;
  albumTitle?: string;
  albumId?: string;
  artistId?: string;
  duration: number;
  durationSecs?: number | null;
  coverPath?: string | null;
  posterId?: string | null;
  filePath: string;
  fileId?: string;
  file?: { id: string };
  fileSize: number;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  year?: number;
  track?: number;
  trackNumber?: number;
  disc?: number;
  discNumber?: number;
  genre?: string;
  createdAt: string;
}

export interface MusicAlbumOutput {
  id: string;
  musicId: string;
  libraryId?: string | null;
  title: string;
  artistName?: string;
  artistId?: string;
  year?: number;
  coverPath?: string | null;
  posterId?: string | null;
  isFavorite: boolean;
  trackCount: number;
  totalDuration?: number;
  albumType?: string;
  overview?: string;
  scrapedAt?: string | null;
  tracks?: MusicTrackOutput[];
  credits?: import("../lib/types").CreditOutput[];
  genres?: string[];
  createdAt: string;
}

export interface MusicArtistOutput {
  id: string;
  musicId: string;
  libraryId?: string | null;
  name: string;
  originalName?: string;
  aliases?: string[];
  biography?: string;
  bio?: string | null;
  birthday?: string;
  birthplace?: string;
  profilePath?: string | null;
  posterId?: string | null;
  albumCount: number;
  trackCount: number;
  albums?: MusicAlbumOutput[];
  createdAt: string;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TrackLyricsOutput {
  trackId?: string;
  text?: string | null;
  syncedLyrics?: string | null;
  plainLyrics?: string | null;
}

function toLibrary(dto: LibraryDto, sync?: SyncStatusDto): MusicOutput {
  const sources =
    dto.sources && dto.sources.length > 0
      ? dto.sources
      : dto.sourceId || dto.rootPath
        ? [
            {
              sourceId: dto.sourceId ?? "",
              rootPath: dto.rootPath,
              sourceName: undefined,
              sourceType: dto.sourceType ?? undefined,
            },
          ]
        : undefined;

  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    avatar: dto.avatar,
    description: dto.description,
    sources,
    storageBindingId: dto.sourceId,
    rootPath: dto.rootPath,
    sourceId: dto.sourceId,
    sourceType: dto.sourceType,
    itemCount: 0,
    syncStatus: sync?.status,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function toTrack(dto: TrackDto): MusicTrackOutput {
  return {
    id: dto.id,
    musicId: dto.libraryId ?? "",
    libraryId: dto.libraryId,
    title: dto.title ?? "未知曲目",
    artistName: dto.artist ?? undefined,
    albumTitle: dto.album ?? undefined,
    albumId: dto.albumId ?? undefined,
    artistId: dto.artistId ?? undefined,
    duration: dto.durationSecs ?? 0,
    durationSecs: dto.durationSecs,
    coverPath: null,
    filePath: dto.filePath,
    fileId: dto.id,
    file: { id: dto.id },
    fileSize: dto.sizeBytes ?? 0,
    codec: dto.mime ?? undefined,
    genre: dto.genreId ?? undefined,
    createdAt: dto.createdAt,
  };
}

function toAlbum(dto: AlbumDto): MusicAlbumOutput {
  return {
    id: dto.id,
    musicId: dto.libraryId ?? "",
    libraryId: dto.libraryId,
    title: dto.name,
    artistName: dto.artist ?? undefined,
    year: dto.year ?? undefined,
    coverPath: dto.coverUrl ?? null,
    posterId: dto.coverUrl ?? null,
    isFavorite: dto.isFavorite,
    trackCount: dto.trackCount,
    scrapedAt: dto.coverUrl ? dto.updatedAt : null,
    createdAt: dto.createdAt,
  };
}

function toArtist(
  dto: ArtistDto,
  albums?: MusicAlbumOutput[],
): MusicArtistOutput {
  return {
    id: dto.id,
    musicId: dto.libraryId ?? "",
    libraryId: dto.libraryId,
    name: dto.name,
    biography: dto.bio ?? undefined,
    bio: dto.bio,
    profilePath: dto.photoUrl ?? null,
    posterId: dto.photoUrl ?? null,
    albumCount: dto.albumCount ?? albums?.length ?? 0,
    trackCount: dto.trackCount ?? 0,
    albums,
    createdAt: dto.createdAt,
  };
}

function toPage<TIn, TOut>(
  page: RawPage<TIn>,
  map: (item: TIn) => TOut,
): PagedResult<TOut> {
  return {
    items: page.items.map(map),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize ?? page.page_size ?? page.items.length,
  };
}

function paramsToSearch(
  params: Record<string, string | number | boolean | undefined>,
) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) sp.set(key, String(value));
  }
  const text = sp.toString();
  return text ? `?${text}` : "";
}

function invalidate(qc: QueryClient, key: QueryKey) {
  return qc.invalidateQueries({ queryKey: key });
}

export const api = {
  vfs: {
    list: {
      useQuery: (options?: QueryOptions<VfsDto[]>) =>
        useQuery<VfsDto[]>({
          queryKey: ["vfs", "list"],
          queryFn: () => vfsFetch<VfsDto[]>("/api/vfs"),
          ...options,
        }),
    },
  },
  music: {
    list: {
      useQuery: (options?: QueryOptions<MusicOutput[]>) =>
        useQuery<MusicOutput[]>({
          queryKey: ["music", "list"],
          queryFn: async () => {
            const [libraries, statuses] = await Promise.all([
              apiFetch<LibraryDto[]>(API_BASE),
              apiFetch<SyncStatusDto[]>(`${API_BASE}/sync-statuses`).catch(
                () => [] as SyncStatusDto[],
              ),
            ]);
            const statusById = new Map(statuses.map((s) => [s.libraryId, s]));
            return libraries.map((lib) =>
              toLibrary(lib, statusById.get(lib.id)),
            );
          },
          ...options,
        }),
      invalidate: (qc: QueryClient) => invalidate(qc, ["music", "list"]),
    },
    listAlbums: {
      useQuery: (
        params: {
          id: string;
          page: number;
          pageSize: number;
          sortBy?: string;
          sortDir?: string;
          genre?: string;
          search?: string;
          favorite?: boolean;
        },
        options?: QueryOptions<PagedResult<MusicAlbumOutput>>,
      ) =>
        useQuery<PagedResult<MusicAlbumOutput>>({
          queryKey: ["music", "albums", params],
          queryFn: () =>
            apiFetch<RawPage<AlbumDto>>(
              `${API_BASE}/${params.id}/albums${paramsToSearch({
                page: params.page,
                page_size: params.pageSize,
              })}`,
            ).then((page) => toPage(page, toAlbum)),
          ...options,
        }),
      invalidate: (qc: QueryClient, params?: { id?: string }) =>
        invalidate(
          qc,
          params?.id ? ["music", "albums", params.id] : ["music", "albums"],
        ),
    },
    listArtists: {
      useQuery: (
        params: {
          id: string;
          page: number;
          pageSize: number;
          search?: string;
          sortBy?: string;
          sortDir?: string;
        },
        options?: QueryOptions<PagedResult<MusicArtistOutput>>,
      ) =>
        useQuery<PagedResult<MusicArtistOutput>>({
          queryKey: ["music", "artists", params],
          queryFn: () =>
            apiFetch<RawPage<ArtistDto>>(
              `${API_BASE}/${params.id}/artists${paramsToSearch({
                page: params.page,
                page_size: params.pageSize,
              })}`,
            ).then((page) => toPage(page, (artist) => toArtist(artist))),
          ...options,
        }),
      invalidate: (qc: QueryClient, params?: { id?: string }) =>
        invalidate(
          qc,
          params?.id ? ["music", "artists", params.id] : ["music", "artists"],
        ),
    },
    listTracks: {
      useQuery: (
        params: {
          id: string;
          page: number;
          pageSize: number;
          genre?: string;
          search?: string;
          sortBy?: string;
          sortDir?: string;
        },
        options?: QueryOptions<PagedResult<MusicTrackOutput>>,
      ) =>
        useQuery<PagedResult<MusicTrackOutput>>({
          queryKey: ["music", "tracks", params],
          queryFn: () =>
            apiFetch<RawPage<TrackDto>>(
              `${API_BASE}/${params.id}/tracks${paramsToSearch({
                page: params.page,
                page_size: params.pageSize,
              })}`,
            ).then((page) => toPage(page, toTrack)),
          ...options,
        }),
      invalidate: (qc: QueryClient, params?: { id?: string }) =>
        invalidate(
          qc,
          params?.id ? ["music", "tracks", params.id] : ["music", "tracks"],
        ),
    },
    listGenres: {
      useQuery: (params: { id: string }, options?: QueryOptions<string[]>) =>
        useQuery<string[]>({
          queryKey: ["music", "genres", params.id],
          queryFn: () =>
            apiFetch<RawPage<GenreDto>>(
              `${API_BASE}/${params.id}/genres?page=1&page_size=200`,
            ).then((page) => page.items.map((genre) => genre.name)),
          ...options,
        }),
    },
    getAlbumDetail: {
      useQuery: (
        params: { id: string },
        options?: QueryOptions<MusicAlbumOutput>,
      ) =>
        useQuery<MusicAlbumOutput>({
          queryKey: ["music", "album", params.id],
          queryFn: async () => {
            const detail = await apiFetch<{
              album: AlbumDto;
              tracks: TrackDto[];
            }>(`${API_BASE}/album/${params.id}`);
            return {
              ...toAlbum(detail.album),
              tracks: detail.tracks.map(toTrack),
              totalDuration: detail.tracks.reduce(
                (sum, track) => sum + (track.durationSecs ?? 0),
                0,
              ),
              credits: detail.album.artist
                ? [
                    {
                      id: `${detail.album.id}-artist`,
                      role: "artist",
                      person: {
                        id: detail.album.id,
                        name: detail.album.artist,
                      },
                    },
                  ]
                : [],
              genres: [],
            };
          },
          ...options,
        }),
      invalidate: (qc: QueryClient, params: { id: string }) =>
        invalidate(qc, ["music", "album", params.id]),
    },
    getArtistDetail: {
      useQuery: (
        params: { id: string; musicId?: string },
        options?: QueryOptions<MusicArtistOutput>,
      ) =>
        useQuery<MusicArtistOutput>({
          queryKey: ["music", "artist", params.id],
          queryFn: async () => {
            const detail = await apiFetch<{
              artist: ArtistDto;
              albums: AlbumDto[];
            }>(`${API_BASE}/artist/${params.id}`);
            const albums = detail.albums.map(toAlbum);
            return toArtist(detail.artist, albums);
          },
          ...options,
        }),
    },
    getTrackLyrics: {
      useQuery: (
        params: { id: string },
        options?: QueryOptions<TrackLyricsOutput>,
      ) =>
        useQuery<TrackLyricsOutput>({
          queryKey: ["music", "track-lyrics", params.id],
          queryFn: () =>
            apiFetch<TrackLyricsOutput>(
              `${API_BASE}/track/${params.id}/lyrics`,
            ),
          ...options,
        }),
    },
    toggleAlbumFavorite: {
      useMutation: (
        options?: UseMutationOptions<{ isFavorite: boolean }, Error, string>,
      ) =>
        useMutation<{ isFavorite: boolean }, Error, string>({
          mutationFn: (id) =>
            apiFetch<{ isFavorite: boolean }>(
              `${API_BASE}/album/${id}/toggle-favorite`,
              { method: "POST" },
            ),
          ...options,
        }),
    },
    sync: {
      useMutation: (
        options?: UseMutationOptions<
          void,
          Error,
          { id: string; clearData?: boolean }
        >,
      ) =>
        useMutation<void, Error, { id: string; clearData?: boolean }>({
          mutationFn: async (params) => {
            await apiFetch<unknown>(`${API_BASE}/${params.id}/sync`, {
              method: "POST",
            });
          },
          ...options,
        }),
    },
    syncLibrary: {
      useMutation: (
        options?: UseMutationOptions<void, Error, { id: string }>,
      ) =>
        useMutation<void, Error, { id: string }>({
          mutationFn: async (params) => {
            await apiFetch<unknown>(`${API_BASE}/${params.id}/sync`, {
              method: "POST",
            });
          },
          ...options,
        }),
    },
    create: {
      useMutation: (
        options?: UseMutationOptions<LibraryDto, Error, CreateLibraryInput>,
      ) =>
        useMutation<LibraryDto, Error, CreateLibraryInput>({
          mutationFn: (input) =>
            apiFetch<LibraryDto>(API_BASE, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            }),
          ...options,
        }),
      invalidate: (qc: QueryClient) => invalidate(qc, ["music", "list"]),
    },
    update: {
      useMutation: (
        options?: UseMutationOptions<
          LibraryDto,
          Error,
          { id: string } & UpdateLibraryInput
        >,
      ) =>
        useMutation<LibraryDto, Error, { id: string } & UpdateLibraryInput>({
          mutationFn: ({ id, ...input }) =>
            apiFetch<LibraryDto>(`${API_BASE}/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(input),
            }),
          ...options,
        }),
    },
    delete: {
      useMutation: (options?: UseMutationOptions<void, Error, string>) =>
        useMutation<void, Error, string>({
          mutationFn: async (id) => {
            await apiFetch<unknown>(`${API_BASE}/${id}`, {
              method: "DELETE",
            });
          },
          ...options,
        }),
    },
  },
};

export interface CreateLibraryInput {
  name: string;
  type?: string;
  avatar?: Record<string, unknown> | null;
  description?: string | null;
  sources?: Array<{
    sourceId: string;
    rootPath: string;
    sortOrder?: number;
    isDefaultDownload?: boolean;
  }>;
  rootPath?: string;
  sourceId?: string;
  sourceType?: string;
}

export interface UpdateLibraryInput {
  name?: string;
  type?: string;
  avatar?: Record<string, unknown> | null;
  description?: string | null;
  sources?: Array<{
    sourceId: string;
    rootPath: string;
    sortOrder?: number;
    isDefaultDownload?: boolean;
  }>;
  rootPath?: string;
  sourceId?: string;
  sourceType?: string;
}
