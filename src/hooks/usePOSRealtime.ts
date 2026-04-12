import { useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from 'react';
import { getPOSSyncChannel } from '@/lib/posBroadcast';
import type { POSTableName } from '@/lib/posBroadcast';
import {
  POSCustomer, POSQuote, POSOrder, POSInvoice, POSReceipt, POSRefund,
  POSQuoteRequest, POSSentEmail,
  fetchCustomers, fetchQuotes, fetchOrders, fetchInvoices, fetchReceipts,
  fetchRefunds, fetchQuoteRequests, fetchSentEmails,
} from '@/lib/posData';

interface POSRealtimeSetters {
  setCustomers: React.Dispatch<React.SetStateAction<POSCustomer[]>>;
  setQuotes: React.Dispatch<React.SetStateAction<POSQuote[]>>;
  setOrders: React.Dispatch<React.SetStateAction<POSOrder[]>>;
  setInvoices: React.Dispatch<React.SetStateAction<POSInvoice[]>>;
  setReceipts: React.Dispatch<React.SetStateAction<POSReceipt[]>>;
  setRefunds: React.Dispatch<React.SetStateAction<POSRefund[]>>;
  setQuoteRequests: React.Dispatch<React.SetStateAction<POSQuoteRequest[]>>;
  setSentEmails: React.Dispatch<React.SetStateAction<POSSentEmail[]>>;
}

const POLL_INTERVAL_MS = 30_000;
const DEBOUNCE_MS = 300;

/**
 * Listens for POS updates via BroadcastChannel (other local tabs) and polls periodically.
 */
export function usePOSRealtime(
  setters: POSRealtimeSetters,
  enabled: boolean = true
) {
  const settersRef = useRef(setters);
  settersRef.current = setters;

  const pendingRefreshes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refreshTable = useCallback(async (table: POSTableName) => {
    const s = settersRef.current;
    try {
      switch (table) {
        case 'pos_customers': {
          const data = await fetchCustomers();
          s.setCustomers(data);
          break;
        }
        case 'pos_quotes': {
          const data = await fetchQuotes();
          s.setQuotes(data);
          break;
        }
        case 'pos_quote_requests': {
          const data = await fetchQuoteRequests();
          s.setQuoteRequests(data);
          break;
        }
        case 'pos_orders': {
          const data = await fetchOrders();
          s.setOrders(data);
          break;
        }
        case 'pos_invoices': {
          const data = await fetchInvoices();
          s.setInvoices(data);
          break;
        }
        case 'pos_receipts': {
          const data = await fetchReceipts();
          s.setReceipts(data);
          break;
        }
        case 'pos_refunds': {
          const data = await fetchRefunds();
          s.setRefunds(data);
          break;
        }
        case 'pos_sent_emails': {
          const data = await fetchSentEmails();
          s.setSentEmails(data);
          break;
        }
      }
    } catch (err) {
      console.error(`[POS Realtime] Error refreshing ${table}:`, err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const s = settersRef.current;
    try {
      const [cust, quotes, orders, invoices, receipts, refunds, qr, emails] = await Promise.all([
        fetchCustomers(), fetchQuotes(), fetchOrders(), fetchInvoices(),
        fetchReceipts(), fetchRefunds(), fetchQuoteRequests(), fetchSentEmails(),
      ]);
      s.setCustomers(cust);
      s.setQuotes(quotes);
      s.setOrders(orders);
      s.setInvoices(invoices);
      s.setReceipts(receipts);
      s.setRefunds(refunds);
      s.setQuoteRequests(qr);
      s.setSentEmails(emails);
    } catch (err) {
      console.error('[POS Realtime] Error refreshing all:', err);
    }
  }, []);

  const debouncedRefresh = useCallback((table: POSTableName) => {
    const existing = pendingRefreshes.current.get(table);
    if (existing) clearTimeout(existing);

    const timeout = setTimeout(() => {
      pendingRefreshes.current.delete(table);
      refreshTable(table);
    }, DEBOUNCE_MS);

    pendingRefreshes.current.set(table, timeout);
  }, [refreshTable]);

  useEffect(() => {
    if (!enabled) return;

    const bc = getPOSSyncChannel();
    const onMessage = (ev: MessageEvent) => {
      const payload = ev.data;
      if (payload?.type !== 'pos-change') return;
      const table = payload?.table as POSTableName | undefined;
      if (table) {
        console.log(`[POS Realtime] Broadcast received for ${table}`);
        debouncedRefresh(table);
      } else {
        console.log('[POS Realtime] Broadcast received, refreshing all');
        refreshAll();
      }
    };
    bc?.addEventListener('message', onMessage);

    const pollInterval = setInterval(() => {
      refreshAll();
    }, POLL_INTERVAL_MS);

    return () => {
      pendingRefreshes.current.forEach(timeout => clearTimeout(timeout));
      pendingRefreshes.current.clear();
      bc?.removeEventListener('message', onMessage);
      clearInterval(pollInterval);
      console.log('[POS Realtime] Cleaned up');
    };
  }, [enabled, debouncedRefresh, refreshAll]);
}

/**
 * Refetches local `customers` when another POS surface broadcasts `pos_customers`, and when the user
 * returns to the window (focus / tab visible). Covers environments with no BroadcastChannel and
 * editors that stay mounted (e.g. New Invoice) so store credit balances stay current.
 */
export function usePOSCustomersListBroadcast(
  setCustomers: Dispatch<SetStateAction<POSCustomer[]>>,
  enabled: boolean = true
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setCustomersRef = useRef(setCustomers);
  setCustomersRef.current = setCustomers;

  const scheduleRefetch = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      try {
        const data = await fetchCustomers();
        setCustomersRef.current(data);
      } catch (e) {
        console.error('[usePOSCustomersListBroadcast]', e);
      }
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onMessage = (ev: MessageEvent) => {
      const payload = ev.data;
      if (payload?.type !== 'pos-change' || payload?.table !== 'pos_customers') return;
      scheduleRefetch();
    };

    const bc = getPOSSyncChannel();
    if (bc) {
      bc.addEventListener('message', onMessage);
    }

    const onFocus = () => scheduleRefetch();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefetch();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const pollId = setInterval(() => scheduleRefetch(), POLL_INTERVAL_MS);

    return () => {
      clearInterval(pollId);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (bc) {
        bc.removeEventListener('message', onMessage);
      }
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, scheduleRefetch]);
}

/**
 * When the shared `customers` list updates, align the selected row (balances after store credit, etc.).
 */
export function useSyncSelectedCustomerFromList(
  customers: POSCustomer[],
  setSelectedCustomer: Dispatch<SetStateAction<POSCustomer | null>>
) {
  useEffect(() => {
    setSelectedCustomer((prev) => {
      if (!prev?.id) return prev;
      const row = customers.find((x) => String(x.id) === String(prev.id));
      if (!row) return prev;
      if (
        Number(row.store_credit) === Number(prev.store_credit) &&
        Number(row.account_balance) === Number(prev.account_balance)
      ) {
        return prev;
      }
      return { ...prev, ...row };
    });
  }, [customers, setSelectedCustomer]);
}
