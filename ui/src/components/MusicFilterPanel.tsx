import { cn, Drawer } from "@tokimo/ui";
import { SlidersHorizontal, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface MusicFilters {
  sortBy: string;
  genre: string;
  favorite: string;
}

export const EMPTY_MUSIC_FILTERS: MusicFilters = {
  sortBy: "",
  genre: "",
  favorite: "",
};

interface FilterOption {
  label: string;
  value: string;
}

interface FilterRow {
  key: string;
  label: string;
  options: readonly FilterOption[];
}

// ── Sort options per tab ─────────────────────────────────────────────────────

export const ALBUM_SORT_OPTIONS: FilterOption[] = [
  { label: "最近添加", value: "addedAt" },
  { label: "标题 A-Z", value: "title_asc" },
  { label: "标题 Z-A", value: "title_desc" },
  { label: "年份最新", value: "year_desc" },
  { label: "年份最早", value: "year_asc" },
];

export const ARTIST_SORT_OPTIONS: FilterOption[] = [
  { label: "最近添加", value: "addedAt" },
  { label: "名称 A-Z", value: "name_asc" },
  { label: "名称 Z-A", value: "name_desc" },
];

export const TRACK_SORT_OPTIONS: FilterOption[] = [
  { label: "最近添加", value: "addedAt" },
  { label: "标题 A-Z", value: "title_asc" },
  { label: "标题 Z-A", value: "title_desc" },
];

const FAVORITE_OPTIONS: FilterOption[] = [{ label: "仅收藏", value: "true" }];

// ── Pill ─────────────────────────────────────────────────────────────────────

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer max-w-full truncate min-h-11 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-accent text-fg-on-accent"
          : "text-fg-secondary hover:text-fg-primary",
      )}
    >
      {label}
    </button>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

type TabKey = "albums" | "artists" | "tracks";

interface MusicFilterPanelProps {
  filters: MusicFilters;
  onChange: (filters: MusicFilters) => void;
  genreOptions: readonly string[];
  activeTab: TabKey;
  mobile?: boolean;
}

export default function MusicFilterPanel({
  filters,
  onChange,
  genreOptions,
  activeTab,
  mobile = false,
}: MusicFilterPanelProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  const focusDialog = useCallback(
    (element: HTMLDivElement | null) => element?.focus(),
    [],
  );
  const handleChange = useCallback(
    (key: keyof MusicFilters, value: string) => {
      const next = { ...filters, [key]: filters[key] === value ? "" : value };
      onChange(next);
    },
    [filters, onChange],
  );

  const sortOptions =
    activeTab === "albums"
      ? ALBUM_SORT_OPTIONS
      : activeTab === "artists"
        ? ARTIST_SORT_OPTIONS
        : TRACK_SORT_OPTIONS;

  const rows: FilterRow[] = useMemo(() => {
    const r: FilterRow[] = [
      {
        key: "sortBy",
        label: "排序",
        options: sortOptions,
      },
    ];
    // Genre filter on albums & tracks (tracks have genre field, albums filter via tracks)
    if (
      (activeTab === "albums" || activeTab === "tracks") &&
      genreOptions.length > 0
    ) {
      r.push({
        key: "genre",
        label: "类型",
        options: genreOptions.map((g) => ({ label: g, value: g })),
      });
    }
    // Favorite filter on albums only
    if (activeTab === "albums") {
      r.push({
        key: "favorite",
        label: "收藏",
        options: FAVORITE_OPTIONS,
      });
    }
    return r;
  }, [sortOptions, genreOptions, activeTab]);

  const panel = (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-2 py-1.5">
          <span className="w-14 shrink-0 pt-1 text-[13px] font-semibold text-fg-secondary">
            {row.label}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <FilterPill
              label="全部"
              active={!filters[row.key as keyof MusicFilters]}
              onClick={() => handleChange(row.key as keyof MusicFilters, "")}
            />
            {row.options.map((opt) => (
              <FilterPill
                key={opt.value}
                label={opt.label}
                active={filters[row.key as keyof MusicFilters] === opt.value}
                onClick={() =>
                  handleChange(row.key as keyof MusicFilters, opt.value)
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  if (!mobile) return panel;
  const selected = [
    sortOptions.find((option) => option.value === (filters.sortBy || "addedAt"))
      ?.label,
    filters.genre,
    filters.favorite ? "仅收藏" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-base bg-surface-raised px-3 text-left text-sm text-fg-primary"
      >
        <SlidersHorizontal className="size-4 shrink-0" />
        <span className="shrink-0 font-medium">筛选与排序</span>
        <span className="min-w-0 flex-1 truncate text-right text-xs text-fg-muted">
          {selected}
        </span>
      </button>
      <Drawer
        open={open}
        onClose={close}
        placement="bottom"
        height="min(80%, 560px)"
        closable={false}
        className="overflow-hidden rounded-t-2xl"
        bodyStyle={{ padding: 0, overflow: "hidden" }}
      >
        <div
          ref={focusDialog}
          role="dialog"
          aria-modal="true"
          aria-label="筛选与排序"
          tabIndex={-1}
          className="flex h-full min-h-0 flex-col bg-surface-overlay text-fg-primary outline-none"
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const buttons =
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not([disabled])",
              );
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === event.currentTarget)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
        >
          <div className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-base px-4">
            <h2 className="text-base font-semibold">筛选与排序</h2>
            <button
              type="button"
              onClick={close}
              aria-label="关闭筛选与排序"
              className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-fg-secondary hover:bg-surface-overlay-hover"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            {panel}
          </div>
          <div className="shrink-0 border-t border-base p-3">
            <button
              type="button"
              onClick={close}
              className="min-h-11 w-full cursor-pointer rounded-xl bg-accent px-4 text-sm font-medium text-fg-on-accent hover:bg-accent-hover"
            >
              完成
            </button>
          </div>
        </div>
      </Drawer>
    </>
  );
}
