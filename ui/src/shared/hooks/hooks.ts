import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useContainerWidth(): [
  React.RefObject<HTMLDivElement | null>,
  number,
] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      if (entries[0]) {
        setWidth(entries[0].contentRect.width);
      }
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return [ref, width];
}

export function useSidebarCollapsed(
  scopeId: string,
  autoCollapse: boolean,
): { collapsed: boolean; onToggleCollapse: () => void } {
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

  const collapsed = autoCollapse || manuallyCollapsed;

  return {
    collapsed,
    onToggleCollapse: () => setManuallyCollapsed(!collapsed),
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
  const [items, setItems] = useState<T[]>([]);

  const total = queryData?.total ?? 0;
  const hasMore = items.length < total;

  useEffect(() => {
    if (!queryData) return;
    setItems((prev) =>
      queryData.page <= 1
        ? (queryData.items ?? [])
        : [...prev, ...(queryData.items ?? [])],
    );
  }, [queryData]);

  useEffect(() => {
    if (!enabled || !sentinelRef.current || isFetching || !hasMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onLoadMore();
    });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [enabled, hasMore, isFetching, onLoadMore]);

  const reset = useCallback(() => setItems([]), []);

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
