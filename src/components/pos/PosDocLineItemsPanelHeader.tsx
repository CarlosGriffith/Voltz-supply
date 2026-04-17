import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import type { PosResizableTableLayoutApi } from '@/hooks/usePosResizableTableLayout';

const DIV =
  'after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-white/25 after:content-[""]';

const HANDLE =
  'w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group hover:bg-white/5 max-sm:pointer-events-none';

const GRIP = <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-white/45" aria-hidden />;

/** Dark header row for POS document line items (create / review quote, order, invoice). */
export function PosDocLineItemsPanelHeader({
  table,
  autoSaveId,
}: {
  table: PosResizableTableLayoutApi;
  autoSaveId: string;
}) {
  const dp = table.defaultPercents;
  const pm = table.panelMins;
  return (
    <PanelGroup
      ref={table.panelGroupRef}
      direction="horizontal"
      className="w-full items-stretch min-h-0"
      onLayout={table.onPanelLayout}
      autoSaveId={autoSaveId}
    >
      <Panel defaultSize={dp[0]} minSize={pm[0]} id="pos-doc-line-col-0" className="min-w-0 flex items-center">
        <div
          className={cn(
            'relative w-full px-3 py-3 pl-4 text-left text-[11px] font-semibold uppercase tracking-wider text-white max-sm:whitespace-normal sm:whitespace-nowrap',
            DIV,
          )}
        >
          Product
        </div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[1]} minSize={pm[1]} id="pos-doc-line-col-1" className="min-w-0 flex items-center justify-center">
        <div className={cn('relative w-full px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-white', DIV)}>Qty</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[2]} minSize={pm[2]} id="pos-doc-line-col-2" className="min-w-0 flex items-center justify-end">
        <div className={cn('relative w-full px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-white tabular-nums', DIV)}>Price</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[3]} minSize={pm[3]} id="pos-doc-line-col-3" className="min-w-0 flex items-center justify-end">
        <div className={cn('relative w-full px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-white tabular-nums', DIV)}>Total</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[4]} minSize={pm[4]} id="pos-doc-line-col-4" className="min-w-0 flex items-center justify-center self-stretch">
        <span className="sr-only">Row actions</span>
        <div className="relative w-full px-2 py-3" aria-hidden />
      </Panel>
    </PanelGroup>
  );
}
