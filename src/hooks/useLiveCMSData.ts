/**
 * useLiveCMSData Hook
 * 
 * Fetches CMS data directly from Supabase and provides instant updates
 * via multiple mechanisms to ensure ALL visitors on ALL devices see changes:
 * 
 * 1. **Supabase Broadcast** — Instant cross-device WebSocket push
 * 2. **localStorage events** — Instant cross-tab updates in the same browser
 * 3. **Version-based polling (every 3s)** — Safety-net that checks the CMS
 *    version counter in Supabase and re-fetches if it changed.
 * 4. **Direct periodic refresh (every 5s)** — Extra safety-net that fetches
 *    data directly from DB regardless of version.
 * 5. **Page visibility change** — Immediately refreshes when user returns
 *    to the tab (critical for mobile devices that suspend WebSockets).
 * 6. **Online event** — Refreshes when device reconnects to the internet.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Product } from '@/data/products';
import { getCMSVersion, onCMSUpdate } from '@/lib/cmsCache';
import {
  fetchFeaturedProducts,
  fetchSpecialOfferProducts,
  fetchCategoryProducts,
  fetchCategories,
  fetchConfig,
  type CMSCategoryRow,
} from '@/lib/cmsData';

import {
  DEFAULT_CONTACT_DETAILS,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_SECTIONS,
  type ContactDetails,
  type CompanyProfileData,
  type SectionConfig,
} from '@/contexts/CMSContext';

// Polling interval: 3 seconds (version-based safety net)
const POLL_INTERVAL = 3_000;
// Direct refresh interval: 5 seconds (fetches from DB regardless of version — reduced from 8s)
const DIRECT_REFRESH_INTERVAL = 5_000;

// ─── Featured Products Hook ───
export function useLiveFeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchFeaturedProducts();
      if (mountedRef.current) {
        setProducts(data);
        setLoading(false);
      }
    } catch (err) {
      console.error('[LiveCMS] Failed to fetch featured products:', err);
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    try {
      const newVersion = await getCMSVersion();
      if (newVersion > versionRef.current) {
        versionRef.current = newVersion;
        await loadProducts();
      }
    } catch { /* ignore */ }
  }, [loadProducts]);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      versionRef.current = await getCMSVersion();
      await loadProducts();
    })();
    const pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);
    const directTimer = setInterval(() => { loadProducts(); }, DIRECT_REFRESH_INTERVAL);
    const unsubscribe = onCMSUpdate(() => { loadProducts(); });
    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      clearInterval(directTimer);
      unsubscribe();
    };
  }, [loadProducts, checkForUpdates]);

  return { products, loading };
}


// ─── Special Offer Products Hook ───
export function useLiveSpecialOfferProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchSpecialOfferProducts();
      if (mountedRef.current) {
        setProducts(data);
        setLoading(false);
      }
    } catch (err) {
      console.error('[LiveCMS] Failed to fetch special offer products:', err);
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    try {
      const newVersion = await getCMSVersion();
      if (newVersion > versionRef.current) {
        versionRef.current = newVersion;
        await loadProducts();
      }
    } catch { /* ignore */ }
  }, [loadProducts]);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      versionRef.current = await getCMSVersion();
      await loadProducts();
    })();
    const pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);
    const directTimer = setInterval(() => { loadProducts(); }, DIRECT_REFRESH_INTERVAL);
    const unsubscribe = onCMSUpdate(() => { loadProducts(); });
    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      clearInterval(directTimer);
      unsubscribe();
    };
  }, [loadProducts, checkForUpdates]);

  return { products, loading };
}



// ─── Category Products Hook ───
export function useLiveCategoryProducts(categorySlug: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchCategoryProducts(categorySlug);
      if (mountedRef.current) {
        setProducts(data);
        setLoading(false);
      }
    } catch (err) {
      console.error('[LiveCMS] Failed to fetch category products:', err);
      if (mountedRef.current) setLoading(false);
    }
  }, [categorySlug]);

  const checkForUpdates = useCallback(async () => {
    try {
      const newVersion = await getCMSVersion();
      if (newVersion > versionRef.current) {
        versionRef.current = newVersion;
        await loadProducts();
      }
    } catch { /* ignore */ }
  }, [loadProducts]);

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    (async () => {
      versionRef.current = await getCMSVersion();
      await loadProducts();
    })();
    const pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);
    const directTimer = setInterval(() => { loadProducts(); }, DIRECT_REFRESH_INTERVAL);
    const unsubscribe = onCMSUpdate(() => { loadProducts(); });
    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      clearInterval(directTimer);
      unsubscribe();
    };
  }, [categorySlug, loadProducts, checkForUpdates]);

  return { products, loading };
}

// ─── Categories Hook ───
export function useLiveCategories() {
  const [categories, setCategories] = useState<CMSCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const loadCategories = useCallback(async () => {
    try {
      const data = await fetchCategories();
      if (mountedRef.current) {
        setCategories(data);
        setLoading(false);
      }
    } catch (err) {
      console.error('[LiveCMS] Failed to fetch categories:', err);
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    try {
      const newVersion = await getCMSVersion();
      if (newVersion > versionRef.current) {
        versionRef.current = newVersion;
        await loadCategories();
      }
    } catch { /* ignore */ }
  }, [loadCategories]);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      versionRef.current = await getCMSVersion();
      await loadCategories();
    })();
    const pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);
    const directTimer = setInterval(() => { loadCategories(); }, DIRECT_REFRESH_INTERVAL);
    const unsubscribe = onCMSUpdate(() => { loadCategories(); });
    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      clearInterval(directTimer);
      unsubscribe();
    };
  }, [loadCategories, checkForUpdates]);

  return { categories, loading };
}

// ─── CMS Settings Hook (hidePrices, etc.) ───
const SETTINGS_LS_KEY = 'voltz-cms-settings';

function readSettingsFromLocalStorage(): { hidePrices: boolean } | null {
  try {
    const stored = localStorage.getItem(SETTINGS_LS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object') {
        return { hidePrices: !!parsed.hidePrices };
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function useLiveCMSSettings() {
  const [settings, setSettings] = useState<{ hidePrices: boolean }>(() => {
    const lsData = readSettingsFromLocalStorage();
    return lsData || { hidePrices: false };
  });
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const loadSettings = useCallback(async () => {
    try {
      const data = await fetchConfig('cms_settings');
      if (mountedRef.current) {
        if (data && typeof data === 'object') {
          const newSettings = { hidePrices: !!data.hidePrices };
          setSettings(newSettings);
          try { localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(newSettings)); } catch { /* ignore */ }
        }
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    try {
      const newVersion = await getCMSVersion();
      if (newVersion > versionRef.current) {
        versionRef.current = newVersion;
        await loadSettings();
      }
    } catch { /* ignore */ }
  }, [loadSettings]);

  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      versionRef.current = await getCMSVersion();
      await loadSettings();
    })();

    const pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);
    const unsubscribe = onCMSUpdate(() => { loadSettings(); });
    const directRefreshTimer = setInterval(() => { loadSettings(); }, DIRECT_REFRESH_INTERVAL);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SETTINGS_LS_KEY && e.newValue && mountedRef.current) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && typeof parsed === 'object') {
            setSettings({ hidePrices: !!parsed.hidePrices });
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleLocalUpdate = () => {
      if (mountedRef.current) {
        const lsData = readSettingsFromLocalStorage();
        if (lsData) {
          setSettings(lsData);
        }
      }
    };
    window.addEventListener('voltz-settings-updated', handleLocalUpdate);

    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      clearInterval(directRefreshTimer);
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('voltz-settings-updated', handleLocalUpdate);
    };
  }, [loadSettings, checkForUpdates]);

  return { settings, loading };
}


// ─── CMS Sections Hook (section visibility, order, margins) ───
// Ensures section layout changes made in the CMS propagate to ALL visitors
// on ALL devices (desktop, tablet, mobile) immediately.
const SECTIONS_LS_KEY = 'voltz-cms-sections';

export function useLiveSections() {
  const [sections, setSections] = useState<SectionConfig[]>(() => {
    // Try to load from localStorage as initial value (fast first paint)
    try {
      const stored = localStorage.getItem(SECTIONS_LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SectionConfig[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return mergeSectionsWithDefaultsStatic(parsed);
        }
      }
    } catch { /* ignore */ }
    return DEFAULT_SECTIONS;
  });
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const loadSections = useCallback(async () => {
    try {
      console.log('[LiveCMS] Fetching sections from DB...');
      const data = await fetchConfig('cms_sections');
      if (mountedRef.current) {
        if (data && Array.isArray(data) && data.length > 0) {
          const merged = mergeSectionsWithDefaultsStatic(data);
          console.log('[LiveCMS] Sections loaded from DB:', merged.length, 'sections,', merged.filter(s => s.visible).length, 'visible');
          setSections(merged);
          try { localStorage.setItem(SECTIONS_LS_KEY, JSON.stringify(merged)); } catch { /* ignore */ }
        } else {
          console.log('[LiveCMS] No sections in DB, using defaults');
        }
        setLoading(false);
      }
    } catch (err) {
      console.error('[LiveCMS] Failed to fetch sections:', err);
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    try {
      const newVersion = await getCMSVersion();
      if (newVersion > versionRef.current) {
        console.log('[LiveCMS] Version changed:', versionRef.current, '->', newVersion, '— refreshing sections');
        versionRef.current = newVersion;
        await loadSections();
      }
    } catch { /* ignore */ }
  }, [loadSections]);

  useEffect(() => {
    mountedRef.current = true;

    // Fetch from DB on mount (source of truth)
    (async () => {
      versionRef.current = await getCMSVersion();
      await loadSections();
    })();

    // Version-based polling every 3s
    const pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);

    // Broadcast + Realtime subscription (includes visibilitychange + online handlers)
    const unsubscribe = onCMSUpdate(() => {
      console.log('[LiveCMS] CMS update received — refreshing sections');
      loadSections();
    });

    // Direct periodic refresh every 5s (fetches from DB regardless of version)
    const directRefreshTimer = setInterval(() => {
      loadSections();
    }, DIRECT_REFRESH_INTERVAL);

    // Cross-tab localStorage listener
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SECTIONS_LS_KEY && e.newValue && mountedRef.current) {
        try {
          const parsed = JSON.parse(e.newValue) as SectionConfig[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSections(mergeSectionsWithDefaultsStatic(parsed));
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Same-tab custom event listener
    const handleLocalUpdate = () => {
      if (mountedRef.current) {
        try {
          const stored = localStorage.getItem(SECTIONS_LS_KEY);
          if (stored) {
            const parsed = JSON.parse(stored) as SectionConfig[];
            if (Array.isArray(parsed) && parsed.length > 0) {
              setSections(mergeSectionsWithDefaultsStatic(parsed));
            }
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('voltz-sections-updated', handleLocalUpdate);

    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      clearInterval(directRefreshTimer);
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('voltz-sections-updated', handleLocalUpdate);
    };
  }, [loadSections, checkForUpdates]);

  const getSortedVisibleSections = useCallback(() => {
    const s = Array.isArray(sections) ? sections : DEFAULT_SECTIONS;
    return [...s].sort((a, b) => a.order - b.order).filter((x) => x.visible);
  }, [sections]);

  return { sections, loading, getSortedVisibleSections };
}

// Static helper (no useCallback needed)
function mergeSectionsWithDefaultsStatic(data: SectionConfig[]): SectionConfig[] {
  const mergedMap = new Map<string, SectionConfig>();
  DEFAULT_SECTIONS.forEach(s => mergedMap.set(s.id, { ...s }));
  data.forEach((s: SectionConfig) => {
    if (mergedMap.has(s.id)) {
      mergedMap.set(s.id, { ...mergedMap.get(s.id)!, ...s });
    }
  });
  return Array.from(mergedMap.values()).sort((a, b) => a.order - b.order);
}


// ─── Contact Details Hook ───
export function useLiveContactDetails() {
  const [contactDetails, setContactDetails] = useState<ContactDetails>(() => {
    try {
      const stored = localStorage.getItem('voltz-cms-contact');
      if (stored) {
        const parsed = JSON.parse(stored) as ContactDetails;
        const merged = { ...DEFAULT_CONTACT_DETAILS, ...parsed };
        const hasData = (merged.phones?.length > 0) || (merged.emails?.length > 0) ||
                        (merged.addresses?.length > 0) || (merged.businessHours?.length > 0);
        if (hasData) return merged;
      }
    } catch { /* ignore */ }
    return DEFAULT_CONTACT_DETAILS;
  });
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const readFromLocalStorage = useCallback((): ContactDetails | null => {
    try {
      const stored = localStorage.getItem('voltz-cms-contact');
      if (stored) {
        const parsed = JSON.parse(stored) as ContactDetails;
        const merged = { ...DEFAULT_CONTACT_DETAILS, ...parsed };
        const hasData = (merged.phones?.length > 0) || (merged.emails?.length > 0) ||
                        (merged.addresses?.length > 0) || (merged.businessHours?.length > 0);
        if (hasData) return merged;
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchConfig('contact_details');
      if (mountedRef.current) {
        if (data && typeof data === 'object') {
          const merged = { ...DEFAULT_CONTACT_DETAILS, ...data };
          const hasData = (merged.phones?.length > 0) || (merged.emails?.length > 0) ||
                          (merged.addresses?.length > 0) || (merged.businessHours?.length > 0);
          if (hasData) {
            setContactDetails(merged);
            try { localStorage.setItem('voltz-cms-contact', JSON.stringify(merged)); } catch { /* ignore */ }
            setLoading(false);
            return;
          }
        }
        const lsData = readFromLocalStorage();
        if (lsData) {
          setContactDetails(lsData);
        }
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) {
        const lsData = readFromLocalStorage();
        if (lsData) {
          setContactDetails(lsData);
        }
        setLoading(false);
      }
    }
  }, [readFromLocalStorage]);

  const checkForUpdates = useCallback(async () => {
    try {
      const newVersion = await getCMSVersion();
      if (newVersion > versionRef.current) {
        versionRef.current = newVersion;
        await loadData();
      }
    } catch { /* ignore */ }
  }, [loadData]);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      versionRef.current = await getCMSVersion();
      await loadData();
    })();
    const pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);
    const directTimer = setInterval(() => { loadData(); }, DIRECT_REFRESH_INTERVAL);
    const unsubscribe = onCMSUpdate(() => { loadData(); });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'voltz-cms-contact' && e.newValue && mountedRef.current) {
        try {
          const parsed = JSON.parse(e.newValue) as ContactDetails;
          const merged = { ...DEFAULT_CONTACT_DETAILS, ...parsed };
          const hasData = (merged.phones?.length > 0) || (merged.emails?.length > 0) ||
                          (merged.addresses?.length > 0) || (merged.businessHours?.length > 0);
          if (hasData) {
            setContactDetails(merged);
          }
        } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const handleLocalUpdate = () => {
      if (mountedRef.current) {
        const lsData = readFromLocalStorage();
        if (lsData) {
          setContactDetails(lsData);
        }
      }
    };
    window.addEventListener('voltz-contact-updated', handleLocalUpdate);

    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      clearInterval(directTimer);
      unsubscribe();
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('voltz-contact-updated', handleLocalUpdate);
    };
  }, [loadData, checkForUpdates, readFromLocalStorage]);

  return { contactDetails, loading };
}


// ─── Company Profile Hook ───
export function useLiveCompanyProfile() {
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileData>(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);
  const versionRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const loadData = useCallback(async () => {
    try {
      const data = await fetchConfig('company_profile');
      if (mountedRef.current) {
        if (data && typeof data === 'object') {
          setCompanyProfile({ ...DEFAULT_COMPANY_PROFILE, ...data });
        }
        setLoading(false);
      }
    } catch {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    try {
      const newVersion = await getCMSVersion();
      if (newVersion > versionRef.current) {
        versionRef.current = newVersion;
        await loadData();
      }
    } catch { /* ignore */ }
  }, [loadData]);

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      versionRef.current = await getCMSVersion();
      await loadData();
    })();
    const pollTimer = setInterval(checkForUpdates, POLL_INTERVAL);
    const directTimer = setInterval(() => { loadData(); }, DIRECT_REFRESH_INTERVAL);
    const unsubscribe = onCMSUpdate(() => { loadData(); });
    return () => {
      mountedRef.current = false;
      clearInterval(pollTimer);
      clearInterval(directTimer);
      unsubscribe();
    };
  }, [loadData, checkForUpdates]);

  return { companyProfile, loading };
}
