export type POSTableName =
  | 'pos_customers'
  | 'pos_quotes'
  | 'pos_quote_requests'
  | 'pos_orders'
  | 'pos_invoices'
  | 'pos_receipts'
  | 'pos_refunds'
  | 'pos_sent_emails';

let posSyncChannel: BroadcastChannel | null = null;

export function getPOSSyncChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!posSyncChannel) posSyncChannel = new BroadcastChannel('voltz-pos-sync');
  return posSyncChannel;
}

/**
 * Notify other POS tabs / windows to refresh data (same browser profile).
 * Cross-device updates rely on polling in usePOSRealtime.
 */
export async function broadcastPOSChange(table: POSTableName) {
  try {
    getPOSSyncChannel()?.postMessage({ type: 'pos-change', table, timestamp: Date.now() });
  } catch (err) {
    console.warn('[POS Broadcast] Failed to broadcast:', err);
  }
}

/** After customer save: refresh all document lists that store denormalized customer fields. */
export function broadcastPOSCustomerRelatedTables() {
  const tables: POSTableName[] = [
    'pos_customers',
    'pos_quotes',
    'pos_orders',
    'pos_invoices',
    'pos_receipts',
    'pos_refunds',
    'pos_quote_requests',
  ];
  for (const table of tables) {
    broadcastPOSChange(table);
  }
}
