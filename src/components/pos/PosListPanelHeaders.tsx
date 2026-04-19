import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '@/lib/utils';
import type { PosResizableTableLayoutApi } from '@/hooks/usePosResizableTableLayout';

const DIV =
  'after:pointer-events-none after:absolute after:right-0 after:top-1/2 after:z-[5] after:block after:h-3/4 after:w-px after:-translate-y-1/2 after:bg-gray-200 after:content-[""]';

const HANDLE = 'w-2 shrink-0 flex items-center justify-center cursor-col-resize outline-none group';

const GRIP = <span className="h-5 w-px rounded-full bg-transparent transition-colors group-hover:bg-gray-400" aria-hidden />;

export function CustomersPanelHeader({ table, autoSaveId }: { table: PosResizableTableLayoutApi; autoSaveId: string }) {
  const dp = table.defaultPercents;
  const pm = table.panelMins;
  return (
    <PanelGroup
      key={autoSaveId}
      ref={table.panelGroupRef}
      direction="horizontal"
      className="w-full items-stretch min-h-0"
      onLayout={table.onPanelLayout}
      autoSaveId={autoSaveId}
    >
      <Panel defaultSize={dp[0]} minSize={pm[0]} id="pos-customers-col-0" className="min-w-0 flex items-center">
        <div
          className={cn(
            'relative w-full px-3 py-2.5 pl-4 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap',
            DIV,
          )}
        >
          Name
        </div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[1]} minSize={pm[1]} id="pos-customers-col-1" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Contact</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[2]} minSize={pm[2]} id="pos-customers-col-2" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Company</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[3]} minSize={pm[3]} id="pos-customers-col-3" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-right text-xs font-medium text-gray-600 tabular-nums', DIV)}>Store credit</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[4]} minSize={pm[4]} id="pos-customers-col-4" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 pr-10 text-right text-xs font-medium text-gray-600 tabular-nums', DIV)}>Balance due</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[5]} minSize={pm[5]} id="pos-customers-col-5" className="min-w-0 flex items-center justify-center self-stretch">
        <span className="sr-only">Row actions</span>
        <div className="relative w-full px-2 py-2.5" aria-hidden />
      </Panel>
    </PanelGroup>
  );
}

export function RefundsPanelHeader({ table, autoSaveId }: { table: PosResizableTableLayoutApi; autoSaveId: string }) {
  const dp = table.defaultPercents;
  const pm = table.panelMins;
  return (
    <PanelGroup
      key={autoSaveId}
      ref={table.panelGroupRef}
      direction="horizontal"
      className="w-full items-stretch min-h-0"
      onLayout={table.onPanelLayout}
      autoSaveId={autoSaveId}
    >
      <Panel defaultSize={dp[0]} minSize={pm[0]} id="pos-refunds-col-0" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 pl-4 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Refund No.</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[1]} minSize={pm[1]} id="pos-refunds-col-1" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Customer</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[2]} minSize={pm[2]} id="pos-refunds-col-2" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Type</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[3]} minSize={pm[3]} id="pos-refunds-col-3" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-right text-xs font-medium text-gray-600 tabular-nums', DIV)}>Amount</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[4]} minSize={pm[4]} id="pos-refunds-col-4" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 whitespace-nowrap', DIV)}>Date</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[5]} minSize={pm[5]} id="pos-refunds-col-5" className="min-w-0 flex items-center justify-center">
        <div className={cn('relative w-full px-3 py-2.5 text-center text-xs font-medium text-gray-600 max-lg:px-1', DIV)}>Status</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[6]} minSize={pm[6]} id="pos-refunds-col-6" className="min-w-0 flex items-center justify-center self-stretch">
        <span className="sr-only">Row actions</span>
        <div className="relative w-full px-2 py-2.5" aria-hidden />
      </Panel>
    </PanelGroup>
  );
}

export function SentEmailsPanelHeader({ table, autoSaveId }: { table: PosResizableTableLayoutApi; autoSaveId: string }) {
  const dp = table.defaultPercents;
  const pm = table.panelMins;
  return (
    <PanelGroup
      key={autoSaveId}
      ref={table.panelGroupRef}
      direction="horizontal"
      className="w-full items-stretch min-h-0"
      onLayout={table.onPanelLayout}
      autoSaveId={autoSaveId}
    >
      <Panel defaultSize={dp[0]} minSize={pm[0]} id="pos-sent-emails-col-0" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 pl-4 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Recipient</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[1]} minSize={pm[1]} id="pos-sent-emails-col-1" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Subject</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[2]} minSize={pm[2]} id="pos-sent-emails-col-2" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 max-lg:whitespace-nowrap', DIV)}>Document</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[3]} minSize={pm[3]} id="pos-sent-emails-col-3" className="min-w-0 flex items-center">
        <div className={cn('relative w-full px-3 py-2.5 text-xs font-medium text-gray-600 whitespace-nowrap', DIV)}>Sent</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[4]} minSize={pm[4]} id="pos-sent-emails-col-4" className="min-w-0 flex items-center justify-center">
        <div className={cn('relative w-full px-3 py-2.5 text-center text-xs font-medium text-gray-600 max-lg:px-1', DIV)}>Status</div>
      </Panel>
      <PanelResizeHandle className={HANDLE} title="Resize columns">
        {GRIP}
      </PanelResizeHandle>
      <Panel defaultSize={dp[5]} minSize={pm[5]} id="pos-sent-emails-col-5" className="min-w-0 flex items-center justify-center self-stretch">
        <span className="sr-only">Row actions</span>
        <div className="relative w-full px-2 py-2.5" aria-hidden />
      </Panel>
    </PanelGroup>
  );
}
