import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import type { ShellApi, ShellWindowHandle } from "@tokimo/sdk";
import {
  Button,
  ConfigProvider,
  Empty,
  Spin,
  ToastProvider,
  zhCN,
} from "@tokimo/ui";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type MusicOutput } from "../api/client";
import { getBridge } from "../modal-bridge";

interface DraftSource {
  sourceId: string;
  rootPath: string;
  sourceName?: string | null;
  sourceType?: string | null;
}

function sourceLabel(source: DraftSource): string {
  return source.sourceName ?? (source.rootPath || source.sourceId);
}

function LibraryRow({
  library,
  onMutated,
}: {
  library: MusicOutput;
  onMutated: () => void;
}) {
  const qc = useQueryClient();
  const deleteMutation = api.music.delete.useMutation({
    onSuccess: () => {
      api.music.list.invalidate(qc);
      onMutated();
    },
  });
  return (
    <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-secondary px-4 py-3">
      <div>
        <div className="font-medium text-fg-primary">{library.name}</div>
        <div className="mt-1 text-xs text-fg-muted">
          {library.rootPath || "未绑定来源"}
        </div>
      </div>
      <button
        type="button"
        className="cursor-pointer rounded-lg p-2 text-fg-muted hover:bg-red-500/10 hover:text-red-500"
        onClick={() => {
          if (window.confirm(`删除音乐库"${library.name}"？`)) {
            deleteMutation.mutate(library.id);
          }
        }}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function MusicLibraryEditorWindow({
  win,
}: {
  win: ShellWindowHandle;
}) {
  const bridgeId =
    typeof win.metadata.bridgeId === "string" ? win.metadata.bridgeId : "";
  // Snapshot once; do not clear via effect cleanup because StrictMode remounts.
  const [bridge] = useState(() => (bridgeId ? getBridge(bridgeId) : undefined));
  const [queryClient] = useState(() => new QueryClient());

  if (bridge?.kind !== "editor") {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={zhCN}>
        <ToastProvider>
          <EditorContent shell={bridge.shell} onMutated={bridge.onMutated} />
        </ToastProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

function EditorContent({
  shell,
  onMutated,
}: {
  shell: ShellApi;
  onMutated: () => void;
}) {
  const qc = useQueryClient();
  const { data: libraries, isLoading } = api.music.list.useQuery();
  const [name, setName] = useState("");
  const [source, setSource] = useState<DraftSource | null>(null);

  const createMutation = api.music.create.useMutation({
    onSuccess: () => {
      setName("");
      setSource(null);
      api.music.list.invalidate(qc);
      onMutated();
    },
  });

  const pickSource = async () => {
    const picked = await shell.pickStorageBinding({
      title: "选择音乐目录",
    });
    if (!picked) return;
    setSource({
      sourceId: picked.sourceId,
      rootPath: picked.path,
      sourceName: picked.sourceName,
      sourceType: picked.sourceType,
    });
    if (!name.trim()) setName(picked.sourceName ?? "音乐库");
  };

  const createLibrary = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createMutation.mutate({
      name: trimmed,
      rootPath: source?.rootPath ?? "",
      sourceId: source?.sourceId,
      sourceType: source?.sourceType ?? undefined,
    });
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto bg-bg-primary p-6 text-fg-primary">
      <section className="rounded-2xl border border-border-subtle bg-bg-secondary/60 p-4">
        <h2 className="text-base font-semibold">新建音乐库</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="音乐库名称"
            className="rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 text-sm outline-none focus:border-rose-500"
          />
          <Button
            onClick={() => void pickSource()}
            icon={<FolderOpen className="h-4 w-4" />}
          >
            选择目录
          </Button>
        </div>
        <div className="mt-3 text-sm text-fg-muted">
          {source
            ? `已选择：${sourceLabel(source)}`
            : "可先创建空音乐库，稍后再绑定来源。"}
        </div>
        <div className="mt-4">
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={createMutation.isPending}
            onClick={createLibrary}
            icon={<Plus className="h-4 w-4" />}
          >
            创建音乐库
          </Button>
        </div>
      </section>

      <section className="min-h-0 flex-1">
        <h2 className="mb-3 text-base font-semibold">音乐库列表</h2>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Spin />
          </div>
        ) : libraries && libraries.length > 0 ? (
          <div className="space-y-3">
            {libraries.map((library) => (
              <LibraryRow
                key={library.id}
                library={library}
                onMutated={onMutated}
              />
            ))}
          </div>
        ) : (
          <Empty description="暂无音乐库" />
        )}
      </section>
    </div>
  );
}
