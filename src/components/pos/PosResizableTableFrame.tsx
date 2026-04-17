import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { PosResizableTableLayoutApi } from '@/hooks/usePosResizableTableLayout';
import { PosTableRightEdgeControl } from '@/components/pos/PosTableRightEdgeControl';

type Props = {
  table: PosResizableTableLayoutApi;
  baseMinWidthRem: number;
  /** Sticky header: typically `<PanelGroup>…</PanelGroup>` plus the absolute right guide line. */
  header: ReactNode;
  children: ReactNode;
  edgeAriaLabel: string;
  edgeTitle?: string;
  /** Override sticky header bar (default: light POS list header). */
  stickyHeaderClassName?: string;
  /** Override scroll region (default: tall max-height + `pos-data-table-scroll`). */
  scrollAreaClassName?: string;
  /** Merged onto the right-edge widen control (e.g. `hidden sm:flex` on mobile). */
  rightEdgeClassName?: string;
  /** Merged onto the outer card wrapper (e.g. flush embed inside another surface). */
  outerClassName?: string;
};

/**
 * Outer card, horizontal scroll, shell `minWidth`, sticky header slot, and right-edge widen handle
 * — matches POS Quote Requests / Checkout Items table structure.
 */
export function PosResizableTableFrame({
  table,
  baseMinWidthRem,
  header,
  children,
  edgeAriaLabel,
  edgeTitle,
  stickyHeaderClassName,
  scrollAreaClassName,
  rightEdgeClassName,
  outerClassName,
}: Props) {
  return (
    <div
      className={cn(
        'relative w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm',
        outerClassName,
      )}
    >
      <div
        className={cn(
          scrollAreaClassName ??
            cn(
              'pos-data-table-scroll max-h-[min(72dvh,calc(100dvh-12rem))] w-full min-h-0 max-w-full overflow-auto overscroll-contain',
              'sm:max-h-[min(74dvh,calc(100dvh-11.5rem))] lg:max-h-[min(78dvh,calc(100dvh-10.5rem))]',
            ),
        )}
      >
        <div
          ref={table.shellRef}
          className="relative w-full"
          style={{ minWidth: `calc(${baseMinWidthRem}rem + ${table.expandPx}px)` }}
        >
          <div
            className={cn(
              'sticky top-0 z-20 relative',
              stickyHeaderClassName ??
                'border-b border-gray-200 bg-[#FAFAFB] shadow-[inset_0_-1px_0_0_rgb(229,231,235)]',
            )}
          >
            {header}
          </div>
          {children}
          <PosTableRightEdgeControl
            className={rightEdgeClassName}
            expandPx={table.expandPx}
            setExpandPx={table.setExpandPx}
            dragRef={table.rightEdgeDragRef}
            aria-label={edgeAriaLabel}
            title={edgeTitle}
          />
        </div>
      </div>
    </div>
  );
}
