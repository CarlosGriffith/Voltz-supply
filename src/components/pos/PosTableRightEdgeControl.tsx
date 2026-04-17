import { cn } from '@/lib/utils';

type Props = {
  className?: string;
  expandPx: number;
  setExpandPx: React.Dispatch<React.SetStateAction<number>>;
  dragRef: React.MutableRefObject<{ startClientX: number; startExpand: number } | null>;
  'aria-label': string;
  title?: string;
};

/**
 * Matches {@link PanelResizeHandle} grip styling; drives extra table width for the last column.
 */
export function PosTableRightEdgeControl({
  className,
  expandPx,
  setExpandPx,
  dragRef,
  'aria-label': ariaLabel,
  title,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={ariaLabel}
      title={title}
      className={cn(
        'absolute bottom-0 right-3 top-0 z-30',
        'w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group touch-none select-none',
        className,
      )}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
          startClientX: e.clientX,
          startExpand: expandPx,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        setExpandPx(Math.max(0, d.startExpand + (e.clientX - d.startClientX)));
      }}
      onPointerUp={(e) => {
        dragRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
      onPointerCancel={(e) => {
        dragRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }}
    >
      <span
        className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400"
        aria-hidden
      />
    </div>
  );
}
