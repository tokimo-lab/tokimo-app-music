import { posterThumbUrl } from "@tokimo/sdk";
import { Button, Empty, Spin } from "@tokimo/ui";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Play,
  RefreshCw,
  User,
} from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { api } from "../api/client";
import type { MusicTrackOutput } from "../lib/types";
import { SectionTitle } from "../shared/components/SectionTitle";
import { useBackgroundArt, useMusicPlayer, useWindowNav } from "../shell/hooks";
import { AlbumCard } from "./music-shared";

// ── Artist Scrape Button ──────────────────────────────────────────────────────
function ArtistScrapeButton({ artistId }: { artistId: string }) {
  const scrape = api.music.scrapeArtist.useMutation();
  return (
    <button
      type="button"
      title="重新刮削艺术家信息"
      className="inline-flex min-h-11 cursor-pointer @min-[640px]/music-detail:min-h-0 items-center gap-1 text-xs text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg-secondary)]"
      onClick={() => scrape.mutate(artistId)}
      disabled={scrape.isPending}
    >
      <RefreshCw
        className={`h-3 w-3 ${scrape.isPending ? "animate-spin" : ""}`}
      />
      {scrape.isPending ? "刮削中..." : "重新刮削"}
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MusicArtistPage() {
  const { params, canGoBack, goBack, navigate } = useWindowNav();
  const biographyId = useId();
  const [biographyExpanded, setBiographyExpanded] = useState(false);
  const returnToLibrary = () => {
    if (canGoBack) goBack();
    else navigate(params.libraryId ? `/library/${params.libraryId}` : "/");
  };
  const musicId = params.libraryId ?? undefined;
  const personId = params.personId;

  const { setBackgroundArt } = useBackgroundArt();
  const { playTracks } = useMusicPlayer();

  const { data: artist, isLoading } = api.music.getArtistDetail.useQuery(
    { id: personId!, musicId: musicId! },
    { enabled: !!personId && !!musicId },
  );

  const albums = artist?.albums ?? [];

  const handlePlayAll = useCallback(() => {
    const allTracks: MusicTrackOutput[] = albums.flatMap(
      (album) => album.tracks ?? [],
    );
    if (allTracks.length > 0) {
      playTracks(allTracks, 0);
    }
  }, [albums, playTracks]);

  useEffect(() => {
    if (artist?.profilePath) {
      setBackgroundArt(posterThumbUrl(artist.profilePath, 1280) ?? null);
    }
    return () => {
      setBackgroundArt(null);
    };
  }, [artist?.profilePath, setBackgroundArt]);

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spin />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <p className="text-[var(--color-fg-muted)]">未找到该艺术家</p>
        <Button onClick={returnToLibrary}>返回</Button>
      </div>
    );
  }

  return (
    <div className="@container/music-detail min-h-full">
      {/* Header */}
      <div className="relative z-10 px-3 py-4 @min-[640px]/music-detail:px-6 @min-[640px]/music-detail:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2 @min-[640px]/music-detail:mb-6">
          <Button
            icon={<ArrowLeft className="h-4 w-4" />}
            className="min-h-11 @min-[640px]/music-detail:min-h-8"
            onClick={returnToLibrary}
          >
            返回
          </Button>
          {albums.length > 0 && (
            <Button
              className="min-h-11 @min-[640px]/music-detail:min-h-8"
              icon={<Play className="h-4 w-4" fill="currentColor" />}
              onClick={handlePlayAll}
            >
              播放全部
            </Button>
          )}
        </div>

        <div className="flex flex-col items-center gap-6 @min-[768px]/music-detail:flex-row @min-[768px]/music-detail:items-start">
          {/* Profile Image */}
          <div className="relative h-36 w-36 @min-[640px]/music-detail:h-[200px] @min-[640px]/music-detail:w-[200px] flex-shrink-0 overflow-hidden rounded-full shadow-2xl">
            {artist.profilePath ? (
              <img
                src={posterThumbUrl(artist.profilePath, 300) ?? undefined}
                alt={artist.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--color-fill-skeleton)]">
                <User className="h-20 w-20 text-[var(--color-fg-muted)]" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="w-full min-w-0 flex-1 text-center @min-[768px]/music-detail:text-left">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-fg-muted)]">
              艺术家
            </p>
            <h1 className="mt-1 break-words text-2xl font-bold @min-[640px]/music-detail:text-3xl text-[var(--color-fg-primary)]">
              {artist.name}
            </h1>

            {artist.originalName && artist.originalName !== artist.name && (
              <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                {artist.originalName}
              </p>
            )}

            {artist.aliases && artist.aliases.length > 0 && (
              <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
                别名：{artist.aliases.join("、")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--color-fg-secondary)] @min-[768px]/music-detail:justify-start">
              <span>{artist.albumCount} 张专辑</span>
              <span className="text-[var(--color-fg-muted)]">·</span>
              <span>{artist.trackCount} 首曲目</span>
              <span className="text-[var(--color-fg-muted)]">·</span>
              <ArtistScrapeButton artistId={artist.id} />
            </div>

            {(artist.birthday || artist.birthplace) && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-[var(--color-fg-secondary)] @min-[768px]/music-detail:justify-start">
                {artist.birthday && <span>🎂 {artist.birthday}</span>}
                {artist.birthplace && <span>📍 {artist.birthplace}</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="relative z-10 px-3 pb-6 @min-[640px]/music-detail:px-6">
        {/* Biography */}
        {artist.biography && (
          <div className="mb-8">
            <SectionTitle>简介</SectionTitle>
            <p
              id={biographyId}
              className={`text-sm leading-relaxed text-fg-secondary ${biographyExpanded ? "" : "line-clamp-3 @min-[640px]/music-detail:line-clamp-none"}`}
            >
              {artist.biography}
            </p>
            <button
              type="button"
              aria-expanded={biographyExpanded}
              aria-controls={biographyId}
              onClick={() => setBiographyExpanded((value) => !value)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-sm text-accent-text @min-[640px]/music-detail:hidden"
            >
              {biographyExpanded ? "收起简介" : "展开简介"}
              {biographyExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>
        )}

        {/* Albums */}
        <SectionTitle>专辑</SectionTitle>
        {albums.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 @min-[640px]/music-detail:grid-cols-3 @min-[768px]/music-detail:grid-cols-4 @min-[1024px]/music-detail:grid-cols-5 @min-[1280px]/music-detail:grid-cols-6 @min-[1536px]/music-detail:grid-cols-8">
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                onClick={() =>
                  navigate(
                    `/library/${musicId}/albums/${album.id}`,
                    `TokimoMusic · ${album.title ?? "Album"}`,
                  )
                }
              />
            ))}
          </div>
        ) : (
          <Empty description="暂无专辑" />
        )}
      </div>
    </div>
  );
}
