import { AppSidebar, CircularProgress, Tooltip } from "@tokimo/ui";
import {
  FolderSync,
  PanelLeft,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";
import type { MusicOutput } from "../api/client";
import { getAvatarColor, getAvatarIcon } from "../shared/avatar-utils";
import { AppIcon } from "../shared/components/icons";
import { useMusicLibraryActions } from "./MusicMenuBar";

export default function MusicSidebar({
  libraries,
  activeId,
  onSelect,
  collapsed,
  onCreateClick,
  onSettingsClick,
  syncProgress,
  onToggleCollapse,
  settingsActive = false,
  mobile = false,
}: {
  libraries: MusicOutput[];
  activeId: string | null;
  onSelect: (id: string) => void;
  collapsed?: boolean;
  onCreateClick: () => void;
  onSettingsClick: () => void;
  syncProgress?: Record<string, { isActive: boolean; pct: number }>;
  onToggleCollapse?: () => void;
  /** When true, the settings (⚙) button shows a highlighted state. */
  settingsActive?: boolean;
  mobile?: boolean;
}) {
  const { refresh, openSync, syncing } = useMusicLibraryActions();
  const activeScan = activeId ? syncProgress?.[activeId] : undefined;
  const actions = [
    {
      key: "create",
      icon: <Plus />,
      label: "新建音乐库",
      onClick: onCreateClick,
    },
    {
      key: "settings",
      icon: <Settings />,
      label: "音乐库设置",
      onClick: onSettingsClick,
    },
    {
      key: "refresh",
      icon: <RefreshCw />,
      label: "刷新音乐库",
      onClick: refresh,
    },
    {
      key: "sync",
      icon: <FolderSync />,
      label: activeScan?.isActive
        ? `扫描中 ${activeScan.pct}%`
        : syncing
          ? "正在开始扫描"
          : "扫描音乐库",
      onClick: () => {
        if (!activeScan?.isActive) openSync();
      },
    },
  ].filter(
    (action) =>
      activeId || (action.key !== "settings" && action.key !== "sync"),
  );
  const sections = [
    {
      items: libraries.map((lib) => {
        const sp = syncProgress?.[lib.id];
        const avatarId = typeof lib.avatar === "string" ? lib.avatar : null;
        return {
          key: lib.id,
          icon: (
            <AppIcon
              icon={getAvatarIcon(avatarId) || lib.name}
              color={getAvatarColor(avatarId)}
              size={24}
            />
          ),
          collapsedIcon: sp?.isActive ? (
            <span className="relative flex h-8 w-8 items-center justify-center">
              <AppIcon
                icon={getAvatarIcon(avatarId)}
                color={getAvatarColor(avatarId)}
                size={24}
              />
              <CircularProgress
                value={sp.pct}
                size={32}
                strokeWidth={2}
                showText={false}
                className="absolute left-0 top-0"
              />
            </span>
          ) : undefined,
          label: lib.name,
          extra: (() => {
            if (collapsed && !mobile) return undefined;
            return sp?.isActive ? (
              <span className="flex items-center gap-2 text-xs text-fg-muted">
                <CircularProgress value={sp.pct} size={24} />
                扫描中 {sp.pct}%
              </span>
            ) : lib.itemCount > 0 ? (
              <span className="text-[10px] tabular-nums text-fg-muted">
                {lib.itemCount}
              </span>
            ) : null;
          })(),
        };
      }),
    },
  ];

  const collapsedFooter = (
    <div className="flex flex-col items-center gap-1">
      <Tooltip title="新建音乐库" placement="right">
        <button
          type="button"
          onClick={onCreateClick}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </Tooltip>
      {activeId && (
        <Tooltip title="音乐库设置" placement="right">
          <button
            type="button"
            onClick={onSettingsClick}
            className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition-all ${
              settingsActive
                ? "bg-black/[0.08] text-fg-primary dark:bg-white/[0.08]"
                : "text-fg-muted hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
      <Tooltip title="展开侧边栏" placement="right">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );

  const fullFooter = (
    <div className="flex items-center gap-1">
      <Tooltip title="新建音乐库">
        <button
          type="button"
          onClick={onCreateClick}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </Tooltip>
      {activeId && (
        <Tooltip title="音乐库设置">
          <button
            type="button"
            onClick={onSettingsClick}
            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-all ${
              settingsActive
                ? "bg-black/[0.08] text-fg-primary dark:bg-white/[0.08]"
                : "text-fg-muted hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        </Tooltip>
      )}
      <Tooltip title="收起侧边栏">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-auto flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-fg-muted transition-all hover:bg-black/[0.08] hover:text-fg-secondary dark:hover:bg-white/[0.08]"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );

  return (
    <AppSidebar
      sections={sections}
      activeKey={activeId ?? undefined}
      onSelect={onSelect}
      collapsed={collapsed}
      mobile={
        mobile
          ? {
              title: "音乐库",
              closeLabel: "关闭音乐库选择",
              footerActions: actions,
            }
          : undefined
      }
      footer={
        <>
          {collapsed ? collapsedFooter : fullFooter}
          {!collapsed && (
            <div className="mt-2 space-y-1">
              {actions
                .filter(
                  (action) => action.key === "refresh" || action.key === "sync",
                )
                .map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    onClick={action.onClick}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs text-fg-secondary hover:bg-surface-overlay-hover [&>svg]:size-4"
                  >
                    {action.icon}
                    {action.label}
                  </button>
                ))}
            </div>
          )}
        </>
      }
    />
  );
}
