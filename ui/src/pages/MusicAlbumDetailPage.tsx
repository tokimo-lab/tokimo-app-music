import { useQueryClient } from "@tanstack/react-query";
import { posterThumbUrl } from "@tokimo/sdk";
import { ArrowLeftOutlined, Button, ScrollArea, Spin, Tag } from "@tokimo/ui";
import {
  Clock,
  Disc3,
  Heart,
  ListPlus,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { MusicLayout } from "../components/MusicLayout";
import type { CreditOutput, MusicTrackOutput } from "../lib/types";
import { PersonCard, SectionTitle } from "../shared/components/SectionTitle";
import { useBackgroundArt, useMusicPlayer, useWindowNav } from "../shell/hooks";
import { formatDuration, formatTotalDuration } from "./music-shared";

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
      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 ${
        isFavorite
          ? "text-red-500"
          : "text-[var(--text-muted)] hover:text-red-400"
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
      className={`inline-flex cursor-pointer items-center gap-1 text-xs transition-colors ${
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const scrapeLyrics = api.music.scrapeTrackLyrics.useMutation({
    onSuccess: () => setMenuOpen(false),
  });

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: <button> cannot be nested inside <button>
    <div
      role="button"
      tabIndex={0}
      className={`group flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
        isActive ? "bg-[var(--accent)]/10" : "hover:bg-[var(--fill-tertiary)]"
      }`}
      onClick={isActive ? togglePlay : handlePlay}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (isActive ? togglePlay : handlePlay)();
        }
      }}
    >
      {/* Track number */}
      <span className="w-8 flex-shrink-0 text-center text-sm text-[var(--text-muted)]">
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
            isActive ? "text-[var(--accent)]" : "text-[var(--text-primary)]"
          }`}
        >
          {track.title}
        </p>
        {track.artistName && (
          <p className="truncate text-xs text-[var(--text-muted)]">
            {track.artistName}
          </p>
        )}
      </div>

      {/* Duration */}
      <span className="w-[50px] flex-shrink-0 text-right text-xs text-[var(--text-muted)]">
        {formatDuration(track.duration)}
      </span>

      {/* Add to queue */}
      <button
        type="button"
        title="添加到队列"
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-[var(--fill-tertiary)] group-hover:opacity-100"
        onClick={handleAddToQueue}
      >
        <ListPlus className="h-4 w-4 text-[var(--text-muted)]" />
      </button>

      {/* More menu */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          title="更多操作"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity hover:bg-[var(--fill-tertiary)] group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          <MoreHorizontal className="h-4 w-4 text-[var(--text-muted)]" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-50 min-w-[140px] rounded-lg border border-border-base bg-[var(--bg-elevated)] py-1 shadow-lg">
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--fill-tertiary)]"
              onClick={(e) => {
                e.stopPropagation();
                scrapeLyrics.mutate(track.id);
              }}
              disabled={scrapeLyrics.isPending}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {scrapeLyrics.isPending ? "刮削中..." : "重新刮削歌词"}
            </button>
          </div>
        )}
      </div>
    </div>
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
  const { params, goBack, navigate } = useWindowNav();
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
        <p className="text-[var(--text-muted)]">未找到该专辑</p>
        <Button onClick={() => goBack()}>返回</Button>
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
    <MusicLayout>
      <div className="-mx-3 -mt-3 -mb-3 min-h-full lg:-mx-4 lg:-mt-4 lg:-mb-4">
        {/* Header */}
        <div className="relative z-10 px-6 pt-6 pb-6">
          <div className="mb-6">
            <Button icon={<ArrowLeftOutlined />} onClick={() => goBack()}>
              返回
            </Button>
          </div>

          <div className="flex flex-col items-start gap-6 md:flex-row">
            {/* Cover */}
            <div className="relative w-[200px] flex-shrink-0 overflow-hidden rounded-xl shadow-2xl md:w-[250px]">
              {album.coverPath ? (
                <img
                  src={posterThumbUrl(album.coverPath, 300) ?? undefined}
                  alt={album.title}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-[var(--bg-skeleton)]">
                  <Disc3 className="h-20 w-20 text-[var(--text-muted)]" />
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
                <h1 className="text-3xl font-bold leading-tight text-[var(--text-primary)]">
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
                  className="mt-1 cursor-pointer text-sm text-[var(--accent)] hover:underline"
                  onClick={() => {
                    const artist = credits.find(
                      (c) =>
                        c.person.name === artistName &&
                        ["artist", "album_artist", "performer"].includes(
                          c.role,
                        ),
                    );
                    if (artist) {
                      navigate(
                        `/artists/${artist.person.id}`,
                        `TokimoMusic · ${artist.person.name}`,
                      );
                    }
                  }}
                >
                  {artistName}
                </button>
              )}

              {/* Meta line */}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
                {album.year && <span>{album.year}</span>}
                {album.albumType && (
                  <>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span>{album.albumType}</span>
                  </>
                )}
                {album.trackCount > 0 && (
                  <>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span>{album.trackCount} 首曲目</span>
                  </>
                )}
                {album.totalDuration && (
                  <>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span>{formatTotalDuration(album.totalDuration)}</span>
                  </>
                )}
                <span className="text-[var(--text-muted)]">·</span>
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
              <div className="mt-4 flex flex-wrap items-center gap-3">
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
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border-base bg-[var(--bg-glass)] px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-glass-hover)]"
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
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {album.overview}
              </p>
            </div>
          )}

          <SectionTitle>曲目列表</SectionTitle>
          <div className="rounded-lg border border-border-base bg-[var(--bg-glass)]">
            {/* Table header */}
            <div className="flex items-center gap-3 border-b border-border-base px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
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
                    <div className="border-b border-border-base bg-[var(--fill-tertiary)] px-4 py-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                      光碟 {discNum}
                    </div>
                  )}
                  <div className="divide-y divide-[var(--border-base)]">
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
    </MusicLayout>
  );
}
