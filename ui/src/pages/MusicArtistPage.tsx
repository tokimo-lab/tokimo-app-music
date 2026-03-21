import { ArrowLeftOutlined, Button, Empty, Spin } from "@tokiomo/components";
import { User } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { trpc } from "../../lib/trpc";
import { SectionTitle } from "./media-detail-shared";
import { AlbumCard } from "./music-shared";

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function MusicArtistPage() {
  const { id, personId } = useParams<{ id: string; personId: string }>();
  const navigate = useNavigate();

  const { data: artist, isLoading } =
    trpc.mediaLibrary.getArtistDetail.useQuery(
      { personId: personId!, libraryId: id! },
      { enabled: !!personId && !!id },
    );

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
        <p className="text-neutral-500">未找到该艺术家</p>
        <Button
          onClick={() => navigate(`/dashboard/library/${id}/music?tab=artists`)}
        >
          返回
        </Button>
      </div>
    );
  }

  const albums = artist.albums ?? [];

  return (
    <div className="-mx-3 -mt-3 -mb-3 min-h-full lg:-mx-6 lg:-mt-6 lg:-mb-6">
      {/* Header */}
      <div className="relative z-10 px-6 pt-6 pb-6">
        <div className="mb-6">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() =>
              navigate(`/dashboard/library/${id}/music?tab=artists`)
            }
          >
            返回
          </Button>
        </div>

        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
          {/* Profile Image */}
          <div className="relative h-[200px] w-[200px] flex-shrink-0 overflow-hidden rounded-full shadow-2xl">
            {artist.profilePath ? (
              <img
                src={artist.profilePath}
                alt={artist.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[var(--bg-skeleton)]">
                <User className="h-20 w-20 text-neutral-400" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1 text-center md:text-left">
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              艺术家
            </p>
            <h1 className="mt-1 text-3xl font-bold text-neutral-900 dark:text-neutral-100">
              {artist.name}
            </h1>

            {artist.aliases && artist.aliases.length > 0 && (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                别名：{artist.aliases.join("、")}
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-neutral-600 dark:text-neutral-300 md:justify-start">
              <span>{artist.albumCount} 张专辑</span>
              <span className="text-neutral-400">·</span>
              <span>{artist.trackCount} 首曲目</span>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="relative z-10 px-6 pb-6">
        {/* Biography */}
        {artist.biography && (
          <div className="mb-8">
            <SectionTitle>简介</SectionTitle>
            <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
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
                  navigate(`/dashboard/library/${id}/music/album/${album.id}`)
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
