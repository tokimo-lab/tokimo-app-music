import { useMediaCenter } from "@tokimo/sdk/react";
import { Dropdown } from "@tokimo/ui";
import { Check, ChevronDown } from "lucide-react";
import { useAppCtx } from "../../AppContext";
import { selectMusicQuality, useMusicQuality } from "../../shell/music-quality";

export function MusicQualityMenu() {
  const ctx = useAppCtx();
  const { api: media, snapshot } = useMediaCenter(ctx);
  const quality = useMusicQuality();
  const activeFileId =
    snapshot?.providerId === "local-music"
      ? snapshot.queue[snapshot.currentIndex]?.id
      : null;
  if (!activeFileId) return null;
  const playback = quality.fileId === activeFileId ? quality.playback : null;
  const options = playback?.options ?? [
    { id: "original" as const, label: "原音", bitrate: null },
  ];
  const actual = playback?.effectiveProfile ?? "original";
  const label = options.find((option) => option.id === actual)?.label ?? "原音";
  return (
    <div
      className="flex shrink-0 flex-col items-center gap-0.5"
      title={quality.error ?? undefined}
    >
      <Dropdown
        trigger={["click"]}
        placement="top-end"
        disabled={!media || !playback}
        menu={{
          items: options.map((option) => ({
            key: option.id,
            label: option.label,
            icon:
              option.id === actual ? <Check className="h-4 w-4" /> : undefined,
            onClick: () => {
              if (media) void selectMusicQuality(option.id, media);
            },
          })),
        }}
      >
        <button
          type="button"
          aria-label={`播放音质：${label}`}
          disabled={!media || !playback}
          className="flex max-w-44 cursor-pointer items-center gap-1 rounded-md border border-base bg-surface-overlay px-2 py-1 text-xs text-fg-primary disabled:cursor-default"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </Dropdown>
      {(quality.loading || snapshot?.isLoading) && (
        <span className="text-[10px] text-fg-muted" role="status">
          音质加载中…
        </span>
      )}
      {quality.error && (
        <span
          className="max-w-44 truncate text-[10px] text-state-danger-text"
          role="alert"
        >
          播放加载失败
        </span>
      )}
    </div>
  );
}
