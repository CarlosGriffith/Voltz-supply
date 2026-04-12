import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';

import { createPortal } from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Home, ChevronRight, Search, Grid3X3, List, ArrowUpDown,
  Star, Heart, FileText, Download, GitCompare, X,
  ChevronDown, SlidersHorizontal, ArrowLeft, Phone, Mail, Globe,
  Menu, User, ExternalLink, Info, Package, Shield, Clock,
  CheckCircle, AlertCircle, ZoomIn
} from 'lucide-react';
import { type Product } from '@/data/products';
import { useCMS, type CMSCategory } from '@/contexts/CMSContext';
import { getIconComponent } from '@/lib/iconMap';
import ProductFilterSidebar, { type FilterState } from '@/components/voltz/ProductFilterSidebar';
import { useLiveCategoryProducts, useLiveCategories, useLiveCMSSettings, useLiveContactDetails } from '@/hooks/useLiveCMSData';
import QuoteRequest from '@/components/voltz/QuoteRequest';
import ImageSlideshow from '@/components/voltz/ImageSlideshow';


const LOGO_URL = 'https://d64gsuwffb70l.cloudfront.net/6995573664728a165adc7a9f_1772110039178_7206a7df.png';


// Tag color mapping
function getTagColor(tag: string): string {
  const map: Record<string, string> = {
    'Best Seller': 'bg-red-600',
    'New': 'bg-blue-600',
    'Popular': 'bg-green-600',
    'Best Value': 'bg-purple-600',
    'Premium': 'bg-amber-600',
    'Top Rated': 'bg-cyan-600',
  };
  return map[tag] || 'bg-gray-500';
}

function parseBadgeTags(badge?: string): string[] {
  if (!badge) return [];
  return badge.split(',').map(t => t.trim()).filter(Boolean);
}

/* ─── Price or Quote Buttons Component ─── */
const PriceOrQuote: React.FC<{
  product: Product;
  hidePrices: boolean;
  phones: { label: string; number: string }[];
  onRequestQuote: () => void;
  size?: 'sm' | 'lg';
}> = ({ product, hidePrices, phones, onRequestQuote, size = 'sm' }) => {
  if (hidePrices) {
    const primaryPhone = phones[0];
    const telHref = primaryPhone ? `tel:${primaryPhone.number.replace(/[^+\d]/g, '')}` : '#';
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); onRequestQuote(); }}
          className={`flex items-center gap-1.5 bg-[#e31e24] text-white rounded-lg font-semibold hover:bg-[#c91a1f] transition-colors shadow-sm ${
            size === 'lg' ? 'px-5 py-2.5 text-sm' : 'px-3 py-2 text-xs'
          }`}
        >
          Request a Quote
        </button>
        <a
          href={telHref}
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center justify-center bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors shadow-sm ${
            size === 'lg' ? 'w-10 h-10' : 'w-8 h-8'
          }`}
          title={primaryPhone ? `Call ${primaryPhone.number}` : 'Call us'}
        >
          <Phone className={size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} />
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {size === 'lg' ? (
        <>
          <span className="text-3xl font-extrabold text-[#1a2332]">${product.price.toLocaleString()}</span>
          {product.originalPrice > product.price && (
            <>
              <span className="text-lg text-gray-400 line-through">${product.originalPrice.toLocaleString()}</span>
              <span className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                Save ${(product.originalPrice - product.price).toLocaleString()}
              </span>
            </>
          )}
        </>
      ) : (
        <>
          <span className="text-xl font-extrabold text-[#1a2332]">${product.price.toLocaleString()}</span>
          {product.originalPrice > product.price && (
            <span className="text-sm text-gray-400 line-through ml-1.5">${product.originalPrice.toLocaleString()}</span>
          )}
        </>
      )}
    </div>
  );
};

/* ─── Product Detail Modal ─── */
const ProductDetailModal: React.FC<{
  product: Product;
  onClose: () => void;
  onCompare: (p: Product) => void;
  compareList: Product[];
  hidePrices?: boolean;
  categorySlug: string;
  phones: { label: string; number: string }[];
  onRequestQuote: () => void;
}> = ({ product, onClose, onCompare, compareList, hidePrices, categorySlug, phones, onRequestQuote }) => {
  const [activeTab, setActiveTab] = useState<'features' | 'specs' | 'docs'>('features');
  const [selectedImage, setSelectedImage] = useState<string>(product.image || '');
  const [slideshowOpen, setSlideshowOpen] = useState(false);

  const isInCompare = compareList.some(p => p.id === product.id);

  const allImages = useMemo(() => {
    const imgs: string[] = [];
    if (product.image) imgs.push(product.image);
    if (product.additionalImages && product.additionalImages.length > 0) {
      imgs.push(...product.additionalImages.filter(Boolean));
    }
    return imgs;
  }, [product.image, product.additionalImages]);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !slideshowOpen) onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, slideshowOpen]);

  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-10 pb-10 px-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl animate-slide-in my-auto">
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <p className="text-xs font-semibold text-[#e31e24] uppercase tracking-wider">{product.category}</p>
            <h2 className="text-xl font-bold text-[#1a2332]">{product.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>

        <div className="p-6 lg:p-8">
          <div className="grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2 space-y-4">
              {/* Main Image - CLICKABLE for slideshow */}
              <button
                type="button"
                className="bg-gray-50 rounded-xl aspect-square w-full flex items-center justify-center border border-gray-100 overflow-hidden cursor-zoom-in group/img relative"
                onClick={() => { if (allImages.length > 0) setSlideshowOpen(true); }}
              >
                {selectedImage ? (
                  <>
                    <img src={selectedImage} alt={product.name} className="w-full h-full object-contain p-4 transition-transform group-hover/img:scale-105" />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                      <div className="opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/60 text-white text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-2 shadow-lg">
                        <ZoomIn className="w-4 h-4" />
                        {allImages.length > 1 ? `View all ${allImages.length} photos` : 'Click to enlarge'}
                      </div>
                    </div>
                    {/* Always-visible zoom badge */}
                    <div className="absolute bottom-2 right-2 bg-black/40 text-white rounded-lg p-1.5 pointer-events-none">
                      <ZoomIn className="w-4 h-4" />
                    </div>
                  </>
                ) : (
                  <Package className="w-24 h-24 text-gray-300" />
                )}
              </button>

              {/* Thumbnails */}
              {allImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {allImages.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(img)}
                      className={`w-16 h-16 flex-shrink-0 rounded-lg border-2 overflow-hidden bg-white transition-all ${
                        selectedImage === img ? 'border-[#e31e24] shadow-md' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <img src={img} alt={`View ${idx + 1}`} className="w-full h-full object-contain p-1" />
                    </button>
                  ))}
                </div>
              )}

              {/* Quick Info Cards */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 leading-tight">Part Number</p>
                  <p className="font-bold text-[#1a2332] text-xs mt-0.5">{product.partNumber || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 leading-tight">Brand</p>
                  <p className="font-bold text-[#1a2332] text-xs mt-0.5">{product.brand}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 leading-tight">Voltage</p>
                  <p className="font-bold text-[#1a2332] text-xs mt-0.5">{product.voltage || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 leading-tight">Amperage</p>
                  <p className="font-bold text-[#1a2332] text-xs mt-0.5">{product.amperage || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 leading-tight">Phase</p>
                  <p className="font-bold text-[#1a2332] text-xs mt-0.5">{product.phase || 'N/A'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 leading-tight">Power</p>
                  <p className="font-bold text-[#1a2332] text-xs mt-0.5">{product.power || 'N/A'}</p>
                </div>
              </div>

              <PriceOrQuote product={product} hidePrices={!!hidePrices} phones={phones} onRequestQuote={() => { onClose(); onRequestQuote(); }} size="lg" />

              {/* Stock + Availability */}
              <div className="space-y-2">
                {product.stockCount != null && product.stockCount === 0 ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    Out of Stock — Contact for ETA
                  </div>
                ) : product.stockCount != null && product.stockCount <= 5 ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                      <AlertCircle className="w-4 h-4" />
                      Only {product.stockCount} left — order soon!
                    </div>
                  </div>
                ) : product.stockCount != null && product.stockCount > 5 ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    {product.stockCount} units available
                  </div>
                ) : (
                  <div className={`flex items-center gap-2 text-sm font-semibold ${product.inStock ? 'text-green-600' : 'text-red-500'}`}>
                    {product.inStock ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {product.inStock ? 'In Stock — Ships Today' : 'Out of Stock — Contact for ETA'}
                  </div>
                )}
              </div>

              <button
                onClick={() => onCompare(product)}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${
                  isInCompare ? 'border-[#e31e24] bg-red-50 text-[#e31e24]' : 'border-gray-200 text-gray-600 hover:border-[#e31e24] hover:text-[#e31e24]'
                }`}
              >
                <GitCompare className="w-4 h-4" />
                {isInCompare ? 'Remove from Compare' : 'Add to Compare'}
              </button>
            </div>

            <div className="lg:col-span-3">
              <p className="text-gray-600 leading-relaxed mb-6">{product.description}</p>
              <div className="border-b border-gray-200 mb-4">
                <div className="flex gap-1">
                  {[
                    { key: 'features' as const, label: 'Key Features', icon: CheckCircle },
                    { key: 'specs' as const, label: 'Technical Specs', icon: Info },
                    { key: 'docs' as const, label: 'Documents', icon: FileText },
                  ].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === tab.key ? 'border-[#e31e24] text-[#e31e24]' : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}>
                      <tab.icon className="w-4 h-4" />{tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'features' && (
                <div>
                  {product.features && product.features.length > 0 ? (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {product.features.map((f, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                          <CheckCircle className="w-4 h-4 text-[#e31e24] flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-gray-600">{f}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400"><CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No features listed.</p></div>
                  )}
                </div>
              )}

              {activeTab === 'specs' && (
                <div className="space-y-2">
                  {product.specs && Object.keys(product.specs).length > 0 ? (
                    <>
                      {Object.entries(product.specs).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-500">{key}</span>
                          <span className="text-sm font-semibold text-[#1a2332]">{value}</span>
                        </div>
                      ))}
                      {product.dimensions && product.dimensions !== 'N/A' && (
                        <div className="flex items-center justify-between py-2 border-b border-gray-50">
                          <span className="text-sm text-gray-500">Dimensions</span>
                          <span className="text-sm font-semibold text-[#1a2332]">{product.dimensions}</span>
                        </div>
                      )}
                      {product.weight && (
                        <div className="flex items-center justify-between py-2">
                          <span className="text-sm text-gray-500">Weight</span>
                          <span className="text-sm font-semibold text-[#1a2332]">{product.weight}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-400"><Info className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No specs available.</p></div>
                  )}
                </div>
              )}

              {activeTab === 'docs' && (
                <div className="space-y-3">
                  {product.documents && product.documents.length > 0 ? (
                    product.documents.map((doc, i) => (
                      <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer"
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-[#e31e24]/30 hover:bg-red-50/30 transition-all text-left group">
                        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5 text-[#e31e24]" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1a2332] truncate">{doc.name || 'Document'}</p>
                          <p className="text-xs text-gray-400">{[doc.type, doc.size].filter(Boolean).join(' — ') || 'Download'}</p>
                        </div>
                        <Download className="w-4 h-4 text-gray-400 group-hover:text-[#e31e24] transition-colors" />
                      </a>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400"><FileText className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No documents available.</p></div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Image Slideshow */}
      {slideshowOpen && allImages.length > 0 && (
        <ImageSlideshow
          images={allImages}
          startIndex={Math.max(0, allImages.indexOf(selectedImage))}
          alt={product.name}
          onClose={() => setSlideshowOpen(false)}
        />
      )}
    </div>
  );
};



/* ─── Comparison Panel ─── */
const ComparisonPanel: React.FC<{
  products: Product[];
  onRemove: (id: string) => void;
  onClear: () => void;
  hidePrices?: boolean;
}> = ({ products, onRemove, onClear, hidePrices }) => {
  const [expanded, setExpanded] = useState(false);

  if (products.length === 0) return null;

  const allSpecKeys = Array.from(
    new Set(products.flatMap(p => Object.keys(p.specs || {})))
  );

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-[#e31e24] shadow-2xl">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <GitCompare className="w-5 h-5 text-[#e31e24]" />
            <span className="font-bold text-[#1a2332]">Compare ({products.length}/3)</span>
            <div className="flex gap-2">
              {products.map(p => (
                <div key={p.id} className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5">
                  <span className="text-xs font-medium text-[#1a2332] max-w-[120px] truncate">{p.name}</span>
                  <button onClick={() => onRemove(p.id)} className="text-gray-400 hover:text-red-500">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClear} className="text-sm text-gray-500 hover:text-red-500 font-medium">Clear All</button>
            <button
              onClick={() => setExpanded(!expanded)}
              disabled={products.length < 2}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                products.length >= 2
                  ? 'bg-[#e31e24] text-white hover:bg-[#c91a1f] shadow-md'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              {expanded ? 'Hide' : 'Compare Now'}
            </button>
          </div>
        </div>
      </div>

      {expanded && products.length >= 2 && (
        <div className="border-t border-gray-200 max-h-[60vh] overflow-y-auto bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6">
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-bold text-gray-400 w-48 sticky left-0 bg-gray-50">Specification</th>
                    {products.map(p => (
                      <th key={p.id} className="text-left py-3 px-4 min-w-[200px]">
                        <p className="text-xs text-[#e31e24] font-semibold">{p.brand}</p>
                        <p className="font-bold text-[#1a2332] text-sm">{p.name}</p>
                        {!hidePrices && (
                          <p className="text-lg font-extrabold text-[#1a2332] mt-1">${p.price.toLocaleString()}</p>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-200">
                    <td className="py-2.5 px-4 text-sm text-gray-500 sticky left-0 bg-gray-50 font-medium">Rating</td>
                    {products.map(p => (
                      <td key={p.id} className="py-2.5 px-4">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          <span className="text-sm font-semibold text-[#1a2332]">{p.rating}</span>
                          <span className="text-xs text-gray-400">({p.reviews})</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                  <tr className="border-t border-gray-200">
                    <td className="py-2.5 px-4 text-sm text-gray-500 sticky left-0 bg-gray-50 font-medium">Availability</td>
                    {products.map(p => (
                      <td key={p.id} className="py-2.5 px-4">
                        <span className={`text-sm font-semibold ${p.inStock ? 'text-green-600' : 'text-red-500'}`}>
                          {p.inStock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </td>
                    ))}
                  </tr>
                  {allSpecKeys.map(key => (
                    <tr key={key} className="border-t border-gray-200">
                      <td className="py-2.5 px-4 text-sm text-gray-500 sticky left-0 bg-gray-50 font-medium">{key}</td>
                      {products.map(p => (
                        <td key={p.id} className="py-2.5 px-4 text-sm font-medium text-[#1a2332]">
                          {(p.specs || {})[key] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ProductCategory: React.FC = () => {
  const { category } = useParams<{ category: string }>();
  const navigate = useNavigate();
  const categorySlug = category || 'inverters';

  // Fetch data from Supabase (live, polls for updates across all devices)
  const { products: allProducts, loading: productsLoading } = useLiveCategoryProducts(categorySlug);
  const { categories: liveCategories, loading: categoriesLoading } = useLiveCategories();
  const { settings: cmsSettings } = useLiveCMSSettings();
  const { contactDetails } = useLiveContactDetails();

  const primaryPhone = contactDetails.phones[0];
  const primaryEmail = contactDetails.emails[0];
  const firstHours = contactDetails.businessHours[0];

  // Fall back to CMS context categories if Supabase categories are empty
  const { categories: contextCategories } = useCMS();
  const cmsCategories = useMemo(() => {
    if (liveCategories.length > 0) return liveCategories;
    return contextCategories;
  }, [liveCategories, contextCategories]);

  const visibleCategories = useMemo(() => cmsCategories.filter((c: any) => c.visible), [cmsCategories]);

  // Find current category info
  const catInfo = useMemo(() => {
    return cmsCategories.find((c: any) => c.slug === categorySlug);
  }, [cmsCategories, categorySlug]);

  const maxPrice = useMemo(() => Math.max(...allProducts.map(p => p.price), 0), [allProducts]);

  // Extract unique brands from products
  const brands = useMemo(() => {
    return Array.from(new Set(allProducts.map(p => p.brand))).sort();
  }, [allProducts]);

  const [filters, setFilters] = useState<FilterState>({
    priceRange: [0, 99999],
    brands: [],
    specs: {},
    inStockOnly: false,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('popular');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [compareList, setCompareList] = useState<Product[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteContext, setQuoteContext] = useState<{ categorySlug?: string; productName?: string }>({});


  useEffect(() => {
    setFilters({ priceRange: [0, 99999], brands: [], specs: {}, inStockOnly: false });
    setSearchQuery('');
    setCompareList([]);
    setSelectedProduct(null);
    window.scrollTo(0, 0);
  }, [categorySlug]);

  // Keep selectedProduct in sync with latest live data (e.g. stock count changes from CMS)
  // This ensures the product detail modal always shows the most current data
  useEffect(() => {
    if (selectedProduct) {
      const updated = allProducts.find(p => p.id === selectedProduct.id);
      if (updated && (
        updated.stockCount !== selectedProduct.stockCount ||
        updated.inStock !== selectedProduct.inStock ||
        updated.price !== selectedProduct.price ||
        updated.name !== selectedProduct.name ||
        updated.image !== selectedProduct.image
      )) {
        setSelectedProduct(updated);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allProducts]);


  const filteredProducts = useMemo(() => {
    let result = allProducts;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.partNumber.toLowerCase().includes(q)
      );
    }

    result = result.filter(p => p.price >= filters.priceRange[0] && p.price <= filters.priceRange[1]);

    if (filters.brands.length > 0) {
      result = result.filter(p => filters.brands.includes(p.brand));
    }

    if (filters.inStockOnly) {
      result = result.filter(p => p.inStock);
    }

    switch (sortBy) {
      case 'price-low': result = [...result].sort((a, b) => a.price - b.price); break;
      case 'price-high': result = [...result].sort((a, b) => b.price - a.price); break;
      case 'rating': result = [...result].sort((a, b) => b.rating - a.rating); break;
      case 'name': result = [...result].sort((a, b) => a.name.localeCompare(b.name)); break;
      default: break;
    }

    return result;
  }, [allProducts, searchQuery, filters, sortBy]);

  const toggleCompare = useCallback((product: Product) => {
    setCompareList(prev => {
      if (prev.some(p => p.id === product.id)) {
        return prev.filter(p => p.id !== product.id);
      }
      if (prev.length >= 3) return prev;
      return [...prev, product];
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const CatIcon = getIconComponent(catInfo?.icon || 'Package');

  if (!catInfo && !categoriesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-[#1a2332] mb-4">Category Not Found</h1>
          <p className="text-gray-500 mb-4">This category doesn't exist or hasn't been added to the CMS yet.</p>
          <Link to="/" className="text-[#e31e24] font-semibold hover:underline">Return to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Top Bar */}
      <div className="bg-[#0f1923] text-gray-300 text-sm hidden lg:block">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-10">
          <div className="flex items-center gap-6">
            {primaryPhone && (
              <a href={`tel:${primaryPhone.number.replace(/[^+\d]/g, '')}`} className="flex items-center gap-1.5 hover:text-white transition-colors"><Phone className="w-3.5 h-3.5" /><span>{primaryPhone.number}</span></a>
            )}
            {primaryEmail && (
              <a href={`mailto:${primaryEmail.address}`} className="flex items-center gap-1.5 hover:text-white transition-colors"><Mail className="w-3.5 h-3.5" /><span>{primaryEmail.address}</span></a>
            )}
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" />Shipping Worldwide</span>
            {firstHours && <span>{firstHours.day}: {firstHours.hours}</span>}
          </div>
        </div>
      </div>


      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md shadow-lg">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16 lg:h-20">
            <Link to="/" className="flex-shrink-0">
              <img src={LOGO_URL} alt="Voltz Industrial Supply" className="h-10 lg:h-14 w-auto" />
            </Link>

            <nav className="hidden lg:flex items-center gap-1">
              <Link to="/" className="px-3 py-2 text-[#1a2332] font-medium text-sm hover:text-[#e31e24] transition-colors rounded-lg hover:bg-red-50">Home</Link>
              <div className="relative group">
                <button className="px-3 py-2 text-[#e31e24] font-medium text-sm flex items-center gap-1 rounded-lg bg-red-50">
                  Products <ChevronDown className="w-4 h-4" />
                </button>
                <div className="absolute top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all max-h-[70vh] overflow-y-auto">
                  {visibleCategories.map((cat: any) => {
                    const Icon = getIconComponent(cat.icon);
                    return (
                      <Link
                        key={cat.id}
                        to={`/products/${cat.slug}`}
                        className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                          cat.slug === categorySlug ? 'bg-red-50 text-[#e31e24]' : 'hover:bg-gray-50 text-[#1a2332]'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="font-medium text-sm">{cat.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
              <Link to="/" className="px-3 py-2 text-[#1a2332] font-medium text-sm hover:text-[#e31e24] transition-colors rounded-lg hover:bg-red-50">Contact</Link>
            </nav>
            <div className="flex items-center gap-2">
              <button className="hidden lg:flex p-2 rounded-lg hover:bg-gray-100 text-[#1a2332]"><User className="w-5 h-5" /></button>
              <Link to="/" className="hidden lg:flex items-center gap-2 bg-[#e31e24] text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#c91a1f] transition-colors shadow-md shadow-red-200">Request Quote</Link>
              <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-[#1a2332]">
                {mobileNavOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>
        {mobileNavOpen && (
          <div className="lg:hidden bg-white border-t border-gray-100 animate-slide-in max-h-[70vh] overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
              <Link to="/" className="block px-4 py-3 rounded-lg hover:bg-red-50 font-medium text-[#1a2332]">Home</Link>
              <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Products</div>
              {visibleCategories.map((cat: any) => (
                <Link key={cat.id} to={`/products/${cat.slug}`} onClick={() => setMobileNavOpen(false)}
                  className={`block px-4 py-2.5 rounded-lg font-medium text-sm ${cat.slug === categorySlug ? 'bg-red-50 text-[#e31e24]' : 'text-[#1a2332] hover:bg-red-50'}`}>
                  {cat.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3">
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/" className="flex items-center gap-1 text-gray-400 hover:text-[#e31e24] transition-colors">
              <Home className="w-4 h-4" /> Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="text-gray-400">Products</span>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="font-semibold text-[#1a2332]">{catInfo?.name || 'Loading...'}</span>
          </nav>
        </div>
      </div>

      {/* Category Hero */}
      <div className="bg-gradient-to-r from-[#0f1923] to-[#1a2332] text-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-10 lg:py-14">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-xl bg-[#e31e24]/20 flex items-center justify-center">
              <CatIcon className="w-7 h-7 text-[#e31e24]" />
            </div>
            <div>
              <h1 className="text-3xl lg:text-4xl font-extrabold">{catInfo?.name || 'Loading...'}</h1>
              <p className="text-gray-400 mt-1">{catInfo?.description || ''}</p>
            </div>
          </div>
          {/* Quick category nav */}
          <div className="flex flex-wrap gap-2 mt-6">
            {visibleCategories.map((cat: any) => (
              <Link
                key={cat.id}
                to={`/products/${cat.slug}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  cat.slug === categorySlug
                    ? 'bg-[#e31e24] text-white'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-8">
        {/* Search + Sort Bar */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${catInfo?.name || 'products'}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 bg-white outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 text-[#1a2332]"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileFilterOpen(true)}
              className="lg:hidden flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-[#1a2332]"
            >
              <SlidersHorizontal className="w-4 h-4" /> Filters
            </button>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium text-[#1a2332] outline-none cursor-pointer"
            >
              <option value="popular">Most Popular</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
              <option value="name">Name: A–Z</option>
            </select>
            <div className="hidden sm:flex items-center bg-white rounded-xl border border-gray-200 p-1">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[#e31e24] text-white' : 'text-gray-400 hover:text-[#1a2332]'}`}>
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[#e31e24] text-white' : 'text-gray-400 hover:text-[#1a2332]'}`}>
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-8">
          {/* Sidebar */}
          <ProductFilterSidebar
            brands={brands}
            specFilters={[]}
            filters={filters}
            onFilterChange={setFilters}
            maxPrice={maxPrice}
            productCount={filteredProducts.length}
            mobileOpen={mobileFilterOpen}
            onMobileClose={() => setMobileFilterOpen(false)}
          />

          {/* Product Grid */}
          <div className="flex-1 min-w-0">
            {productsLoading ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <div className="w-10 h-10 border-3 border-gray-200 border-t-[#e31e24] rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Loading products...</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-[#1a2332] mb-2">No products found</h3>
                <p className="text-gray-500 mb-4">
                  {allProducts.length === 0
                    ? 'No products have been added to this category yet. Add products via the CMS.'
                    : 'Try adjusting your filters or search terms'}
                </p>
                {allProducts.length > 0 && (
                  <button
                    onClick={() => { setFilters({ priceRange: [0, 99999], brands: [], specs: {}, inStockOnly: false }); setSearchQuery(''); }}
                    className="text-[#e31e24] font-semibold hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className={`grid gap-5 ${viewMode === 'grid' ? 'sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
                {filteredProducts.map(product => {
                  const isInCompare = compareList.some(p => p.id === product.id);
                  const isFav = favorites.has(product.id);

                  return (
                    <div
                      key={product.id}
                      className={`bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl hover:border-[#e31e24]/20 transition-all duration-300 group ${
                        viewMode === 'list' ? 'flex' : ''
                      }`}
                    >
                      {/* Image Area - Clickable */}
                      <div
                        className={`relative bg-gradient-to-br from-gray-50 to-gray-100 ${viewMode === 'list' ? 'w-48 flex-shrink-0' : 'aspect-[4/3]'} flex items-center justify-center overflow-hidden cursor-pointer`}
                        onClick={() => setSelectedProduct(product)}
                      >
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-contain p-2" />
                        ) : (
                          <CatIcon className="w-16 h-16 text-gray-200 group-hover:text-[#e31e24]/20 transition-colors" />
                        )}

                        {product.badge && (
                          <div className="absolute top-3 left-3 flex flex-wrap gap-1">
                            {parseBadgeTags(product.badge).map(tag => (
                              <div key={tag} className={`${getTagColor(tag)} text-white text-xs font-bold px-2.5 py-1 rounded-lg`}>
                                {tag}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="absolute top-3 right-3 flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(product.id); }} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isFav ? 'bg-[#e31e24] text-white' : 'bg-white shadow-md text-gray-400 hover:text-[#e31e24]'}`}>
                            <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); toggleCompare(product); }} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isInCompare ? 'bg-[#e31e24] text-white' : 'bg-white shadow-md text-gray-400 hover:text-[#e31e24]'}`}>
                            <GitCompare className="w-4 h-4" />
                          </button>
                        </div>
                        {!product.inStock && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                            <span className="bg-gray-900 text-white text-xs font-bold px-3 py-1.5 rounded-lg">Out of Stock</span>
                          </div>
                        )}
                      </div>

                      <div className={`p-5 ${viewMode === 'list' ? 'flex-1 flex flex-col justify-between' : ''}`}>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-[#e31e24] uppercase tracking-wider">{product.brand}</span>
                            <span className="text-xs text-gray-400">{product.partNumber}</span>
                          </div>
                          <h3
                            className="font-bold text-[#1a2332] mb-2 group-hover:text-[#e31e24] transition-colors leading-snug text-sm cursor-pointer"
                            onClick={() => setSelectedProduct(product)}
                          >
                            {product.name}
                          </h3>
                          <div className="flex items-center gap-1.5 mb-2">
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star key={i} className={`w-3.5 h-3.5 ${i < Math.floor(product.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
                              ))}
                            </div>
                            <span className="text-xs text-gray-400">({product.reviews})</span>
                          </div>
                          {viewMode === 'list' && (
                            <p className="text-sm text-gray-500 mb-3 line-clamp-2">{product.description}</p>
                          )}
                          {product.specs && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              {Object.entries(product.specs).slice(0, viewMode === 'list' ? 4 : 2).map(([k, v]) => (
                                <span key={k} className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">{v}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="pt-2 border-t border-gray-100">
                          {cmsSettings.hidePrices ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSelectedProduct(product)}
                                className="h-8 px-2.5 bg-black text-white rounded-lg text-[11px] leading-none font-semibold whitespace-nowrap hover:bg-gray-800 transition-colors shadow-sm"
                              >
                                View Details
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQuoteContext({ categorySlug: product.categorySlug, productName: product.name });
                                  setShowQuoteModal(true);
                                }}
                                className="h-8 px-2.5 bg-[#e31e24] text-white rounded-lg text-[11px] leading-none font-semibold whitespace-nowrap hover:bg-[#c91a1f] transition-colors shadow-sm"
                              >
                                Request a Quote
                              </button>
                              <a
                                href={primaryPhone ? `tel:${primaryPhone.number.replace(/[^+\d]/g, '')}` : '#'}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-center bg-green-600 text-white w-8 h-8 rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                                title={primaryPhone ? `Call ${primaryPhone.number}` : 'Call us'}
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between">
                              <PriceOrQuote
                                product={product}
                                hidePrices={cmsSettings.hidePrices}
                                phones={contactDetails.phones}
                                onRequestQuote={() => { setQuoteContext({ categorySlug: product.categorySlug, productName: product.name }); setShowQuoteModal(true); }}
                                size="sm"
                              />
                              <button
                                onClick={() => setSelectedProduct(product)}
                                className="flex items-center gap-1.5 bg-[#e31e24] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#c91a1f] transition-colors shadow-sm"
                              >
                                View Details
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#0f1923] text-gray-400 mt-16">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <img src={LOGO_URL} alt="Voltz" className="h-10" />
            <p className="text-sm">&copy; {new Date().getFullYear()} Voltz Industrial Supply. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link to="/" className="text-sm hover:text-[#e31e24] transition-colors">Home</Link>
              {primaryPhone && (
                <a href={`tel:${primaryPhone.number.replace(/[^+\d]/g, '')}`} className="text-sm hover:text-[#e31e24] transition-colors">Contact</a>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onCompare={toggleCompare}
          compareList={compareList}
          hidePrices={cmsSettings.hidePrices}
          categorySlug={categorySlug}
          phones={contactDetails.phones}
          onRequestQuote={() => { setQuoteContext({ categorySlug: selectedProduct.categorySlug, productName: selectedProduct.name }); setShowQuoteModal(true); }}
        />
      )}

      {/* Quote Request Modal */}
      {showQuoteModal && (
        <QuoteRequest
          isModal
          onClose={() => { setShowQuoteModal(false); setQuoteContext({}); }}
          initialCategory={quoteContext.categorySlug}
          initialProductName={quoteContext.productName}
        />
      )}


      {/* Comparison Panel */}
      <ComparisonPanel
        products={compareList}
        onRemove={(id) => setCompareList(prev => prev.filter(p => p.id !== id))}
        onClear={() => setCompareList([])}
        hidePrices={cmsSettings.hidePrices}
      />
    </div>
  );
};

export default ProductCategory;
