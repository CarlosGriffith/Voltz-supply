import React, { useState, useMemo, useEffect } from 'react';

import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, ShoppingCart, Heart, Star, Package,
  X, CheckCircle, AlertCircle, FileText, Download, Info, GitCompare, Shield, Clock, Phone, ZoomIn
} from 'lucide-react';
import { Product } from '@/data/products';
import { useLiveFeaturedProducts, useLiveCMSSettings, useLiveContactDetails } from '@/hooks/useLiveCMSData';
import QuoteRequest from '@/components/voltz/QuoteRequest';
import ImageSlideshow from '@/components/voltz/ImageSlideshow';


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
          <span className="text-3xl font-extrabold text-[#1a2332]">${product.price?.toLocaleString()}</span>
          {product.originalPrice > product.price && (
            <>
              <span className="text-lg text-gray-400 line-through">${product.originalPrice?.toLocaleString()}</span>
              <span className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                Save ${(product.originalPrice - product.price).toLocaleString()}
              </span>
            </>
          )}
        </>
      ) : (
        <>
          <span className="text-xl font-extrabold text-[#1a2332]">${product.price}</span>
          {product.originalPrice > product.price && (
            <span className="text-sm text-gray-400 line-through ml-2">${product.originalPrice}</span>
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
  hidePrices?: boolean;
  phones: { label: string; number: string }[];
  onRequestQuote: () => void;
  emailAddress?: string;
}> = ({ product, onClose, hidePrices, phones, onRequestQuote, emailAddress }) => {

  const [activeTab, setActiveTab] = useState<'specs' | 'features' | 'docs'>('features');
  const [selectedImage, setSelectedImage] = useState<string>(product.image || '');
  const [slideshowOpen, setSlideshowOpen] = useState(false);


  const tags = parseBadgeTags(product.badge);

  // Combine main image + additional images for gallery
  const allImages = useMemo(() => {
    const imgs: string[] = [];
    if (product.image) imgs.push(product.image);
    if (product.additionalImages && product.additionalImages.length > 0) {
      imgs.push(...product.additionalImages.filter(Boolean));
    }
    return imgs;
  }, [product.image, product.additionalImages]);

  // Close on Escape key (but not if slideshow is open - slideshow handles its own Escape)
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !slideshowOpen) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, slideshowOpen]);


  // Prevent body scroll when modal is open
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-6 pb-6 px-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header - NOT sticky, scrolls with content */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-xs font-semibold text-[#e31e24] uppercase tracking-wider">{product.category}</p>
              {tags.map(tag => (
                <span key={tag} className={`${getTagColor(tag)} text-white text-[10px] font-bold px-2 py-0.5 rounded-md`}>
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="text-xl font-bold text-[#1a2332]">{product.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0 ml-4"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 lg:p-8">
          <div className="grid lg:grid-cols-5 gap-8">
            {/* Left - Image + Quick Info */}
            <div className="lg:col-span-2 space-y-4">
              {/* Main Product Image - Clickable to open slideshow */}
              <button
                type="button"
                onClick={() => { if (allImages.length > 0) setSlideshowOpen(true); }}
                className="relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl aspect-square w-full flex items-center justify-center border border-gray-100 overflow-hidden cursor-zoom-in group/img"
              >
                {selectedImage ? (
                  <>
                    <img
                      src={selectedImage}
                      alt={product.name}
                      className="w-full h-full object-contain p-4 transition-transform group-hover/img:scale-105"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
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
                {/* Tags on image */}
                {tags.length > 0 && (
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1 pointer-events-none">
                    {tags.map(tag => (
                      <span key={tag} className={`${getTagColor(tag)} text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </button>


              {/* Additional Image Thumbnails */}
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

              {/* Quick Info Cards - 2 rows, 3 columns */}
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

              {/* Price or Quote Buttons */}
              <PriceOrQuote
                product={product}
                hidePrices={!!hidePrices}
                phones={phones}
                onRequestQuote={onRequestQuote}
                size="lg"
              />
              {/* Stock Status - Three-state display */}
              <div className="space-y-2">
                {product.stockCount != null && product.stockCount === 0 ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    Out of Stock — Contact for ETA
                  </div>
                ) : product.stockCount != null && product.stockCount <= 5 ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                    <AlertCircle className="w-4 h-4" />
                    Only {product.stockCount} left — order soon!
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


              {/* Trust Badges */}
              <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Shield className="w-3.5 h-3.5 text-green-500" />
                  <span>Genuine Product</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>Fast Shipping</span>
                </div>
              </div>
            </div>

            {/* Right - Details */}
            <div className="lg:col-span-3">
              {/* Description */}
              <p className="text-gray-600 leading-relaxed mb-6">{product.description}</p>

              {/* Rating */}
              <div className="flex items-center gap-3 mb-6 p-3 bg-amber-50 rounded-xl">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${
                        i < Math.floor(product.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                      }`}
                    />
                  ))}
                </div>
                <span className="font-bold text-[#1a2332]">{product.rating}</span>
                <span className="text-sm text-gray-500">({product.reviews} reviews)</span>
              </div>

              {/* Tabs */}
              <div className="border-b border-gray-200 mb-4">
                <div className="flex gap-1">
                  {[
                    { key: 'features' as const, label: 'Key Features', icon: CheckCircle },
                    { key: 'specs' as const, label: 'Technical Specs', icon: Info },
                    { key: 'docs' as const, label: 'Documents', icon: FileText },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === tab.key
                          ? 'border-[#e31e24] text-[#e31e24]'
                          : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <tab.icon className="w-4 h-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Specs Tab */}
              {activeTab === 'specs' && (
                <div className="space-y-2">
                  {product.specs && Object.keys(product.specs).length > 0 ? (
                    <>
                      {Object.entries(product.specs).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                          <span className="text-sm text-gray-500">{key}</span>
                          <span className="text-sm font-semibold text-[#1a2332]">{value}</span>
                        </div>
                      ))}
                      {product.dimensions && product.dimensions !== 'N/A' && (
                        <div className="flex items-center justify-between py-2.5 border-b border-gray-50">
                          <span className="text-sm text-gray-500">Dimensions</span>
                          <span className="text-sm font-semibold text-[#1a2332]">{product.dimensions}</span>
                        </div>
                      )}
                      {product.weight && (
                        <div className="flex items-center justify-between py-2.5">
                          <span className="text-sm text-gray-500">Weight</span>
                          <span className="text-sm font-semibold text-[#1a2332]">{product.weight}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No technical specifications available for this product.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Features Tab */}
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
                    <div className="text-center py-8 text-gray-400">
                      <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No features listed for this product.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Documents Tab */}
              {activeTab === 'docs' && (
                <div className="space-y-3">
                  {product.documents && product.documents.length > 0 ? (
                    product.documents.map((doc, i) => (
                      <a
                        key={i}
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-[#e31e24]/30 hover:bg-red-50/30 transition-all text-left group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-[#e31e24]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#1a2332] truncate">{doc.name || 'Document'}</p>
                          <p className="text-xs text-gray-400">
                            {[doc.type, doc.size].filter(Boolean).join(' — ') || 'Download'}
                          </p>
                        </div>
                        <Download className="w-4 h-4 text-gray-400 group-hover:text-[#e31e24] transition-colors" />
                      </a>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No documents available for this product.</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>

        {/* Footer with CTA */}
        <div className="bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < Math.floor(product.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-gray-500">{product.reviews} reviews</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <a
              href={emailAddress ? `mailto:${emailAddress}?subject=Quote Request: ${encodeURIComponent(product.name)}&body=I would like to request a quote for: ${encodeURIComponent(product.name)} (${product.partNumber || 'N/A'})` : '#'}
              className="flex items-center gap-2 bg-[#e31e24] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#c91a1f] transition-colors shadow-md shadow-red-200"
            >
              Request Quote
            </a>
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


const FeaturedProducts: React.FC = () => {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [cartItems, setCartItems] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [hoveredProduct, setHoveredProduct] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteContext, setQuoteContext] = useState<{ categorySlug?: string; productName?: string }>({});

  // Fetch featured products from Supabase (live, polls for updates)
  const { products, loading } = useLiveFeaturedProducts();
  const { settings: cmsSettings } = useLiveCMSSettings();
  const { contactDetails } = useLiveContactDetails();

  // Keep selectedProduct in sync with latest live data (e.g. stock count changes from CMS)
  useEffect(() => {
    if (selectedProduct) {
      const updated = products.find(p => p.id === selectedProduct.id);
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
  }, [products]);


  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addToCart = (id: string) => {
    setCartItems(prev => new Set(prev).add(id));
  };

  // Get specs to display (first 3 spec values)
  const getDisplaySpecs = (product: Product): string[] => {
    if (product.specs) {
      return Object.values(product.specs).slice(0, 3);
    }
    return [];
  };

  // Show loading state
  if (loading) {
    return (
      <section id="featured" className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e31e24] text-sm font-semibold">Best Sales</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-4">
            Top Picks for Your Business
          </h2>
          <div className="w-10 h-10 border-3 border-gray-200 border-t-[#e31e24] rounded-full animate-spin mx-auto mt-8" />
        </div>
      </section>
    );
  }

  // If no featured products, show placeholder
  if (products.length === 0) {
    return (
      <section id="featured" className="py-20 lg:py-28 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e31e24] text-sm font-semibold">Best Sales</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-4">
            Top Picks for Your Business
          </h2>
          <Package className="w-16 h-16 text-gray-200 mx-auto mb-4 mt-8" />
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Featured products will appear here once added via the CMS. Mark products as "Best Sales" in the CMS to feature them.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="featured" className="py-20 lg:py-28 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between mb-12 gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
              <span className="text-[#e31e24] text-sm font-semibold">Best Sales</span>
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-2">
              Top Picks for Your Business
            </h2>
            <p className="text-gray-500 text-lg max-w-xl">
              Hand-selected products with the best performance, value, and reliability ratings.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-lg p-1 border border-gray-200">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === 'grid' ? 'bg-[#e31e24] text-white' : 'text-gray-500 hover:text-[#1a2332]'
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === 'list' ? 'bg-[#e31e24] text-white' : 'text-gray-500 hover:text-[#1a2332]'
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Products Grid */}
        <div className={`grid gap-6 ${viewMode === 'grid' ? 'sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1'}`}>
          {products.map((product) => {
            const tags = parseBadgeTags(product.badge);
            const displaySpecs = getDisplaySpecs(product);
            const categorySlug = product.categorySlug || 'inverters';

            return (
              <div
                key={product.id}
                className={`bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl hover:border-[#e31e24]/20 transition-all duration-300 group ${
                  viewMode === 'list' ? 'flex' : ''
                }`}
                onMouseEnter={() => setHoveredProduct(product.id)}
                onMouseLeave={() => setHoveredProduct(null)}
              >
                {/* Image Area - Clickable */}
                <div
                  className={`relative bg-gradient-to-br from-gray-50 to-gray-100 ${viewMode === 'list' ? 'w-48 flex-shrink-0' : 'aspect-square'} flex items-center justify-center overflow-hidden cursor-pointer`}
                  onClick={() => setSelectedProduct(product)}
                >
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        const parent = (e.target as HTMLImageElement).parentElement;
                        if (parent) {
                          const fallback = document.createElement('div');
                          fallback.className = 'flex items-center justify-center w-full h-full';
                          fallback.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;
                          parent.appendChild(fallback);
                        }
                      }}
                    />
                  ) : (
                    <Package className="w-16 h-16 text-gray-300 group-hover:text-[#e31e24]/30 transition-colors" />
                  )}

                  {/* Product Tags from CMS displayed on image */}
                  {tags.length > 0 && (
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1 z-10">
                      {tags.map((tag) => (
                        <div key={tag} className={`${getTagColor(tag)} text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-sm`}>
                          {tag}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className={`absolute top-3 right-3 flex flex-col gap-2 transition-all z-10 ${
                    hoveredProduct === product.id ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'
                  }`}>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(product.id); }}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                        favorites.has(product.id)
                          ? 'bg-[#e31e24] text-white'
                          : 'bg-white shadow-md text-gray-400 hover:text-[#e31e24]'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${favorites.has(product.id) ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  {!product.inStock && (
                    <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20">
                      <span className="bg-gray-900 text-white text-sm font-bold px-4 py-2 rounded-lg">Out of Stock</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className={`p-5 ${viewMode === 'list' ? 'flex-1 flex flex-col justify-between' : ''}`}>
                  <div>
                    <div className="text-xs font-semibold text-[#e31e24] uppercase tracking-wider mb-1">{product.category}</div>
                    <h3
                      className="font-bold text-[#1a2332] mb-2 group-hover:text-[#e31e24] transition-colors leading-snug cursor-pointer"
                      onClick={() => setSelectedProduct(product)}
                    >
                      {product.name}
                    </h3>

                    <div className="flex items-center gap-1.5 mb-3">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < Math.floor(product.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs text-gray-400">({product.reviews})</span>
                    </div>

                    {displaySpecs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {displaySpecs.map((spec, idx) => (
                          <span key={idx} className="text-[11px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md">
                            {spec}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <PriceOrQuote
                      product={product}
                      hidePrices={cmsSettings.hidePrices}
                      phones={contactDetails.phones}
                      onRequestQuote={() => { setQuoteContext({ categorySlug: product.categorySlug, productName: product.name }); setShowQuoteModal(true); }}
                      size="sm"
                    />

                    {!cmsSettings.hidePrices && (
                      <button
                        onClick={() => addToCart(product.id)}
                        disabled={!product.inStock}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                          cartItems.has(product.id)
                            ? 'bg-green-100 text-green-700'
                            : product.inStock
                            ? 'bg-[#e31e24] text-white hover:bg-[#c91a1f] shadow-md shadow-red-200'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {cartItems.has(product.id) ? 'Added' : 'Add'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* View All */}
        <div className="text-center mt-12">
          <button
            onClick={() => navigate('/products/inverters')}
            className="inline-flex items-center gap-2 bg-white border-2 border-gray-200 text-[#1a2332] px-8 py-4 rounded-xl font-bold text-lg hover:border-[#e31e24] hover:text-[#e31e24] transition-all group"
          >
            View All Products
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          hidePrices={cmsSettings.hidePrices}
          phones={contactDetails.phones}
          onRequestQuote={() => {
            setQuoteContext({ categorySlug: selectedProduct.categorySlug, productName: selectedProduct.name });
            setSelectedProduct(null);
            setShowQuoteModal(true);
          }}
          emailAddress={contactDetails.emails[0]?.address}
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

    </section>
  );
};

export default FeaturedProducts;
