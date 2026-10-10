import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useContainerWidth(): [
  React.RefCallback<HTMLDivElement>,
  number,
] {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!element) return;
    const initialWidth = element.getBoundingClientRect().width;
    if (initialWidth > 0) setWidth(initialWidth);
    const observer = new ResizeObserver((entries) => {
      const measuredWidth = entries[0]?.contentRect.width;
      if (measuredWidth && measuredWidth > 0) setWidth(measuredWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return [setElement, width];
}

export function useSidebarCollapsed(scopeId: string): {
  collapsed: boolean;
  onToggleCollapse: () => void;
} {
  const storageKey = `music-app:sidebar-collapsed:${scopeId}`;

  const [manuallyCollapsed, setManuallyCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, manuallyCollapsed ? "1" : "0");
    } catch {
      // ignore quota / privacy errors
    }
  }, [manuallyCollapsed, storageKey]);

  const collapsed = manuallyCollapsed;

  return {
    collapsed,
    onToggleCollapse: () => {
      setManuallyCollapsed(!collapsed);
    },
  };
}

interface InfiniteScrollInput<T> {
  queryData?: { items: T[]; total: number; page: number };
  isFetching: boolean;
  onLoadMore: () => void;
  enabled?: boolean;
}

export function useInfiniteScroll<T>({
  queryData,
  isFetching,
  onLoadMore,
  enabled = true,
}: InfiniteScrollInput<T>) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<Record<number, T[]>>({});
  const items = useMemo(
    () =>
      Object.entries(pages)
        .sort(([left], [right]) => Number(left) - Number(right))
        .flatMap(([, pageItems]) => pageItems),
    [pages],
  );

  const total = queryData?.total ?? 0;
  const hasMore = items.length < total;

  useEffect(() => {
    if (!queryData) return;
    setPages((previous) => ({
      ...(queryData.page <= 1 ? {} : previous),
      [queryData.page]: queryData.items ?? [],
    }));
  }, [queryData]);

  useEffect(() => {
    if (!enabled || !sentinelRef.current || isFetching || !hasMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [enabled, hasMore, isFetching, onLoadMore]);

  const reset = useCallback(() => setPages({}), []);

  return useMemo(
    () => ({ items, total, hasMore, sentinelRef, reset }),
    [hasMore, items, reset, total],
  );
}

interface UiPreference<T> {
  data: T;
  patch: (value: Partial<T>) => Promise<void>;
}

export function useUiPreference<T>(
  key: string,
  defaultValue = {} as T,
): UiPreference<T> {
  const storageKey = `tokimo-app-music:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw
        ? ({ ...defaultValue, ...JSON.parse(raw) } as T)
        : defaultValue;
    } catch (error) {
      console.warn("Failed to read UI preference", error);
      return defaultValue;
    }
  });

  const patch = useCallback(
    async (next: Partial<T>) => {
      setValue((prev) => {
        const merged = { ...prev, ...next } as T;
        window.localStorage.setItem(storageKey, JSON.stringify(merged));
        return merged;
      });
    },
    [storageKey],
  );

  return { data: value, patch };
}
