import { cn } from "@tokimo/ui";
import { useCallback, useMemo } from "react";

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

const FAVORITE_OPTIONS: FilterOption[] = [
  { label: "仅收藏", value: "true" },
];

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
        "cursor-pointer whitespace-nowrap rounded-md px-3 py-1 text-[13px] font-medium transition-colors",
        active
          ? "bg-[var(--accent)] text-white"
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
}

export default function MusicFilterPanel({
  filters,
  onChange,
  genreOptions,
  activeTab,
}: MusicFilterPanelProps) {
  

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

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-2 py-1.5">
          <span className="w-14 shrink-0 pt-1 text-[13px] font-semibold text-fg-secondary">
            {row.label}
          </span>
          <div className="flex flex-wrap items-center gap-1">
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
}
