import { useQueryClient } from "@tanstack/react-query";
import { Checkbox, Modal } from "@tokiomo/components";
import { FolderSync, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { api } from "@/generated/rust-api";
import type { MenuBarConfig } from "@/system";
import { useMenuBar, useMessage, useWindowNav } from "@/system";

export default function MusicMenuBar({ children }: { children: ReactNode }) {
  const { metadata, navigate } = useWindowNav();
  const id = metadata.appId as string | undefined;
  const message = useMessage();
  const qc = useQueryClient();

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncClearData, setSyncClearData] = useState(false);

  const syncMutation = api.app.sync.useMutation({
    onSuccess: () => {
      message.success("同步已开始");
      api.app.listAlbums.invalidate(qc);
      api.app.listArtists.invalidate(qc);
      api.app.listTracks.invalidate(qc);
    },
    onError: (e) => message.error(e.message || "同步失败"),
  });

  const menuBarConfig: MenuBarConfig | null = useMemo(() => {
    if (!id) return null;
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
                api.app.listAlbums.invalidate(qc);
                api.app.listArtists.invalidate(qc);
                api.app.listTracks.invalidate(qc);
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
        appId: id,
        searchType: "music" as const,
        onSelect: (item) =>
          navigate(`/albums/${item.id}`, item.title ?? "Album"),
      },
    };
  }, [id, qc, navigate, syncMutation.isPending]);

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
          if (!id) return;
          try {
            await syncMutation.mutateAsync({
              id,
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
