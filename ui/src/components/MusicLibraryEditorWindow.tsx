/**
 * MusicLibraryEditorWindow — modal window wrapper for creating / editing a music library.
 * Adapted to sidecar bridge pattern.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ShellWindowHandle } from "@tokimo/sdk";
import { ConfigProvider, ToastProvider, zhCN } from "@tokimo/ui";
import { useState } from "react";
import { getBridge } from "../modal-bridge";
import MusicLibraryEditor from "./MusicLibraryEditor";

export default function MusicLibraryEditorWindow({
  win,
}: {
  win: ShellWindowHandle;
}) {
  const bridgeId =
    typeof win.metadata.bridgeId === "string" ? win.metadata.bridgeId : "";
  const [bridge] = useState(() => (bridgeId ? getBridge(bridgeId) : undefined));
  const [queryClient] = useState(() => new QueryClient());

  if (bridge?.kind !== "editor") {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN}>
        <ToastProvider>
          <MusicLibraryEditor
            musicId={bridge.musicId}
            onSaved={() => {
              bridge.onMutated();
              win.close();
            }}
            onDeleted={() => {
              bridge.onMutated();
              win.close();
            }}
            onCancel={() => win.close()}
          />
        </ToastProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
