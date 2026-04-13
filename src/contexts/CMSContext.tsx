import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { broadcastCMSUpdate } from '@/lib/cmsCache';
import {
  fetchCategories as dbFetchCategories,
  saveCategory as dbSaveCategory,
  deleteCategory as dbDeleteCategory,
  cleanupOrphanedProducts as dbCleanupOrphans,
  saveConfig as dbSaveConfig,
  fetchConfig as dbFetchConfig,
  type CMSCategoryRow,
} from '@/lib/cmsData';



export interface SectionConfig {
  id: string;
  label: string;
  visible: boolean;
  order: number;
  marginTop: number;
}

export interface CMSCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  productCount: number;
  visible: boolean;
  isCustom?: boolean;
}

interface CMSSettings {
  hidePrices: boolean;
}

// ─── Contact Details ───
export interface ContactPhone {
  label: string;
  number: string;
}
export interface ContactEmail {
  label: string;
  address: string;
}
export interface ContactAddress {
  label: string;
  address: string;
}
export interface BusinessHour {
  day: string;
  hours: string;
}
export interface ContactDetails {
  phones: ContactPhone[];
  emails: ContactEmail[];
  addresses: ContactAddress[];
  businessHours: BusinessHour[];
}

// ─── Company Profile ───
export interface CompanyProfileData {
  heroTitle: string;
  heroHighlight: string;
  heroDescription: string;
  missionTitle: string;
  missionParagraphs: string[];
  stats: { label: string; value: string }[];
  values: { title: string; description: string }[];
  milestones: { year: string; title: string; desc: string }[];
  team: { name: string; role: string; desc: string }[];
  certifications: string[];
  whyChooseUs: { title: string; desc: string }[];
}

interface CMSContextType {
  sections: SectionConfig[];
  cmsPanelOpen: boolean;
  toggleCMSPanel: () => void;
  moveSection: (id: string, direction: 'up' | 'down') => void;
  toggleVisibility: (id: string) => void;
  updateMarginTop: (id: string, value: number) => void;
  resetToDefaults: () => void;
  getSortedVisibleSections: () => SectionConfig[];
  settings: CMSSettings;
  updateSettings: (settings: Partial<CMSSettings>) => void;
  categories: CMSCategory[];
  addCategory: (cat: Omit<CMSCategory, 'id'>) => void;
  updateCategory: (id: string, updates: Partial<CMSCategory>) => void;
  deleteCategory: (id: string) => Promise<{ success: boolean; error?: string }>;
  refreshCategories: () => Promise<void>;
  // Contact Details
  contactDetails: ContactDetails;
  updateContactDetails: (details: ContactDetails) => Promise<void>;
  // Company Profile
  companyProfile: CompanyProfileData;
  updateCompanyProfile: (profile: CompanyProfileData) => Promise<void>;
}



export const DEFAULT_SECTIONS: SectionConfig[] = [
  { id: 'hero', label: 'Hero Section', visible: true, order: 0, marginTop: 0 },
  { id: 'product-categories', label: 'Product Categories', visible: true, order: 1, marginTop: -1 },
  { id: 'featured-products', label: 'Featured Products (Best Sales)', visible: true, order: 2, marginTop: 0 },
  { id: 'special-offers', label: 'Special Offers', visible: true, order: 3, marginTop: 0 },
  { id: 'features', label: 'Company Features', visible: true, order: 4, marginTop: 0 },
  { id: 'industry-solutions', label: 'Industry Solutions', visible: true, order: 5, marginTop: 0 },
  { id: 'partners', label: 'Partners', visible: true, order: 6, marginTop: 0 },
  { id: 'tech-resources', label: 'Tech Resources', visible: true, order: 7, marginTop: 0 },
  { id: 'testimonials', label: 'Testimonials', visible: true, order: 8, marginTop: 0 },
  { id: 'faq', label: 'FAQ', visible: true, order: 9, marginTop: 0 },
  { id: 'cta-banner', label: 'CTA Banner', visible: true, order: 10, marginTop: 0 },
  { id: 'quote-request', label: 'Quote Request Form', visible: true, order: 11, marginTop: 0 },
];

// No hardcoded categories — all categories are managed via the CMS/database.
const DEFAULT_CATEGORIES: CMSCategory[] = [];



export const DEFAULT_CONTACT_DETAILS: ContactDetails = {
  phones: [
    { label: 'Main Office', number: '(876) 574-4682' },
    { label: 'Sales Support', number: '(876) 807-9444' },
  ],
  emails: [
    { label: 'Sales', address: 'sales@voltzsupply.com' },
  ],
  addresses: [
    { label: 'Store', address: '109 Waltham Park Road, Kingston 20, Jamaica W.I.' },
  ],
  businessHours: [
    { day: 'Mon-Fri', hours: '8:00 AM - 5:00 PM (GMT-5)' },
    { day: 'Sat', hours: '9:00 AM - 3:00 PM (GMT-5)' },
    { day: 'Sun', hours: 'Closed' },
  ],
};



export const DEFAULT_COMPANY_PROFILE: CompanyProfileData = {
  heroTitle: 'Powering Industry',
  heroHighlight: 'Since 2001',
  heroDescription: 'Voltz Industrial Supply is a leading distributor of industrial electrical components, automation equipment, and control systems. We serve thousands of businesses worldwide with quality products and exceptional service.',
  missionTitle: 'Empowering Industries with Reliable Solutions',
  missionParagraphs: [
    'At Voltz Industrial Supply, our mission is to be the most trusted partner for industrial electrical components and automation solutions. We believe that every business deserves access to high-quality products at competitive prices, backed by expert technical support.',
    'Founded in 2001, we have grown from a small Houston-based distributor to a global supplier serving over 12,000 customers across 40+ countries. Our success is built on three pillars: product quality, competitive pricing, and exceptional customer service.',
    'We maintain strategic partnerships with over 200 leading manufacturers, allowing us to offer an extensive catalog of 50,000+ products across all major industrial categories. Our state-of-the-art warehouse and logistics network ensures fast, reliable delivery worldwide.',
  ],
  stats: [
    { label: 'Years in Business', value: '25+' },
    { label: 'Products Available', value: '50,000+' },
    { label: 'Countries Served', value: '40+' },
    { label: 'Happy Customers', value: '12,000+' },
    { label: 'Partner Brands', value: '200+' },
    { label: 'Orders Fulfilled', value: '500K+' },
  ],
  values: [
    { title: 'Quality Assurance', description: 'Every product undergoes rigorous quality checks. We only source from authorized distributors and certified manufacturers to ensure authenticity and reliability.' },
    { title: 'Customer Focus', description: 'Our dedicated team of engineers and sales professionals work closely with customers to understand their unique needs and provide tailored solutions.' },
    { title: 'Innovation', description: 'We stay at the forefront of industrial technology, continuously expanding our product range to include the latest innovations in automation and control.' },
    { title: 'Excellence', description: 'Recognized as a top industrial supplier, we maintain the highest standards in product quality, customer service, and technical support.' },
  ],
  milestones: [
    { year: '2001', title: 'Company Founded', desc: 'Voltz Industrial Supply was established in Houston, TX with a focus on electrical components.' },
    { year: '2005', title: 'National Expansion', desc: 'Expanded operations to serve customers across all 50 US states with next-day shipping.' },
    { year: '2010', title: 'International Growth', desc: 'Began serving international markets, establishing partnerships with global manufacturers.' },
    { year: '2015', title: '10,000 Products', desc: 'Product catalog surpassed 10,000 SKUs across 15+ industrial categories.' },
    { year: '2018', title: 'Digital Transformation', desc: 'Launched our e-commerce platform with real-time inventory and online ordering.' },
    { year: '2022', title: 'ISO 9001 Certified', desc: 'Achieved ISO 9001:2015 certification for quality management systems.' },
    { year: '2024', title: '50,000+ Products', desc: 'Expanded catalog to over 50,000 products from 200+ leading brands worldwide.' },
    { year: '2026', title: 'AI-Powered Platform', desc: 'Integrated AI-driven product recommendations and predictive inventory management.' },
  ],
  team: [
    { name: 'Robert Chen', role: 'CEO & Founder', desc: '25+ years in industrial distribution' },
    { name: 'Sarah Mitchell', role: 'VP of Operations', desc: 'Supply chain & logistics expert' },
    { name: 'David Kowalski', role: 'Chief Technology Officer', desc: 'Digital transformation leader' },
    { name: 'Maria Santos', role: 'Head of Sales', desc: 'Industrial sales strategist' },
    { name: 'James Okafor', role: 'Chief Engineer', desc: 'Automation & controls specialist' },
    { name: 'Lisa Park', role: 'Customer Success Director', desc: 'Customer experience champion' },
  ],
  certifications: [
    'ISO 9001:2015 Certified',
    'UL Listed Distributor',
    'Authorized Siemens Partner',
    'ABB Value Provider',
    'Schneider Electric Alliance Partner',
    'NEMA Member',
    'EASA Accredited',
    'IEC Standards Compliant',
  ],
  whyChooseUs: [
    { title: 'Authorized Distributor', desc: 'Official partner of 200+ leading industrial brands worldwide.' },
    { title: 'Fast Shipping', desc: 'Same-day dispatch on orders before 2 PM. 2-5 day delivery across the US.' },
    { title: '24/7 Support', desc: 'Round-the-clock technical support from certified engineers.' },
    { title: 'Quality Guaranteed', desc: 'All products are genuine, tested, and backed by manufacturer warranty.' },
  ],
};

const STORAGE_KEY = 'voltz-cms-sections';
const SETTINGS_STORAGE_KEY = 'voltz-cms-settings';
const CATEGORIES_STORAGE_KEY = 'voltz-cms-categories';
const CONTACT_STORAGE_KEY = 'voltz-cms-contact';
const PROFILE_STORAGE_KEY = 'voltz-cms-profile';

const DEFAULT_SETTINGS: CMSSettings = {
  hidePrices: false,
};

const CMSContext = createContext<CMSContextType>({
  sections: DEFAULT_SECTIONS,
  cmsPanelOpen: false,
  toggleCMSPanel: () => {},
  moveSection: () => {},
  toggleVisibility: () => {},
  updateMarginTop: () => {},
  resetToDefaults: () => {},
  getSortedVisibleSections: () => DEFAULT_SECTIONS,
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {},
  categories: DEFAULT_CATEGORIES,
  addCategory: () => {},
  updateCategory: () => {},
  deleteCategory: async () => ({ success: false }),
  refreshCategories: async () => {},
  contactDetails: DEFAULT_CONTACT_DETAILS,
  updateContactDetails: async () => {},
  companyProfile: DEFAULT_COMPANY_PROFILE,
  updateCompanyProfile: async () => {},
});




export const useCMS = () => useContext(CMSContext);

// Export helper to load settings from localStorage (for non-context usage)
export function loadCMSSettings(): CMSSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch { /* ignore corrupt localStorage */ }
  return DEFAULT_SETTINGS;
}

// Export helper to load categories from localStorage
export function loadCMSCategories(): CMSCategory[] {
  try {
    const stored = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as CMSCategory[];
      if (parsed.length > 0) return parsed;
    }
  } catch { /* ignore corrupt localStorage */ }
  return DEFAULT_CATEGORIES;
}


// Export helper to load contact details from localStorage
export function loadContactDetails(): ContactDetails {
  try {
    const stored = localStorage.getItem(CONTACT_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ContactDetails>;
      const merged = { ...DEFAULT_CONTACT_DETAILS, ...parsed };
      const phones = Array.isArray(merged.phones) ? merged.phones : DEFAULT_CONTACT_DETAILS.phones;
      const emails = Array.isArray(merged.emails) ? merged.emails : DEFAULT_CONTACT_DETAILS.emails;
      const addresses = Array.isArray(merged.addresses) ? merged.addresses : DEFAULT_CONTACT_DETAILS.addresses;
      const businessHours = Array.isArray(merged.businessHours)
        ? merged.businessHours
        : DEFAULT_CONTACT_DETAILS.businessHours;
      const out: ContactDetails = { ...merged, phones, emails, addresses, businessHours };
      const hasData =
        out.phones.length > 0 ||
        out.emails.length > 0 ||
        out.addresses.length > 0 ||
        out.businessHours.length > 0;
      if (hasData) return out;
    }
  } catch { /* ignore corrupt localStorage */ }
  return DEFAULT_CONTACT_DETAILS;
}


// Export helper to load company profile from localStorage
export function loadCompanyProfile(): CompanyProfileData {
  try {
    const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (stored) return { ...DEFAULT_COMPANY_PROFILE, ...JSON.parse(stored) };
  } catch { /* ignore corrupt localStorage */ }
  return DEFAULT_COMPANY_PROFILE;
}

export const CMSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sections, setSections] = useState<SectionConfig[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SectionConfig[];
        const mergedMap = new Map<string, SectionConfig>();
        DEFAULT_SECTIONS.forEach(s => mergedMap.set(s.id, { ...s }));
        parsed.forEach(s => {
          if (mergedMap.has(s.id)) {
            mergedMap.set(s.id, { ...mergedMap.get(s.id)!, ...s });
          }
        });
        return Array.from(mergedMap.values()).sort((a, b) => a.order - b.order);
      }
    } catch { /* ignore corrupt localStorage */ }
    return DEFAULT_SECTIONS;
  });

  const [cmsPanelOpen, setCmsPanelOpen] = useState(false);

  const [settings, setSettings] = useState<CMSSettings>(() => {
    return loadCMSSettings();
  });

  const [categories, setCategories] = useState<CMSCategory[]>(() => {
    return loadCMSCategories();
  });

  const [contactDetails, setContactDetails] = useState<ContactDetails>(() => {
    return loadContactDetails();
  });

  const [companyProfile, setCompanyProfile] = useState<CompanyProfileData>(() => {
    return loadCompanyProfile();
  });

  // On mount, load categories from Supabase if available
  useEffect(() => {
    (async () => {
      try {
        const dbCategories = await dbFetchCategories();
        if (dbCategories.length > 0) {
          setCategories(dbCategories);
          localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(dbCategories));
        }
      } catch (err) {
        console.error('[CMS] Failed to load categories from Supabase:', err);
      }
    })();
  }, []);

  // On mount, load settings from Supabase if available
  useEffect(() => {
    (async () => {
      try {
        const dbSettings = await dbFetchConfig('cms_settings');
        if (dbSettings && typeof dbSettings === 'object') {
          const merged = { ...DEFAULT_SETTINGS, ...dbSettings };
          setSettings(merged);
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
        }
      } catch (err) {
        console.error('[CMS] Failed to load settings from Supabase:', err);
      }
    })();
  }, []);

  // On mount, load sections from Supabase if available
  useEffect(() => {
    (async () => {
      try {
        const dbSections = await dbFetchConfig('cms_sections');
        if (dbSections && Array.isArray(dbSections) && dbSections.length > 0) {
          const mergedMap = new Map<string, SectionConfig>();
          DEFAULT_SECTIONS.forEach(s => mergedMap.set(s.id, { ...s }));
          dbSections.forEach((s: SectionConfig) => {
            if (mergedMap.has(s.id)) {
              mergedMap.set(s.id, { ...mergedMap.get(s.id)!, ...s });
            }
          });
          const merged = Array.from(mergedMap.values()).sort((a, b) => a.order - b.order);
          setSections(merged);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        }
      } catch (err) {
        console.error('[CMS] Failed to load sections from Supabase:', err);
      }
    })();
  }, []);

  // On mount, load contact details from Supabase
  useEffect(() => {
    (async () => {
      try {
        const dbContact = await dbFetchConfig('contact_details');
        if (dbContact && typeof dbContact === 'object') {
          const merged = { ...DEFAULT_CONTACT_DETAILS, ...dbContact };
          // Only use DB data if it has actual content
          const hasData = merged.phones?.length > 0 || merged.emails?.length > 0 ||
                          merged.addresses?.length > 0 || merged.businessHours?.length > 0;
          if (hasData) {
            setContactDetails(merged);
            localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(merged));
          }
        }
      } catch (err) {
        console.error('[CMS] Failed to load contact details from Supabase:', err);
      }
    })();
  }, []);


  // On mount, load company profile from Supabase
  useEffect(() => {
    (async () => {
      try {
        const dbProfile = await dbFetchConfig('company_profile');
        if (dbProfile && typeof dbProfile === 'object') {
          const merged = { ...DEFAULT_COMPANY_PROFILE, ...dbProfile };
          setCompanyProfile(merged);
          localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(merged));
        }
      } catch (err) {
        console.error('[CMS] Failed to load company profile from Supabase:', err);
      }
    })();
  }, []);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(sections)); }, [sections]);
  useEffect(() => { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories)); }, [categories]);
  useEffect(() => { localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(contactDetails)); }, [contactDetails]);
  useEffect(() => { localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(companyProfile)); }, [companyProfile]);

  const toggleCMSPanel = useCallback(() => {
    setCmsPanelOpen(prev => !prev);
  }, []);

  const moveSection = useCallback((id: string, direction: 'up' | 'down') => {
    setSections(prev => {
      const base = Array.isArray(prev) ? prev : DEFAULT_SECTIONS;
      const sorted = [...base].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const newSections = sorted.map(s => ({ ...s }));
      const tempOrder = newSections[idx].order;
      newSections[idx].order = newSections[swapIdx].order;
      newSections[swapIdx].order = tempOrder;
      return newSections.sort((a, b) => a.order - b.order);
    });
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setSections((prev) => {
      const base = Array.isArray(prev) ? prev : DEFAULT_SECTIONS;
      return base.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s));
    });
  }, []);

  const updateMarginTop = useCallback((id: string, value: number) => {
    setSections((prev) => {
      const base = Array.isArray(prev) ? prev : DEFAULT_SECTIONS;
      return base.map((s) => (s.id === id ? { ...s, marginTop: value } : s));
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setSections(DEFAULT_SECTIONS);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getSortedVisibleSections = useCallback(() => {
    const s = Array.isArray(sections) ? sections : DEFAULT_SECTIONS;
    return [...s].sort((a, b) => a.order - b.order).filter((x) => x.visible);
  }, [sections]);

  const updateSettings = useCallback((newSettings: Partial<CMSSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      // Save to localStorage immediately (synchronous — guaranteed for same-browser)
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
      // Dispatch same-tab custom event so useLiveCMSSettings picks it up instantly
      window.dispatchEvent(new CustomEvent('voltz-settings-updated'));

      // Save to DB (async) — fire and handle errors
      (async () => {
        try {
          console.log('[CMS] Saving settings to DB:', updated);
          const success = await dbSaveConfig('cms_settings', updated);
          if (!success) {
            console.error('[CMS] dbSaveConfig returned false for cms_settings — retrying...');
            const retry = await dbSaveConfig('cms_settings', updated);
            if (!retry) {
              console.error('[CMS] Retry also failed for cms_settings');
            }
          } else {
            console.log('[CMS] Settings saved to DB successfully');
          }
          // Broadcast update with specific key (bumps version + sends Broadcast message)
          await broadcastCMSUpdate('cms_settings');
          console.log('[CMS] CMS update broadcast completed');
        } catch (err) {
          console.error('[CMS] Failed to save settings to DB:', err);
          // Try one more time
          try {
            await dbSaveConfig('cms_settings', updated);
            await broadcastCMSUpdate('cms_settings');
          } catch (retryErr) {
            console.error('[CMS] Retry also failed:', retryErr);
          }
        }
      })();

      return updated;
    });
  }, []);




  const addCategory = useCallback((cat: Omit<CMSCategory, 'id'>) => {
    const id = `cat-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newCat: CMSCategory = { ...cat, id };
    setCategories(prev => {
      const updated = [...prev, newCat];
      dbSaveCategory({
        id: newCat.id, slug: newCat.slug, name: newCat.name, description: newCat.description,
        color: newCat.color, icon: newCat.icon, productCount: newCat.productCount,
        visible: newCat.visible,
      }).then(() => { broadcastCMSUpdate(); });
      return updated;
    });
  }, []);


  const updateCategory = useCallback((id: string, updates: Partial<CMSCategory>) => {
    setCategories(prev => {
      const updated = prev.map(c => (c.id === id ? { ...c, ...updates } : c));
      const updatedCat = updated.find(c => c.id === id);
      if (updatedCat) {
        dbSaveCategory({
          id: updatedCat.id, slug: updatedCat.slug, name: updatedCat.name,
          description: updatedCat.description, color: updatedCat.color, icon: updatedCat.icon,
          productCount: updatedCat.productCount, visible: updatedCat.visible,
        }).then(() => { broadcastCMSUpdate(); });
      }
      return updated;
    });
  }, []);


  const deleteCategory = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    // Save backup for rollback
    const backup = [...(Array.isArray(categories) ? categories : [])];
    // Optimistic: remove from local state immediately
    setCategories(prev => prev.filter(c => c.id !== id));

    try {
      // Delete from DB (RPC deletes category + its products in one transaction)
      const result = await dbDeleteCategory(id);
      if (!result.success) {
        // Rollback
        setCategories(backup);
        return { success: false, error: result.error || 'Database delete failed' };
      }

      // Re-fetch from DB to ensure local state matches reality
      const freshCategories = await dbFetchCategories();
      if (freshCategories.length > 0 || backup.length <= 1) {
        setCategories(freshCategories);
        localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(freshCategories));
      }

      // Broadcast to all visitors on all devices
      await broadcastCMSUpdate();
      return { success: true };
    } catch (err) {
      // Rollback on exception
      setCategories(backup);
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  }, [categories]);

  const refreshCategories = useCallback(async () => {
    try {
      const dbCategories = await dbFetchCategories();
      setCategories(dbCategories);
      localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(dbCategories));
    } catch (err) {
      console.error('[CMS] refreshCategories failed:', err);
    }
  }, []);

  const updateContactDetails = useCallback(async (details: ContactDetails) => {
    setContactDetails(details);
    localStorage.setItem(CONTACT_STORAGE_KEY, JSON.stringify(details));
    window.dispatchEvent(new CustomEvent('voltz-contact-updated'));
    try {
      const saved = await dbSaveConfig('contact_details', details);
      if (!saved) await dbSaveConfig('contact_details', details);
    } catch (err) {
      console.error('[CMS] Failed to save contact_details to DB:', err);
    }
    try { await broadcastCMSUpdate(); } catch { /* ignore */ }
  }, []);

  const updateCompanyProfile = useCallback(async (profile: CompanyProfileData) => {
    setCompanyProfile(profile);
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    await dbSaveConfig('company_profile', profile);
    await broadcastCMSUpdate();
  }, []);

  return (
    <CMSContext.Provider
      value={{
        sections, cmsPanelOpen, toggleCMSPanel, moveSection, toggleVisibility,
        updateMarginTop, resetToDefaults, getSortedVisibleSections,
        settings, updateSettings,
        categories, addCategory, updateCategory, deleteCategory, refreshCategories,
        contactDetails, updateContactDetails,
        companyProfile, updateCompanyProfile,
      }}
    >
      {children}
    </CMSContext.Provider>
  );
};

