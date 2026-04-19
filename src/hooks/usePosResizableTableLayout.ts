import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';

const EXPAND_STORAGE_PREFIX = 'voltz-cms-pos-expand:';

function readStoredExpandPx(key: string | undefined): number {
  if (!key || typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(`${EXPAND_STORAGE_PREFIX}${key}`);
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Syncs {@link PanelGroup} column % with CSS grid rows and supports widening the last column
 * by growing the table shell (horizontal scroll) — same pattern as Quote Requests / Checkout Items.
 */
export function usePosResizableTableLayout(args: {
  columnCount: number;
  defaultPercents: number[];
  panelMins: readonly number[];
  /**
   * When set, extra width from the right-edge drag is persisted (`voltz-cms-pos-expand:` + key in localStorage).
   * Use the same string as this table’s `PanelGroup` `autoSaveId`.
   */
  expandStorageKey?: string;
}) {
  const { columnCount, defaultPercents, panelMins, expandStorageKey } = args;
  const [colLayout, setColLayout] = useState<number[]>(() => [...defaultPercents]);
  const [expandPx, setExpandPx] = useState(() => readStoredExpandPx(expandStorageKey));
  const shellRef = useRef<HTMLDivElement>(null);
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);
  const expandPrevRef = useRef(readStoredExpandPx(expandStorageKey));
  const rightEdgeDragRef = useRef<{ startClientX: number; startExpand: number } | null>(null);

  /** `minmax(0, Nfr)` so tracks can shrink below content min-size; plain `Nfr` lets cells overflow into neighbors. */
  const gridTemplateColumns = useMemo(
    () => colLayout.map((w) => `minmax(0,${w}fr)`).join(' '),
    [colLayout],
  );

  const onPanelLayout = useCallback((sizes: number[]) => {
    setColLayout(sizes);
  }, []);

  useLayoutEffect(() => {
    const v = readStoredExpandPx(expandStorageKey);
    setExpandPx(v);
    expandPrevRef.current = v;
  }, [expandStorageKey]);

  /** Body rows use CSS grid %; keep in sync when PanelGroup restores from storage. */
  useLayoutEffect(() => {
    let cancelled = false;
    let nestedRaf = 0;
    const sync = () => {
      if (cancelled) return;
      const pg = panelGroupRef.current;
      if (!pg) return;
      try {
        const L = pg.getLayout();
        if (L.length === columnCount && L.every((n) => Number.isFinite(n) && n > 0)) {
          setColLayout((prev) => {
            if (
              prev.length === L.length &&
              prev.every((v, i) => Math.abs(v - L[i]) < 0.02)
            ) {
              return prev;
            }
            return L;
          });
        }
      } catch {
        /* panel group not ready */
      }
    };
    sync();
    const t1 = requestAnimationFrame(sync);
    const t2 = requestAnimationFrame(() => {
      nestedRaf = requestAnimationFrame(sync);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(t1);
      cancelAnimationFrame(t2);
      cancelAnimationFrame(nestedRaf);
    };
  }, [columnCount, expandStorageKey]);

  useEffect(() => {
    if (!expandStorageKey) return;
    try {
      localStorage.setItem(`${EXPAND_STORAGE_PREFIX}${expandStorageKey}`, String(expandPx));
    } catch {
      /* quota / private mode */
    }
  }, [expandPx, expandStorageKey]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const pg = panelGroupRef.current;
    if (!shell || !pg) return;
    const prevE = expandPrevRef.current;
    const dExpand = expandPx - prevE;
    if (dExpand === 0) return;
    expandPrevRef.current = expandPx;

    const W_new = shell.offsetWidth;
    const W_old = W_new - dExpand;
    if (W_old <= 0) return;

    const prevLayout = pg.getLayout();
    if (prevLayout.length !== columnCount) return;

    const px = prevLayout.map((p) => (p / 100) * W_old);
    px[columnCount - 1] += dExpand;
    const sum = px.reduce((a, b) => a + b, 0);
    if (sum <= 0) return;
    const next = px.map((x) => (x / sum) * 100);
    pg.setLayout(next);
    setColLayout(next);
  }, [columnCount, expandPx]);

  return {
    colLayout,
    setColLayout,
    expandPx,
    setExpandPx,
    shellRef,
    panelGroupRef,
    rightEdgeDragRef,
    gridTemplateColumns,
    onPanelLayout,
    panelMins,
    defaultPercents,
  };
}

export type PosResizableTableLayoutApi = ReturnType<typeof usePosResizableTableLayout>;
