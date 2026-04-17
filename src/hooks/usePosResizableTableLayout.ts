import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ImperativePanelGroupHandle } from 'react-resizable-panels';

/**
 * Syncs {@link PanelGroup} column % with CSS grid rows and supports widening the last column
 * by growing the table shell (horizontal scroll) — same pattern as Quote Requests / Checkout Items.
 */
export function usePosResizableTableLayout(args: {
  columnCount: number;
  defaultPercents: number[];
  panelMins: readonly number[];
}) {
  const { columnCount, defaultPercents, panelMins } = args;
  const [colLayout, setColLayout] = useState<number[]>(() => [...defaultPercents]);
  const [expandPx, setExpandPx] = useState(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const panelGroupRef = useRef<ImperativePanelGroupHandle>(null);
  const expandPrevRef = useRef(0);
  const rightEdgeDragRef = useRef<{ startClientX: number; startExpand: number } | null>(null);

  const gridTemplateColumns = useMemo(
    () => colLayout.map((w) => `${w}fr`).join(' '),
    [colLayout],
  );

  const onPanelLayout = useCallback((sizes: number[]) => {
    setColLayout(sizes);
  }, []);

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
