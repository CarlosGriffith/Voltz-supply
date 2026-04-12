/**
 * Bottom toast for the authenticated admin app (`/cms`): website CMS, POS, and shared settings.
 * Naming is historical (`CMS*`); it covers all admin-side save/error feedback.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';

export type CMSNotificationPayload = {
  variant: 'success' | 'error';
  title: string;
  /** Where / context, e.g. "Website → Contact", "POS → Quotes" */
  subtitle?: string;
};

type Ctx = {
  notify: (payload: CMSNotificationPayload) => void;
};

const CMSNotificationContext = createContext<Ctx | null>(null);

const AUTO_DISMISS_MS = 6500;

function noopNotify(_p: CMSNotificationPayload) {
  /* optional provider missing */
}

export function CMSNotificationProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<CMSNotificationPayload | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback((payload: CMSNotificationPayload) => {
    setCurrent(payload);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCurrent(null), AUTO_DISMISS_MS);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const dismiss = useCallback(() => {
    setCurrent(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <CMSNotificationContext.Provider value={{ notify }}>
      {children}
      {current && (
        <div
          className="pointer-events-none fixed bottom-0 right-0 z-[400] flex max-w-[100vw] justify-end p-4 sm:p-6"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto w-full max-w-md animate-cms-toast-slide-in">
            {current.variant === 'success' ? (
              <div className="relative flex min-h-[3.5rem] items-center justify-center rounded-md border border-green-200 bg-white px-10 py-3 shadow-2xl">
                <button
                  type="button"
                  onClick={dismiss}
                  className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Dismiss notification"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="flex w-full flex-wrap items-center justify-center gap-2.5 text-center">
                  <CheckCircle className="h-7 w-7 shrink-0 text-green-600" aria-hidden />
                  <p className="text-base font-bold leading-snug text-[#1a2332]">{current.title}</p>
                </div>
              </div>
            ) : (
              <div className="relative flex w-full items-start gap-3 rounded-md border border-red-200 bg-white px-4 py-4 pr-11 shadow-2xl">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <XCircle className="h-7 w-7 text-red-600" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-base font-bold text-[#1a2332]">{current.title}</p>
                  {current.subtitle ? (
                    <p className="mt-1 text-sm text-gray-500">{current.subtitle}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={dismiss}
                  className="absolute right-2 top-2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Dismiss notification"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </CMSNotificationContext.Provider>
  );
}

/** Global CMS toast: success/error with optional area subtitle (e.g. "Website → Contact"). */
export function useCMSNotification(): Ctx {
  const ctx = useContext(CMSNotificationContext);
  return ctx ?? { notify: noopNotify };
}
