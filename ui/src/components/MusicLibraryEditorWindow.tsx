/**
 * MusicLibraryEditorWindow — modal window for creating / editing a music library.
 */

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import type { ShellWindowHandle } from "@tokimo/sdk";
import {
  type AvatarData,
  AvatarPicker,
  Button,
  ConfigProvider,
  Form,
  type FormInstance,
  Input,
  Modal,
  parseAvatar,
  ScrollArea,
  Select,
  type StorageBinding,
  StorageBindingsField,
  ToastProvider,
  useToast,
  zhCN,
} from "@tokimo/ui";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type MusicOutput } from "../api/client";
import { getBridge } from "../modal-bridge";

const MUSIC_TYPES = [
  { value: "music", label: "音乐" },
  { value: "audiobook", label: "有声书" },
  { value: "podcast", label: "播客" },
] as const;

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
          <EditorContent
            musicId={bridge.musicId}
            win={win}
            onMutated={bridge.onMutated}
          />
        </ToastProvider>
      </ConfigProvider>
    </QueryClientProvider>
  );
}

function EditorContent({
  musicId,
  win,
  onMutated,
}: {
  musicId?: string;
  win: ShellWindowHandle;
  onMutated: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const { data: libraries = [] } = api.music.list.useQuery();
  const { data: vfsSources = [] } = api.vfs.list.useQuery();
  const music = musicId ? libraries.find((c) => c.id === musicId) : undefined;

  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [bindings, setBindings] = useState<StorageBinding[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const prevId = useRef(musicId);
  useEffect(() => {
    if (prevId.current !== musicId) {
      prevId.current = musicId;
      setDeleteOpen(false);
      setDeleteInput("");
    }
  }, [musicId]);

  useEffect(() => {
    if (music) {
      form.setFieldsValue({
        type: music.type,
        name: music.name,
        description: music.description ?? "",
      });
      setAvatar(parseAvatar(music.avatar));

      if (music.sources && music.sources.length > 0) {
        setBindings(
          music.sources.map((s) => ({
            sourceId: s.sourceId,
            rootPath: s.rootPath,
            isDefaultDownload: s.isDefaultDownload,
          })),
        );
      } else if (music.rootPath || music.sourceId) {
        setBindings([
          {
            sourceId: music.sourceId ?? "",
            rootPath: music.rootPath,
            isDefaultDownload: true,
          },
        ]);
      } else {
        setBindings([]);
      }
    } else {
      form.resetFields();
      form.setFieldsValue({ type: "music" });
      setAvatar({ type: "icon", icon: "lucide:music", color: "#ec4899" });
      setBindings([]);
    }
  }, [music, form]);

  const createMutation = api.music.create.useMutation({
    onSuccess: () => {
      toast.success("音乐库已创建");
      api.music.list.invalidate(qc);
      win.close();
      onMutated();
    },
    onError: (e) => toast.error(e.message || "创建失败"),
  });

  const updateMutation = api.music.update.useMutation({
    onSuccess: () => {
      toast.success("已保存");
      api.music.list.invalidate(qc);
      win.close();
      onMutated();
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const deleteMutation = api.music.delete.useMutation({
    onSuccess: () => {
      toast.success("音乐库已删除");
      api.music.list.invalidate(qc);
      setDeleteOpen(false);
      win.close();
      onMutated();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const handleSave = useCallback(async () => {
    const values = await form.validateFields();
    const sources = bindings
      .filter((b) => b.sourceId && b.rootPath)
      .map((b, i) => ({
        sourceId: b.sourceId,
        rootPath: b.rootPath,
        sortOrder: i,
        isDefaultDownload: b.isDefaultDownload ?? i === 0,
      }));

    const firstBinding = bindings[0];
    const legacyRootPath = firstBinding?.rootPath ?? "";
    const legacySourceId = firstBinding?.sourceId;
    const legacySourceType = undefined;

    if (music) {
      await updateMutation.mutateAsync({
        id: music.id,
        name: values.name as string,
        avatar: avatar as Record<string, unknown> | null,
        description: (values.description as string) || null,
        sources,
        rootPath: legacyRootPath,
        sourceId: legacySourceId,
        sourceType: legacySourceType,
      });
    } else {
      await createMutation.mutateAsync({
        name: values.name as string,
        type: (values.type as string) || "music",
        avatar: avatar as Record<string, unknown> | null,
        description: (values.description as string) || null,
        sources,
        rootPath: legacyRootPath,
        sourceId: legacySourceId,
        sourceType: legacySourceType,
      });
    }
  }, [form, music, avatar, bindings, createMutation, updateMutation]);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Form
        form={form as FormInstance}
        layout="vertical"
        autoComplete="off"
        className="flex min-h-0 flex-1 flex-col"
      >
        <ScrollArea
          direction="vertical"
          className="min-h-0 flex-1"
          innerClassName="space-y-5 px-5 py-5"
        >
          <div className="rounded-lg border border-border-base p-5">
            <h4 className="mb-4 text-sm font-semibold text-fg-primary">
              基本信息
            </h4>

            <div className="mb-5">
              <AvatarPicker value={avatar} onChange={setAvatar} size={80} />
            </div>

            {!music && (
              <Form.Item
                name="type"
                label="库类型"
                rules={[{ required: true, message: "请选择类型" }]}
              >
                <Select
                  options={MUSIC_TYPES.map((t) => ({
                    label: t.label,
                    value: t.value,
                  }))}
                />
              </Form.Item>
            )}

            <Form.Item
              name="name"
              label="名称"
              rules={[{ required: true, message: "请输入音乐库名称" }]}
            >
              <Input placeholder="如：我的音乐" size="large" />
            </Form.Item>

            <Form.Item name="description" label="描述" className="!mb-0">
              <Input.TextArea placeholder="可选描述" rows={3} />
            </Form.Item>
          </div>

          <div className="rounded-lg border border-border-base p-5">
            <h4 className="mb-4 text-sm font-semibold text-fg-primary">
              路径配置
            </h4>
            <StorageBindingsField
              value={bindings}
              onChange={setBindings}
              sources={vfsSources}
            />
          </div>
        </ScrollArea>

        <div className="flex shrink-0 items-center justify-between border-t border-border-base px-5 py-3">
          <div>
            {music && (
              <Button
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                className="cursor-pointer"
              >
                <Trash2 size={14} className="mr-1" />
                删除
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" onClick={() => win.close()}>
              取消
            </Button>
            <Button loading={isPending} onClick={() => void handleSave()}>
              {music ? "保存" : "创建"}
            </Button>
          </div>
        </div>
      </Form>

      {music && (
        <DeleteConfirmModal
          music={music}
          open={deleteOpen}
          deleteInput={deleteInput}
          setDeleteInput={setDeleteInput}
          onCancel={() => {
            setDeleteOpen(false);
            setDeleteInput("");
          }}
          onConfirm={() => deleteMutation.mutate(music.id)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}

function DeleteConfirmModal({
  music,
  open,
  deleteInput,
  setDeleteInput,
  onCancel,
  onConfirm,
  loading,
}: {
  music: MusicOutput;
  open: boolean;
  deleteInput: string;
  setDeleteInput: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Modal title="⚠️ 删除音乐库" open={open} onCancel={onCancel} footer={null}>
      <div className="space-y-4 pt-1">
        <p className="text-sm text-fg-secondary">
          此操作将永久删除{" "}
          <span className="font-semibold text-fg-primary">{music.name}</span>{" "}
          及其所有数据，
          <span className="font-semibold text-red-500">不可恢复</span>。
        </p>
        <Input
          value={deleteInput}
          onChange={(e) => setDeleteInput(e.target.value)}
          placeholder={music.name}
          onPressEnter={() => {
            if (deleteInput === music.name) onConfirm();
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="default" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="danger"
            disabled={deleteInput !== music.name}
            loading={loading}
            onClick={onConfirm}
            className="cursor-pointer"
          >
            确认删除
          </Button>
        </div>
      </div>
    </Modal>
  );
}
