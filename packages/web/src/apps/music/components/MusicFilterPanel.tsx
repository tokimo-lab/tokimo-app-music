import { cn } from "@tokimo/ui";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

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
  { label: "settings.library.sortAddedAt", value: "addedAt" },
  { label: "settings.library.sortTitleAsc", value: "title_asc" },
  { label: "settings.library.sortTitleDesc", value: "title_desc" },
  { label: "settings.library.sortYearDesc", value: "year_desc" },
  { label: "settings.library.sortYearAsc", value: "year_asc" },
];

export const ARTIST_SORT_OPTIONS: FilterOption[] = [
  { label: "settings.library.sortAddedAt", value: "addedAt" },
  { label: "settings.library.sortTitleAsc", value: "name_asc" },
  { label: "settings.library.sortTitleDesc", value: "name_desc" },
];

export const TRACK_SORT_OPTIONS: FilterOption[] = [
  { label: "settings.library.sortAddedAt", value: "addedAt" },
  { label: "settings.library.sortTitleAsc", value: "title_asc" },
  { label: "settings.library.sortTitleDesc", value: "title_desc" },
];

const FAVORITE_OPTIONS: FilterOption[] = [
  { label: "media.video.filter.favoriteOnly", value: "true" },
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
  const { t } = useTranslation();

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
        label: t("media.video.filter.sort"),
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
        label: t("media.video.filter.genre"),
        options: genreOptions.map((g) => ({ label: g, value: g })),
      });
    }
    // Favorite filter on albums only
    if (activeTab === "albums") {
      r.push({
        key: "favorite",
        label: t("media.video.filter.favorite"),
        options: FAVORITE_OPTIONS,
      });
    }
    return r;
  }, [sortOptions, genreOptions, activeTab, t]);

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-2 py-1.5">
          <span className="w-14 shrink-0 pt-1 text-[13px] font-semibold text-fg-secondary">
            {row.label}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <FilterPill
              label={t("media.video.filter.all")}
              active={!filters[row.key as keyof MusicFilters]}
              onClick={() => handleChange(row.key as keyof MusicFilters, "")}
            />
            {row.options.map((opt) => (
              <FilterPill
                key={opt.value}
                label={
                  opt.label.includes(".")
                    ? t(opt.label as Parameters<typeof t>[0])
                    : opt.label
                }
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
