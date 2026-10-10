import { useQueryClient } from "@tanstack/react-query";
import { posterThumbUrl } from "@tokimo/sdk";
import { Button, ScrollArea, Spin, Tag } from "@tokimo/ui";
import {
  ArrowLeft,
  Clock,
  Disc3,
  Heart,
  ListPlus,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useEffect } from "react";
import { api } from "../api/client";
import { MusicAlbumTrackRow } from "../components/MusicAlbumTrackRow";
import type { CreditOutput, MusicTrackOutput } from "../lib/types";
import { PersonCard, SectionTitle } from "../shared/components/SectionTitle";
import { useBackgroundArt, useMusicPlayer, useWindowNav } from "../shell/hooks";
import { formatTotalDuration } from "./music-shared";

// ── Favorite Button ───────────────────────────────────────────────────────────
function FavoriteButton({
  isFavorite,
  albumId,
}: {
  isFavorite: boolean;
  albumId: string;
}) {
  const qc = useQueryClient();
  const toggle = api.music.toggleAlbumFavorite.useMutation({
    onSuccess: () =>
      void api.music.getAlbumDetail.invalidate(qc, { id: albumId }),
  });
  return (
    <button
      type="button"
      title={isFavorite ? "取消收藏" : "收藏"}
      aria-label={isFavorite ? "取消收藏" : "收藏专辑"}
      disabled={toggle.isPending}
      className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 ${
        isFavorite
          ? "text-red-500"
          : "text-[var(--color-fg-muted)] hover:text-red-400"
      }`}
      onClick={() => toggle.mutate(albumId!)}
    >
      <Heart className={`h-5 w-5 ${isFavorite ? "fill-current" : ""}`} />
    </button>
  );
}

// ── Scrape Button ─────────────────────────────────────────────────────────────
function ScrapeButton({
  albumId,
  scraped,
}: {
  albumId: string;
  scraped: boolean;
}) {
  const qc = useQueryClient();
  const scrape = api.music.scrapeAlbum.useMutation({
    onSuccess: () => {
      setTimeout(
        () => void api.music.getAlbumDetail.invalidate(qc, { id: albumId }),
        3000,
      );
    },
  });
  return (
    <button
      type="button"
      title="重新刮削"
      className={`inline-flex min-h-11 cursor-pointer items-center gap-1 text-xs @min-[640px]/music-detail:min-h-0 transition-colors ${
        scraped
          ? "text-emerald-500 hover:text-emerald-400"
          : "text-orange-400 hover:text-orange-300"
      }`}
      onClick={() => scrape.mutate(albumId)}
      disabled={scrape.isPending}
    >
      {scrape.isPending ? (
        <Spin className="h-3 w-3" />
      ) : scraped ? (
        <Sparkles className="h-3 w-3" />
      ) : (
        <RefreshCw className="h-3 w-3" />
      )}
      {scrape.isPending ? "刮削中..." : scraped ? "已刮削" : "未刮削"}
    </button>
  );
}

// ── Credits Section ───────────────────────────────────────────────────────────
function CreditsSection({ credits }: { credits: CreditOutput[] }) {
  if (!credits.length) return null;
  return (
    <section className="mt-8">
      <SectionTitle>艺术家</SectionTitle>
      <ScrollArea
        direction="horizontal"
        hideScrollbar
        innerClassName="gap-3 px-0.5 pb-2 pt-0.5"
      >
        {credits.map((c) => (
          <PersonCard
            key={c.id}
            name={c.person.name}
            sub={c.role}
            profilePath={c.person.profilePath}
          />
        ))}
      </ScrollArea>
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MusicAlbumDetailPage() {
  const { params, canGoBack, goBack, navigate } = useWindowNav();
  const albumId = params.albumId;
  const { playTracks, addToQueue } = useMusicPlayer();

  const { data: album, isLoading } = api.music.getAlbumDetail.useQuery(
    { id: albumId! },
    { enabled: !!albumId },
  );

  const { setBackgroundArt } = useBackgroundArt();
  useEffect(() => {
    if (album?.coverPath) {
      setBackgroundArt(posterThumbUrl(album.coverPath, 1280) ?? null);
    }
    return () => {
      setBackgroundArt(null);
    };
  }, [album?.coverPath, setBackgroundArt]);

  const libraryId = params.libraryId || album?.musicId;
  const returnToLibrary = () => {
    if (canGoBack) goBack();
    else navigate(libraryId ? `/library/${libraryId}` : "/");
  };

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
        <p className="text-[var(--color-fg-muted)]">未找到该专辑</p>
        <Button onClick={returnToLibrary}>返回</Button>
      </div>
    );
  }

  const tracks = album.tracks ?? [];
  const credits = album.credits ?? [];
  const genres = album.genres ?? [];

  // Derive artist name: prefer album.artistName, fallback to credits
  const artistName =
    album.artistName ||
    credits.find((c) =>
      ["artist", "album_artist", "performer"].includes(c.role),
    )?.person.name ||
    null;

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
    <div className="@container/music-detail min-h-full">
      {/* Header */}
      <div className="relative z-10 px-3 py-4 @min-[640px]/music-detail:px-6 @min-[640px]/music-detail:py-6">
        <div className="mb-4 @min-[640px]/music-detail:mb-6">
          <Button
            icon={<ArrowLeft className="h-4 w-4" />}
            className="min-h-11 @min-[640px]/music-detail:min-h-8"
            onClick={returnToLibrary}
          >
            返回
          </Button>
        </div>

        <div className="flex flex-col items-center gap-4 @min-[640px]/music-detail:gap-6 @min-[768px]/music-detail:flex-row @min-[768px]/music-detail:items-start">
          {/* Cover */}
          <div className="relative w-40 max-w-full flex-shrink-0 @min-[640px]/music-detail:w-[200px] overflow-hidden rounded-xl shadow-2xl @min-[768px]/music-detail:w-[250px]">
            {album.coverPath ? (
              <img
                src={posterThumbUrl(album.coverPath, 300) ?? undefined}
                alt={album.title}
                className="aspect-square w-full object-cover"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center bg-[var(--color-fill-skeleton)]">
                <Disc3 className="h-20 w-20 text-[var(--color-fg-muted)]" />
              </div>
            )}
            {/* Play overlay */}
            <button
              type="button"
              aria-label="播放全部"
              className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-xl bg-black/30 opacity-0 transition-opacity hover:opacity-100"
              onClick={handlePlayAll}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] shadow-lg">
                <Play className="h-7 w-7 text-white" fill="white" />
              </span>
            </button>
          </div>

          {/* Info */}
          <div className="w-full min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h1 className="min-w-0 flex-1 break-words text-2xl font-bold leading-tight text-fg-primary @min-[640px]/music-detail:text-3xl">
                {album.title}
              </h1>
              <FavoriteButton
                isFavorite={album.isFavorite}
                albumId={album.id}
              />
            </div>

            {/* Artist (clickable) */}
            {artistName && (
              <button
                type="button"
                className="mt-1 min-h-11 cursor-pointer break-words text-left text-sm text-accent-text hover:underline @min-[640px]/music-detail:min-h-0"
                onClick={() => {
                  const artist = credits.find(
                    (c) =>
                      c.person.name === artistName &&
                      ["artist", "album_artist", "performer"].includes(c.role),
                  );
                  if (artist && libraryId) {
                    navigate(
                      `/library/${libraryId}/artists/${artist.person.id}`,
                      `TokimoMusic · ${artist.person.name}`,
                    );
                  }
                }}
              >
                {artistName}
              </button>
            )}

            {/* Meta line */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--color-fg-secondary)]">
              {album.year && <span>{album.year}</span>}
              {album.albumType && (
                <>
                  <span className="text-[var(--color-fg-muted)]">·</span>
                  <span>{album.albumType}</span>
                </>
              )}
              {album.trackCount > 0 && (
                <>
                  <span className="text-[var(--color-fg-muted)]">·</span>
                  <span>{album.trackCount} 首曲目</span>
                </>
              )}
              {album.totalDuration && (
                <>
                  <span className="text-[var(--color-fg-muted)]">·</span>
                  <span>{formatTotalDuration(album.totalDuration)}</span>
                </>
              )}
              <span className="text-[var(--color-fg-muted)]">·</span>
              <ScrapeButton albumId={album.id} scraped={!!album.scrapedAt} />
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
            <div className="mt-4 grid grid-cols-1 gap-2 @min-[360px]/music-detail:grid-cols-2 @min-[640px]/music-detail:flex @min-[640px]/music-detail:flex-wrap @min-[640px]/music-detail:items-center @min-[640px]/music-detail:gap-3">
              <button
                type="button"
                className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-semibold text-white hover:opacity-90"
                onClick={handlePlayAll}
              >
                <Play className="h-5 w-5" fill="white" />
                播放全部
              </button>
              <button
                type="button"
                className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border-base bg-[var(--color-surface-overlay)] px-4 py-2.5 text-sm font-medium text-[var(--color-fg-secondary)] hover:bg-[var(--color-surface-overlay-hover)]"
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
      <div className="relative z-10 px-3 pb-6 @min-[640px]/music-detail:px-6">
        {album.overview && (
          <div className="mb-4 @min-[640px]/music-detail:mb-6">
            <SectionTitle>简介</SectionTitle>
            <p className="text-sm leading-relaxed text-[var(--color-fg-secondary)]">
              {album.overview}
            </p>
          </div>
        )}

        <SectionTitle>曲目列表</SectionTitle>
        <div className="rounded-lg border border-border-base bg-[var(--color-surface-overlay)]">
          {/* Table header */}
          <div className="flex items-center gap-3 border-b border-border-base px-3 py-2 text-xs font-medium text-[var(--color-fg-muted)]">
            <span className="w-8 flex-shrink-0 text-center">#</span>
            <span className="w-full min-w-0 flex-1">标题</span>
            <span className="w-[50px] flex-shrink-0 text-right">
              <Clock className="ml-auto h-3.5 w-3.5" />
            </span>
            <span className="w-11 shrink-0 @min-[640px]/music-detail:w-[68px]" />
          </div>

          {/* Tracks grouped by disc */}
          {sortedDiscNumbers.map((discNum) => {
            const discTracks = discs.get(discNum) ?? [];
            return (
              <div key={discNum}>
                {hasMultiDisc && (
                  <div className="border-b border-border-base bg-[var(--color-fill-tertiary)] px-4 py-1.5 text-xs font-semibold text-[var(--color-fg-secondary)]">
                    光碟 {discNum}
                  </div>
                )}
                <div className="divide-y divide-[var(--color-border-base)]">
                  {discTracks.map((track) => (
                    <MusicAlbumTrackRow
                      key={track.id}
                      track={track}
                      tracks={tracks}
                      startIndex={tracks.indexOf(track)}
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
