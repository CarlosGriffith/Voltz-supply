const SESSION_FLAG = 'voltz-cms-after-login';

export function markCmsPostLoginViewResetPending(): void {
  try {
    sessionStorage.setItem(SESSION_FLAG, '1');
  } catch {
    /* private mode */
  }
}

/**
 * Scroll to top and try to normalize mobile browser zoom after CMS login (iOS input zoom, etc.).
 * Call once when entering `/cms` if {@link markCmsPostLoginViewResetPending} was set.
 */
export function consumeCmsPostLoginViewReset(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (sessionStorage.getItem(SESSION_FLAG) !== '1') return false;
    sessionStorage.removeItem(SESSION_FLAG);
  } catch {
    return false;
  }

  const hardScrollTop = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  (document.activeElement as HTMLElement | null)?.blur?.();
  hardScrollTop();
  requestAnimationFrame(hardScrollTop);
  setTimeout(hardScrollTop, 0);
  setTimeout(hardScrollTop, 50);
  setTimeout(hardScrollTop, 200);

  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) {
    const original = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0';
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1');
    void document.body.offsetHeight;
    requestAnimationFrame(() => {
      meta.setAttribute('content', original);
    });
  }

  return true;
}
