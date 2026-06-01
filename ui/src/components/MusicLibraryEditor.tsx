/**
 * MusicLibraryEditor — inline editor for creating / editing a music library.
 */

import { useQueryClient } from "@tanstack/react-query";
import type { ShellApi } from "@tokimo/sdk";
import {
  type AvatarData,
  AvatarPicker,
  Button,
  Form,
  type FormInstance,
  Input,
  Modal,
  parseAvatar,
  ScrollArea,
  Select,
  StorageBindingsField,
  useToast,
  type VideoBinding,
} from "@tokimo/ui";
import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type MusicOutput } from "../api/client";
import { useVfsBrowse } from "../hooks/useVfsBrowse";

const MUSIC_TYPES = [
  { value: "music", label: "音乐" },
  { value: "audiobook", label: "有声书" },
  { value: "podcast", label: "播客" },
] as const;

const COUNTRIES = [
  { value: "", label: "自动检测" },
  { value: "CN", label: "中国" },
  { value: "TW", label: "台湾" },
  { value: "HK", label: "香港" },
  { value: "JP", label: "日本" },
  { value: "KR", label: "韩国" },
  { value: "US", label: "美国" },
  { value: "GB", label: "英国" },
] as const;

const LANGUAGES = [
  { value: "", label: "自动检测" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英语" },
  { value: "ja", label: "日语" },
  { value: "ko", label: "韩语" },
] as const;

const METADATA_SOURCES = [
  { value: "netease", label: "网易云音乐", description: "中文音乐覆盖最全" },
  { value: "qqmusic", label: "QQ 音乐", description: "中文音乐覆盖最全" },
  { value: "musicbrainz", label: "MusicBrainz", description: "全球音乐数据库" },
  { value: "lastfm", label: "Last.fm", description: "社区驱动的音乐数据库" },
  { value: "spotify", label: "Spotify", description: "需要 API Key" },
] as const;

interface MusicLibraryEditorProps {
  musicId?: string;
  shell: ShellApi;
  onSaved?: (savedId: string) => void;
  onDeleted?: () => void;
  onCancel?: () => void;
}

export default function MusicLibraryEditor({
  musicId,
  shell,
  onSaved,
  onDeleted,
  onCancel,
}: MusicLibraryEditorProps) {
  const toast = useToast();
  const onBrowse = useVfsBrowse(shell);
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const { data: libraries = [] } = api.music.list.useQuery();
  const { data: vfsSources = [] } = api.vfs.list.useQuery();
  const music = musicId ? libraries.find((c) => c.id === musicId) : undefined;

  const [avatar, setAvatar] = useState<AvatarData | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  // Reset state when musicId changes
  const prevId = useRef(musicId);
  useEffect(() => {
    if (prevId.current !== musicId) {
      prevId.current = musicId;
      setDeleteOpen(false);
      setDeleteInput("");
    }
  }, [musicId]);

  // Pre-fill form
  useEffect(() => {
    if (music) {
      const settings = (music as Record<string, unknown>).settings as Record<string, unknown> | null;
      const metadata = settings?.metadata as Record<string, unknown> | null;
      form.setFieldsValue({
        type: music.type,
        name: music.name,
        description: music.description ?? "",
        country: (metadata?.country as string) ?? "",
        language: (metadata?.language as string) ?? "",
        metadataSources: (metadata?.sources as string[]) ?? ["netease", "qqmusic", "musicbrainz"],
        autoDetect: metadata?.autoDetect !== false ? "true" : "false",
      });
      setAvatar(parseAvatar(music.avatar));
    } else {
      form.resetFields();
      form.setFieldsValue({
        type: "music",
        metadataSources: ["netease", "qqmusic", "musicbrainz"],
        autoDetect: "true",
      });
      setAvatar({ type: "icon", icon: "lucide:music", color: "#ec4899" });
    }
  }, [music, form]);

  // ── Mutations ──
  const createMutation = api.music.create.useMutation({
    onSuccess: (data) => {
      toast.success("音乐库已创建");
      api.music.list.invalidate(qc);
      onSaved?.(data.id);
    },
    onError: (e) => toast.error(e.message || "创建失败"),
  });

  const updateMutation = api.music.update.useMutation({
    onSuccess: (data) => {
      toast.success("已保存");
      api.music.list.invalidate(qc);
      onSaved?.(data.id);
    },
    onError: (e) => toast.error(e.message || "保存失败"),
  });

  const deleteMutation = api.music.delete.useMutation({
    onSuccess: () => {
      toast.success("音乐库已删除");
      api.music.list.invalidate(qc);
      setDeleteOpen(false);
      onDeleted?.();
    },
    onError: (e) => toast.error(e.message || "删除失败"),
  });

  const handleSave = useCallback(async () => {
    const values = await form.validateFields();
    const rawBindings =
      (form.getFieldValue("bindings") as VideoBinding[] | undefined) ?? [];
    const sources = rawBindings
      .filter((b) => b.sourceId && b.rootPath)
      .map((b, i) => ({
        sourceId: b.sourceId,
        rootPath: b.rootPath,
        sortOrder: i,
        isDefaultDownload: b.isDefaultDownload ?? i === 0,
      }));

    // Build metadata settings
    const metadata: Record<string, unknown> = {};
    if (values.country) metadata.country = values.country;
    if (values.language) metadata.language = values.language;
    if (values.metadataSources?.length) metadata.sources = values.metadataSources;
    metadata.autoDetect = values.autoDetect !== "false";

    const settings = Object.keys(metadata).length > 0 ? { metadata } : null;

    if (music) {
      await updateMutation.mutateAsync({
        id: music.id,
        name: values.name as string,
        avatar: avatar as Record<string, unknown> | null,
        description: (values.description as string) || null,
        sources,
        settings,
      });
    } else {
      await createMutation.mutateAsync({
        name: values.name as string,
        type: (values.type as string) || "music",
        avatar: avatar as Record<string, unknown> | null,
        description: (values.description as string) || null,
        sources,
        settings,
      });
    }
  }, [form, music, avatar, createMutation, updateMutation]);

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
          {/* 基本信息 */}
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

          {/* 路径配置 */}
          <div className="rounded-lg border border-border-base p-5">
            <h4 className="mb-4 text-sm font-semibold text-fg-primary">
              路径配置
            </h4>
            <StorageBindingsField
              sources={vfsSources}
              form={form}
              initialSources={music?.sources}
              onBrowse={onBrowse}
            />
          </div>

          {/* 元数据设置 */}
          <div className="rounded-lg border border-border-base p-5">
            <h4 className="mb-4 text-sm font-semibold text-fg-primary">
              元数据设置
            </h4>
            <p className="mb-4 text-xs text-fg-muted">
              配置音乐元数据的刮削策略。系统会根据设置选择最佳的数据源来获取专辑信息、封面图片等。
            </p>

            <Form.Item name="country" label="国家/地区">
              <Select
                options={COUNTRIES.map((c) => ({
                  label: c.label,
                  value: c.value,
                }))}
                placeholder="自动检测"
              />
            </Form.Item>

            <Form.Item name="language" label="语言偏好">
              <Select
                options={LANGUAGES.map((l) => ({
                  label: l.label,
                  value: l.value,
                }))}
                placeholder="自动检测"
              />
            </Form.Item>

            <Form.Item
              name="metadataSources"
              label="数据源优先级"
              tooltip="选择多个数据源，系统会按优先级依次尝试"
            >
              <Select
                mode="multiple"
                options={METADATA_SOURCES.map((s) => ({
                  label: (
                    <div>
                      <div>{s.label}</div>
                      <div className="text-xs text-fg-muted">{s.description}</div>
                    </div>
                  ),
                  value: s.value,
                }))}
                placeholder="选择数据源"
              />
            </Form.Item>

            <Form.Item name="autoDetect" label="自动检测语言" className="!mb-0">
              <Select
                options={[
                  { label: "是 - 根据音乐文件自动判断", value: "true" },
                  { label: "否 - 使用上面设置的语言偏好", value: "false" },
                ]}
                placeholder="是"
              />
            </Form.Item>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border-base px-5 py-3">
          <div>
            {music && (
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={14} className="mr-1" />
                删除
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" onClick={onCancel}>
              取消
            </Button>
            <Button loading={isPending} onClick={() => void handleSave()}>
              {music ? "保存" : "创建"}
            </Button>
          </div>
        </div>
      </Form>

      {/* Delete confirm */}
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
          >
            确认删除
          </Button>
        </div>
      </div>
    </Modal>
  );
}
