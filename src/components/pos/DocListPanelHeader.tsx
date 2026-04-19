import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import type { PosResizableTableLayoutApi } from '@/hooks/usePosResizableTableLayout';

const DIV =
  'after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-gray-200 after:content-[""]';

const HANDLE = 'w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group';

/** Header row for POS document lists (quotes / orders / invoices / receipts) — matches Quote Requests panel styling. */
export function DocListPanelHeader({
  docType,
  table,
  autoSaveId,
}: {
  docType: 'quote' | 'order' | 'invoice' | 'receipt';
  table: PosResizableTableLayoutApi;
  autoSaveId: string;
}) {
  const dp = table.defaultPercents;
  const pm = table.panelMins;

  if (docType === 'quote') {
    return (
      <PanelGroup
        key={autoSaveId}
        ref={table.panelGroupRef}
        direction="horizontal"
        className="w-full items-stretch min-h-0"
        onLayout={table.onPanelLayout}
        autoSaveId={autoSaveId}
      >
        <Panel defaultSize={dp[0]} minSize={pm[0]} id="pos-doc-quote-col-0" className="min-w-0 flex items-center">
          <div
            className={cn(
              'relative w-full px-3 py-2.5 pl-4 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap',
              DIV,
            )}
          >
            Quote No.
          </div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[1]} minSize={pm[1]} id="pos-doc-quote-col-1" className="min-w-0 flex items-center">
          <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>
            Customer
          </div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[2]} minSize={pm[2]} id="pos-doc-quote-col-2" className="min-w-0 flex items-center">
          <div className={cn('relative w-full px-3 py-2.5 pl-2 text-xs font-medium text-gray-600 whitespace-nowrap', DIV)}>Date</div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[3]} minSize={pm[3]} id="pos-doc-quote-col-3" className="min-w-0 flex items-center">
          <div className={cn('relative w-full px-3 py-2.5 text-right text-xs font-medium text-gray-600 tabular-nums', DIV)}>Total</div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[4]} minSize={pm[4]} id="pos-doc-quote-col-4" className="min-w-0 flex items-center justify-center">
          <div className={cn('relative w-full px-3 py-2.5 text-center text-xs font-medium text-gray-600 max-lg:px-1', DIV)}>Status</div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[5]} minSize={pm[5]} id="pos-doc-quote-col-5" className="min-w-0 flex items-center">
          <div
            className={cn(
              'relative w-full px-3 py-2.5 text-left text-xs font-medium text-gray-600 max-lg:whitespace-nowrap',
              DIV,
            )}
          >
            Email Sent
          </div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[6]} minSize={pm[6]} id="pos-doc-quote-col-6" className="min-w-0 flex items-center justify-center self-stretch">
          <span className="sr-only">Row actions</span>
          <div className="relative w-full px-2 py-2.5" aria-hidden />
        </Panel>
      </PanelGroup>
    );
  }

  if (docType === 'order' || docType === 'invoice') {
    const noLabel = docType === 'order' ? 'Order No.' : 'Invoice No.';
    const prefix = docType === 'order' ? 'pos-doc-order' : 'pos-doc-invoice';
    return (
      <PanelGroup
        key={autoSaveId}
        ref={table.panelGroupRef}
        direction="horizontal"
        className="w-full items-stretch min-h-0"
        onLayout={table.onPanelLayout}
        autoSaveId={autoSaveId}
      >
        <Panel defaultSize={dp[0]} minSize={pm[0]} id={`${prefix}-col-0`} className="min-w-0 flex items-center">
          <div className={cn('relative w-full px-3 py-2.5 pl-4 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>
            {noLabel}
          </div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[1]} minSize={pm[1]} id={`${prefix}-col-1`} className="min-w-0 flex items-center">
          <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Customer</div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[2]} minSize={pm[2]} id={`${prefix}-col-2`} className="min-w-0 flex items-center">
          <div className={cn('relative w-full px-3 py-2.5 pl-2 text-xs font-medium text-gray-600 whitespace-nowrap', DIV)}>Date</div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[3]} minSize={pm[3]} id={`${prefix}-col-3`} className="min-w-0 flex items-center">
          <div className={cn('relative w-full px-3 py-2.5 text-right text-xs font-medium text-gray-600 tabular-nums', DIV)}>Total</div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[4]} minSize={pm[4]} id={`${prefix}-col-4`} className="min-w-0 flex items-center justify-center">
          <div className={cn('relative w-full px-3 py-2.5 text-center text-xs font-medium text-gray-600 max-lg:px-1', DIV)}>Status</div>
        </Panel>
        <PanelResizeHandle className={HANDLE} title="Resize columns">
          <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
        </PanelResizeHandle>
        <Panel defaultSize={dp[5]} minSize={pm[5]} id={`${prefix}-col-5`} className="min-w-0 flex items-center justify-center self-stretch">
          <span className="sr-only">Row actions</span>
          <div className="relative w-full px-2 py-2.5" aria-hidden />
        </Panel>
      </PanelGroup>
    );
  }

  // receipt — 8 columns
  return (
    <PanelGroup
      key={autoSaveId}
      ref={table.panelGroupRef}
      direction="horizontal"
      className="w-full items-stretch min-h-0"
      onLayout={table.onPanelLayout}
      autoSaveId={autoSaveId}
    >
      <Panel defaultSize={dp[0]} minSize={pm[0]} id="pos-doc-receipt-col-0" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 pl-4 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Receipt No.</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
      </PanelResizeHandle>
      <Panel defaultSize={dp[1]} minSize={pm[1]} id="pos-doc-receipt-col-1" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Customer</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
      </PanelResizeHandle>
      <Panel defaultSize={dp[2]} minSize={pm[2]} id="pos-doc-receipt-col-2" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 pl-2 text-xs font-medium text-gray-600 whitespace-nowrap', DIV)}>Date</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
      </PanelResizeHandle>
      <Panel defaultSize={dp[3]} minSize={pm[3]} id="pos-doc-receipt-col-3" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-left text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Payment Method</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
      </PanelResizeHandle>
      <Panel defaultSize={dp[4]} minSize={pm[4]} id="pos-doc-receipt-col-4" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-right text-xs font-medium text-gray-600 tabular-nums', DIV)}>Invoice(s) Total</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
      </PanelResizeHandle>
      <Panel defaultSize={dp[5]} minSize={pm[5]} id="pos-doc-receipt-col-5" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-right text-xs font-medium text-gray-600 tabular-nums', DIV)}>Amount Received</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
      </PanelResizeHandle>
      <Panel defaultSize={dp[6]} minSize={pm[6]} id="pos-doc-receipt-col-6" className="min-w-0 flex items-center justify-center">
        <div className={cn('relative w-full px-3 py-2.5 text-center text-xs font-medium text-gray-600 max-lg:px-1', DIV)}>Status</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />
      </PanelResizeHandle>
      <Panel defaultSize={dp[7]} minSize={pm[7]} id="pos-doc-receipt-col-7" className="min-w-0 flex items-center justify-center self-stretch">
        <span className="sr-only">Row actions</span>
        <div className="relative w-full px-2 py-2.5" aria-hidden />
      </Panel>
    </PanelGroup>
  );
}
