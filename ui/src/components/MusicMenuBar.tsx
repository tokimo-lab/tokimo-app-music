import { useQueryClient } from "@tanstack/react-query";
import { Checkbox, Modal } from "@tokimo/ui";
import { FolderSync, RefreshCw } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { api } from "../api/client";
import { useMusicI18n } from "../i18n";
import type { MenuBarConfig } from "../shell/hooks";
import { useMenuBar, useMessage, useWindowNav } from "../shell/hooks";

export default function MusicMenuBar({ children }: { children: ReactNode }) {
  const { navigate, params } = useWindowNav();
  const musicId = params.libraryId ?? undefined;
  const message = useMessage();
  const qc = useQueryClient();
  const { t } = useMusicI18n();

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncClearData, setSyncClearData] = useState(false);

  const syncMutation = api.music.sync.useMutation({
    onSuccess: () => {
      message.success(t("syncStarted"));
      // Use refetchQueries to force refetch even for disabled queries (e.g. when syncing=true)
      qc.refetchQueries({ queryKey: ["music"], type: "all" });
    },
    onError: (e) => message.error(e.message || t("syncFailed")),
  });

  const menuBarConfig: MenuBarConfig | null = useMemo(() => {
    if (!musicId) return null;
    return {
      menus: [
        {
          key: "actions",
          label: t("menuActions"),
          items: [
            {
              key: "refresh",
              label: t("menuRefresh"),
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
              label: t("menuSyncLibrary"),
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
          navigate(
            `/albums/${item.id}`,
            `TokimoMusic · ${item.title ?? "Album"}`,
          ),
      },
    };
  }, [musicId, qc, navigate, syncMutation.isPending, t]);

  useMenuBar(menuBarConfig);

  return (
    <>
      {children}

      <Modal
        open={syncModalOpen}
        title={t("syncModalTitle")}
        okText={t("syncModalOk")}
        cancelText={t("commonCancel")}
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
          {t("syncClearData")}
        </Checkbox>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {t("syncClearDataHint")}
        </p>
      </Modal>
    </>
  );
}
