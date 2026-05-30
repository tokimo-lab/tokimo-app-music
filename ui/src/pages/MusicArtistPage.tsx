import { posterThumbUrl } from "@tokimo/sdk";
import { ArrowLeftOutlined, Button, Empty, Spin } from "@tokimo/ui";
import { User } from "lucide-react";
import { useEffect } from "react";
import { api } from "../api/client";
import { MusicLayout } from "../components/MusicLayout";
import { SectionTitle } from "../shared/components/SectionTitle";
import { useBackgroundArt, useWindowNav } from "../shell/hooks";
import { AlbumCard } from "./music-shared";

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MusicArtistPage() {
  const { params, goBack, navigate } = useWindowNav();
  const musicId = params.libraryId ?? undefined;
  const personId = params.personId;

  const { setBackgroundArt } = useBackgroundArt();

  const { data: artist, isLoading } = api.music.getArtistDetail.useQuery(
    { id: personId!, musicId: musicId! },
    { enabled: !!personId && !!musicId },
  );

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
        <p className="text-[var(--text-muted)]">未找到该艺术家</p>
        <Button onClick={() => goBack()}>返回</Button>
      </div>
    );
  }

  const albums = artist.albums ?? [];

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

          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            {/* Profile Image */}
            <div className="relative h-[200px] w-[200px] flex-shrink-0 overflow-hidden rounded-full shadow-2xl">
              {artist.profilePath ? (
                <img
                  src={posterThumbUrl(artist.profilePath, 300) ?? undefined}
                  alt={artist.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--bg-skeleton)]">
                  <User className="h-20 w-20 text-[var(--text-muted)]" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="min-w-0 flex-1 text-center md:text-left">
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                艺术家
              </p>
              <h1 className="mt-1 text-3xl font-bold text-[var(--text-primary)]">
                {artist.name}
              </h1>

              {artist.originalName && artist.originalName !== artist.name && (
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {artist.originalName}
                </p>
              )}

              {artist.aliases && artist.aliases.length > 0 && (
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  别名：{artist.aliases.join("、")}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-[var(--text-secondary)] md:justify-start">
                <span>{artist.albumCount} 张专辑</span>
                <span className="text-[var(--text-muted)]">·</span>
                <span>{artist.trackCount} 首曲目</span>
              </div>

              {(artist.birthday || artist.birthplace) && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-[var(--text-secondary)] md:justify-start">
                  {artist.birthday && <span>🎂 {artist.birthday}</span>}
                  {artist.birthplace && <span>📍 {artist.birthplace}</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 px-6 pb-6">
          {/* Biography */}
          {artist.biography && (
            <div className="mb-8">
              <SectionTitle>简介</SectionTitle>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {artist.biography}
              </p>
            </div>
          )}

          {/* Albums */}
          <SectionTitle>专辑</SectionTitle>
          {albums.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8">
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onClick={() =>
                    navigate(
                      `/albums/${album.id}`,
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
    </MusicLayout>
  );
}
