import { useQueryClient } from "@tanstack/react-query";
import { Checkbox, Modal } from "@tokimo/ui";
import { FolderSync, RefreshCw } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { api } from "../api/client";
import { useMusicI18n } from "../i18n";
import type { MenuBarConfig } from "../shell/hooks";
import { useMenuBar, useMessage, useWindowNav } from "../shell/hooks";

interface MusicLibraryActions {
  refresh: () => void;
  openSync: () => void;
  syncing: boolean;
}

const LibraryActionsContext = createContext<MusicLibraryActions | null>(null);

export function useMusicLibraryActions() {
  const actions = useContext(LibraryActionsContext);
  if (!actions) throw new Error("MusicLibraryActions requires MusicMenuBar");
  return actions;
}

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

  const refresh = useCallback(() => {
    api.music.list.invalidate(qc);
    api.music.listAlbums.invalidate(qc);
    api.music.listArtists.invalidate(qc);
    api.music.listTracks.invalidate(qc);
  }, [qc]);
  const openSync = useCallback(() => {
    if (syncMutation.isPending) return;
    setSyncClearData(false);
    setSyncModalOpen(true);
  }, [syncMutation.isPending]);

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
              onClick: refresh,
            },
            { type: "divider" as const },
            {
              key: "sync",
              label: t("menuSyncLibrary"),
              icon: <FolderSync size={14} />,
              disabled: syncMutation.isPending,
              onClick: openSync,
            },
          ],
        },
      ],
      search: {
        appId: musicId,
        searchType: "music" as const,
        onSelect: (item) =>
          navigate(
            `/library/${musicId}/albums/${item.id}`,
            `TokimoMusic · ${item.title ?? "Album"}`,
          ),
      },
    };
  }, [musicId, navigate, refresh, openSync, syncMutation.isPending, t]);

  useMenuBar(menuBarConfig);

  return (
    <LibraryActionsContext.Provider
      value={{ refresh, openSync, syncing: syncMutation.isPending }}
    >
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
        <p className="mt-2 text-xs text-[var(--color-fg-muted)]">
          {t("syncClearDataHint")}
        </p>
      </Modal>
    </LibraryActionsContext.Provider>
  );
}
