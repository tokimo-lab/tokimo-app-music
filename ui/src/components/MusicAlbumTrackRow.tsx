import { Dropdown } from "@tokimo/ui";
import { ListPlus, MoreHorizontal, Pause, Play, RefreshCw } from "lucide-react";
import { api } from "../api/client";
import type { MusicTrackOutput } from "../lib/types";
import { formatDuration } from "../pages/music-shared";
import { useMusicPlayer } from "../shell/hooks";

export function MusicAlbumTrackRow({
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
  const scrapeLyrics = api.music.scrapeTrackLyrics.useMutation();

  return (
    <div
      className={`group flex w-full items-center gap-1 rounded-md px-2 py-1 @min-[640px]/music-detail:gap-3 @min-[640px]/music-detail:px-3 ${
        isActive ? "bg-accent/10" : "hover:bg-fill-tertiary"
      }`}
    >
      <button
        type="button"
        aria-label={`${isActive && isPlaying ? "暂停" : "播放"} ${track.title}`}
        onClick={() => {
          if (isActive) togglePlay();
          else playTracks(tracks, startIndex);
        }}
        className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2 text-left @min-[640px]/music-detail:gap-3"
      >
        <span className="w-6 shrink-0 text-center text-sm text-fg-muted @min-[640px]/music-detail:w-8">
          {isActive ? (
            isPlaying ? (
              <Pause className="mx-auto h-4 w-4 text-accent-text" />
            ) : (
              <Play
                className="mx-auto h-4 w-4 text-accent-text"
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
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-sm font-medium ${isActive ? "text-accent-text" : "text-fg-primary"}`}
          >
            {track.title}
          </span>
          {track.artistName && (
            <span className="block truncate text-xs text-fg-muted">
              {track.artistName}
            </span>
          )}
        </span>
        <span className="w-[42px] shrink-0 text-right text-xs tabular-nums text-fg-muted @min-[640px]/music-detail:w-[50px]">
          {formatDuration(track.duration)}
        </span>
      </button>
      <button
        type="button"
        title="添加到队列"
        aria-label={`添加 ${track.title} 到队列`}
        className="hidden h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted opacity-0 transition-opacity hover:bg-fill-tertiary focus-visible:opacity-100 @min-[640px]/music-detail:flex @min-[640px]/music-detail:group-hover:opacity-100"
        onClick={() => addToQueue([track])}
      >
        <ListPlus className="h-4 w-4" />
      </button>
      <Dropdown
        trigger={["click"]}
        placement="bottom-end"
        dropdownRender={(menu) => (
          <div className="[&_button]:min-h-11 @min-[640px]/music-detail:[&_button]:min-h-0">
            {menu}
          </div>
        )}
        menu={{
          items: [
            {
              key: "queue",
              label: "添加到队列",
              icon: <ListPlus />,
              onClick: () => addToQueue([track]),
            },
            {
              key: "lyrics",
              label: scrapeLyrics.isPending ? "刮削中..." : "重新刮削歌词",
              icon: <RefreshCw />,
              disabled: scrapeLyrics.isPending,
              onClick: () => scrapeLyrics.mutate(track.id),
            },
          ],
        }}
      >
        <button
          type="button"
          aria-label={`${track.title}：更多操作`}
          title="更多操作"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-opacity hover:bg-fill-tertiary focus-visible:opacity-100 @min-[640px]/music-detail:h-7 @min-[640px]/music-detail:w-7 @min-[640px]/music-detail:opacity-0 @min-[640px]/music-detail:group-hover:opacity-100"
        >
          <MoreHorizontal className="h-5 w-5 @min-[640px]/music-detail:h-4 @min-[640px]/music-detail:w-4" />
        </button>
      </Dropdown>
    </div>
  );
}
