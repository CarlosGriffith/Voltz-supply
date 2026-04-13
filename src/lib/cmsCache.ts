/**
 * CMS cache coordination: local tabs (BroadcastChannel) + version counter in MySQL via API.
 */

import { apiGet, apiPost } from '@/lib/api';

const CMS_UPDATE_EVENT = 'voltz-cms-updated';
const CMS_UPDATE_TIMESTAMP_KEY = 'voltz-cms-last-update';
const CMS_VERSION_KEY = 'cms_version';

const BROADCAST_EVENT_NAME = 'cms-change';

let cmsSyncChannel: BroadcastChannel | null = null;

function getCMSSyncChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!cmsSyncChannel) cmsSyncChannel = new BroadcastChannel('voltz-cms-sync');
  return cmsSyncChannel;
}

export async function bumpCMSVersion(): Promise<void> {
  try {
    await apiPost('/api/cms/version/bump', {});
    console.log('[CMS Cache] Version bumped');
  } catch (err) {
    console.error('[CMS Cache] Failed to bump version:', err);
  }
}

export async function getCMSVersion(): Promise<number> {
  try {
    const { version } = await apiGet<{ version: number }>('/api/cms/version');
    return typeof version === 'number' ? version : 0;
  } catch {
    return 0;
  }
}

async function sendBroadcastMessage(changedKey?: string): Promise<void> {
  try {
    getCMSSyncChannel()?.postMessage({
      event: BROADCAST_EVENT_NAME,
      changedKey: changedKey || 'all',
      timestamp: Date.now(),
      source: 'cms-admin',
    });
    console.log('[CMS Broadcast] Message sent for key:', changedKey || 'all');
  } catch (err) {
    console.error('[CMS Broadcast] Failed to send message:', err);
  }
}

export async function broadcastCMSUpdate(changedKey?: string): Promise<void> {
  const timestamp = Date.now().toString();
  localStorage.setItem(CMS_UPDATE_TIMESTAMP_KEY, timestamp);
  window.dispatchEvent(new CustomEvent(CMS_UPDATE_EVENT, { detail: { timestamp, changedKey } }));

  await bumpCMSVersion();
  await sendBroadcastMessage(changedKey);

  console.log('[CMS Cache] Update broadcast at', new Date().toISOString(), 'key:', changedKey || 'all');
}

type UpdateCallback = () => void;
const listeners = new Set<UpdateCallback>();

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300;

function notifyAllListeners(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`[CMS Cache] Notifying ${listeners.size} listener(s)`);
    listeners.forEach(cb => {
      try { cb(); } catch (err) { console.error('[CMS Cache] Listener error:', err); }
    });
  }, DEBOUNCE_MS);
}

const broadcastChannelsWithListener = new WeakSet<BroadcastChannel>();

function initBroadcastListener(): void {
  const ch = getCMSSyncChannel();
  if (!ch || broadcastChannelsWithListener.has(ch)) return;
  broadcastChannelsWithListener.add(ch);

  ch.addEventListener('message', (ev: MessageEvent) => {
    const p = ev.data;
    if (p?.event !== BROADCAST_EVENT_NAME) return;
    console.log('[CMS Broadcast] Received update:', p?.changedKey || 'all');
    notifyAllListeners();
  });
}

export function onCMSUpdate(callback: UpdateCallback): () => void {
  listeners.add(callback);
  initBroadcastListener();

  const handleCustomEvent = () => callback();
  window.addEventListener(CMS_UPDATE_EVENT, handleCustomEvent);

  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === CMS_UPDATE_TIMESTAMP_KEY || e.key?.startsWith('voltz-cms-')) {
      callback();
    }
  };
  window.addEventListener('storage', handleStorageEvent);

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      console.log('[CMS Cache] Page became visible — refreshing data');
      setTimeout(() => callback(), 300);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const handleOnline = () => {
    console.log('[CMS Cache] Device came online — refreshing data');
    setTimeout(() => callback(), 500);
  };
  window.addEventListener('online', handleOnline);

  return () => {
    listeners.delete(callback);
    window.removeEventListener(CMS_UPDATE_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('online', handleOnline);
  };
}

export { CMS_VERSION_KEY };
