import { useQueryClient } from "@tanstack/react-query";
import { Checkbox, Modal } from "@tokiomo/components";
import { FolderSync, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { api } from "@/generated/rust-api";
import type { MenuBarConfig } from "@/system";
import { useMenuBar, useMessage, useWindowNav } from "@/system";

export default function MusicMenuBar({ children }: { children: ReactNode }) {
  const { navigate } = useWindowNav();
  const musicId = localStorage.getItem("music-active-library") ?? undefined;
  const message = useMessage();
  const qc = useQueryClient();

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncClearData, setSyncClearData] = useState(false);

  const syncMutation = api.music.sync.useMutation({
    onSuccess: () => {
      message.success("同步已开始");
      api.music.listAlbums.invalidate(qc);
      api.music.listArtists.invalidate(qc);
      api.music.listTracks.invalidate(qc);
    },
    onError: (e) => message.error(e.message || "同步失败"),
  });

  const menuBarConfig: MenuBarConfig | null = useMemo(() => {
    if (!musicId) return null;
    return {
      menus: [
        {
          key: "actions",
          label: "操作",
          items: [
            {
              key: "refresh",
              label: "刷新",
              icon: <RefreshCw size={14} />,
              onClick: () => {
                api.music.listAlbums.invalidate(qc);
                api.music.listArtists.invalidate(qc);
                api.music.listTracks.invalidate(qc);
              },
            },
            { type: "divider" as const },
            {
              key: "sync",
              label: "同步资料库",
              icon: <FolderSync size={14} />,
              disabled: syncMutation.isPending,
              onClick: () => {
                setSyncClearData(false);
                setSyncModalOpen(true);
              },
            },
          ],
        },
      ],
      search: {
        appId: musicId,
        searchType: "music" as const,
        onSelect: (item) =>
          navigate(`/albums/${item.id}`, item.title ?? "Album"),
      },
    };
  }, [musicId, qc, navigate, syncMutation.isPending]);

  useMenuBar(menuBarConfig);

  return (
    <>
      {children}

      <Modal
        open={syncModalOpen}
        title="同步资料库"
        okText="开始同步"
        cancelText="取消"
        confirmLoading={syncMutation.isPending}
        onCancel={() => setSyncModalOpen(false)}
        onOk={async () => {
          if (!musicId) return;
          try {
            await syncMutation.mutateAsync({
              id: musicId,
              clearData: syncClearData,
            });
          } finally {
            setSyncModalOpen(false);
          }
        }}
      >
        <Checkbox
          checked={syncClearData}
          onChange={(e) => setSyncClearData(e.target.checked)}
        >
          清空数据重新同步
        </Checkbox>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          勾选后将删除所有音乐数据并重新完整同步，适合修复数据异常。
        </p>
      </Modal>
    </>
  );
}
