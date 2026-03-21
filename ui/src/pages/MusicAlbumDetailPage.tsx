import {
  ArrowLeftOutlined,
  Button,
  HorizontalScroll,
  Spin,
  Tag,
} from "@tokiomo/components";
import type { CreditOutput, MusicTrackOutput } from "@tokiomo/types";
import { Clock, Disc3, Heart, ListPlus, Pause, Play } from "lucide-react";
import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMusicPlayer } from "../../contexts/MusicPlayerContext";
import { trpc } from "../../lib/trpc";
import { PersonCard, SectionTitle } from "./media-detail-shared";
import { formatDuration, formatTotalDuration } from "./music-shared";

// ── Favorite Button ───────────────────────────────────────────────────────────
function FavoriteButton({
  isFavorite,
  albumId,
}: {
  isFavorite: boolean;
  albumId: string;
}) {
  const utils = trpc.useUtils();
  const toggle = trpc.mediaLibrary.toggleAlbumFavorite.useMutation({
    onSuccess: () =>
      void utils.mediaLibrary.getAlbumDetail.invalidate({ albumId }),
  });
  return (
    <button
      type="button"
      title={isFavorite ? "取消收藏" : "收藏"}
      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 ${
        isFavorite ? "text-red-500" : "text-neutral-400 hover:text-red-400"
      }`}
      onClick={() => toggle.mutate({ albumId })}
    >
      <Heart className={`h-5 w-5 ${isFavorite ? "fill-current" : ""}`} />
    </button>
  );
}

// ── Track Row ─────────────────────────────────────────────────────────────────
function TrackRow({
  track,
  tracks,
  startIndex,
}: {
  track: MusicTrackOutput;
  tracks: MusicTrackOutput[];
  startIndex: number;
}) {
  const { currentTrack, isPlaying, togglePlay, playTracks, addToQueue } =
    useMusicPlayer();
  const isActive = currentTrack?.id === track.id;

  const handlePlay = useCallback(() => {
    playTracks(tracks, startIndex);
  }, [playTracks, tracks, startIndex]);

  const handleAddToQueue = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      addToQueue([track]);
    },
    [addToQueue, track],
  );

  return (
    <button
      type="button"
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
        isActive
          ? "bg-[var(--accent)]/10 dark:bg-[var(--accent)]/20"
          : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
      }`}
      onClick={isActive ? togglePlay : handlePlay}
    >
      {/* Track number */}
      <span className="w-8 flex-shrink-0 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {isActive ? (
          isPlaying ? (
            <Pause className="mx-auto h-4 w-4 text-[var(--accent)]" />
          ) : (
            <Play
              className="mx-auto h-4 w-4 text-[var(--accent)]"
              fill="currentColor"
            />
          )
        ) : (
          <>
            <span className="group-hover:hidden">
              {track.trackNumber ?? "-"}
            </span>
            <Play
              className="mx-auto hidden h-4 w-4 group-hover:block"
              fill="currentColor"
            />
          </>
        )}
      </span>

      {/* Title + Artist */}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            isActive
              ? "text-[var(--accent)]"
              : "text-neutral-900 dark:text-neutral-100"
          }`}
        >
          {track.title}
        </p>
        {track.artistName && (
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {track.artistName}
          </p>
        )}
      </div>

      {/* Duration */}
      <span className="w-[50px] flex-shrink-0 text-right text-xs text-neutral-500 dark:text-neutral-400">
        {formatDuration(track.duration)}
      </span>

      {/* Add to queue */}
      <button
        type="button"
        title="添加到队列"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-neutral-200 group-hover:opacity-100 dark:hover:bg-neutral-700"
        onClick={handleAddToQueue}
      >
        <ListPlus className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
      </button>
    </button>
  );
}

// ── Credits Section ───────────────────────────────────────────────────────────
function CreditsSection({ credits }: { credits: CreditOutput[] }) {
  if (!credits.length) return null;
  return (
    <section className="mt-8">
      <SectionTitle>艺术家</SectionTitle>
      <HorizontalScroll innerClassName="gap-3 px-0.5 pb-2 pt-0.5">
        {credits.map((c) => (
          <PersonCard
            key={c.id}
            personId={c.person.id}
            name={c.person.name}
            sub={c.role}
            profilePath={c.person.profilePath}
          />
        ))}
      </HorizontalScroll>
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MusicAlbumDetailPage() {
  const { id, albumId } = useParams<{ id: string; albumId: string }>();
  const navigate = useNavigate();
  const { playTracks, addToQueue } = useMusicPlayer();

  const { data: album, isLoading } = trpc.mediaLibrary.getAlbumDetail.useQuery(
    { albumId: albumId! },
    { enabled: !!albumId },
  );

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <p className="text-neutral-500">未找到该专辑</p>
        <Button
          onClick={() => navigate(`/dashboard/library/${id}/music?tab=albums`)}
        >
          返回
        </Button>
      </div>
    );
  }

  const tracks = album.tracks ?? [];
  const credits = album.credits ?? [];
  const genres = album.genres ?? [];

  // Group tracks by disc
  const discs = new Map<number, MusicTrackOutput[]>();
  for (const track of tracks) {
    const disc = track.discNumber ?? 1;
    const existing = discs.get(disc);
    if (existing) {
      existing.push(track);
    } else {
      discs.set(disc, [track]);
    }
  }
  const hasMultiDisc = discs.size > 1;
  const sortedDiscNumbers = [...discs.keys()].sort((a, b) => a - b);

  const handlePlayAll = () => {
    if (tracks.length > 0) playTracks(tracks, 0);
  };

  const handleAddAllToQueue = () => {
    if (tracks.length > 0) addToQueue(tracks);
  };

  return (
    <div className="-mx-3 -mt-3 -mb-3 min-h-full lg:-mx-6 lg:-mt-6 lg:-mb-6">
      {/* Header */}
      <div className="relative z-10 px-6 pt-6 pb-6">
        <div className="mb-6">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() =>
              navigate(`/dashboard/library/${id}/music?tab=albums`)
            }
          >
            返回
          </Button>
        </div>

        <div className="flex flex-col items-start gap-6 md:flex-row">
          {/* Cover */}
          <div className="relative w-[200px] flex-shrink-0 overflow-hidden rounded-xl shadow-2xl md:w-[250px]">
            {album.coverPath ? (
              <img
                src={album.coverPath}
                alt={album.title}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-[var(--bg-skeleton)]">
                <Disc3 className="h-20 w-20 text-neutral-400" />
              </div>
            )}
            {/* Play overlay */}
            <button
              type="button"
              aria-label="播放全部"
              className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-xl bg-black/30 opacity-0 transition-opacity hover:opacity-100"
              onClick={handlePlayAll}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] shadow-lg">
                <Play className="h-7 w-7 text-white" fill="white" />
              </span>
            </button>
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold leading-tight text-neutral-900 dark:text-neutral-100">
                {album.title}
              </h1>
              <FavoriteButton
                isFavorite={album.isFavorite}
                albumId={album.id}
              />
            </div>

            {/* Artist (clickable) */}
            {album.artistName && (
              <button
                type="button"
                className="mt-1 cursor-pointer text-sm text-[var(--accent)] hover:underline"
                onClick={() => {
                  const artist = credits.find(
                    (c) =>
                      c.person.name === album.artistName &&
                      ["artist", "album_artist", "performer"].includes(c.role),
                  );
                  if (artist) {
                    navigate(
                      `/dashboard/library/${id}/music/artist/${artist.person.id}`,
                    );
                  }
                }}
              >
                {album.artistName}
              </button>
            )}

            {/* Meta line */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
              {album.year && <span>{album.year}</span>}
              {album.albumType && (
                <>
                  <span className="text-neutral-400">·</span>
                  <span>{album.albumType}</span>
                </>
              )}
              {album.trackCount > 0 && (
                <>
                  <span className="text-neutral-400">·</span>
                  <span>{album.trackCount} 首曲目</span>
                </>
              )}
              {album.totalDuration && (
                <>
                  <span className="text-neutral-400">·</span>
                  <span>{formatTotalDuration(album.totalDuration)}</span>
                </>
              )}
            </div>

            {/* Genre tags */}
            {genres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <Tag key={g} color="default">
                    {g}
                  </Tag>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 font-semibold text-white hover:opacity-90"
                onClick={handlePlayAll}
              >
                <Play className="h-5 w-5" fill="white" />
                播放全部
              </button>
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                onClick={handleAddAllToQueue}
              >
                <ListPlus className="h-4 w-4" />
                添加到队列
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Track List */}
      <div className="relative z-10 px-6 pb-6">
        {album.overview && (
          <div className="mb-6">
            <SectionTitle>简介</SectionTitle>
            <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
              {album.overview}
            </p>
          </div>
        )}

        <SectionTitle>曲目列表</SectionTitle>
        <div className="rounded-lg border border-[var(--glass-border)] bg-white dark:bg-gray-800/50">
          {/* Table header */}
          <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-3 py-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            <span className="w-8 flex-shrink-0 text-center">#</span>
            <span className="min-w-0 flex-1">标题</span>
            <span className="w-[50px] flex-shrink-0 text-right">
              <Clock className="ml-auto h-3.5 w-3.5" />
            </span>
            <span className="w-7 flex-shrink-0" />
          </div>

          {/* Tracks grouped by disc */}
          {sortedDiscNumbers.map((discNum) => {
            const discTracks = discs.get(discNum) ?? [];
            // Calculate start index within full tracks array
            let trackOffset = 0;
            for (const dn of sortedDiscNumbers) {
              if (dn === discNum) break;
              trackOffset += discs.get(dn)?.length ?? 0;
            }
            return (
              <div key={discNum}>
                {hasMultiDisc && (
                  <div className="border-b border-[var(--glass-border)] bg-neutral-50 px-4 py-1.5 text-xs font-semibold text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-400">
                    光碟 {discNum}
                  </div>
                )}
                <div className="divide-y divide-[var(--glass-border)]">
                  {discTracks.map((track, i) => (
                    <TrackRow
                      key={track.id}
                      track={track}
                      tracks={tracks}
                      startIndex={trackOffset + i}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Credits */}
        <CreditsSection credits={credits} />
      </div>
    </div>
  );
}
