import React, { useState, useCallback, useMemo } from 'react';

import Header from './voltz/Header';
import HeroSection from './voltz/HeroSection';
import ProductCategories from './voltz/ProductCategories';
import FeaturedProducts from './voltz/FeaturedProducts';
import FeaturesSection from './voltz/FeaturesSection';
import IndustrySolutions from './voltz/IndustrySolutions';
import Partners from './voltz/Partners';
import TechResources from './voltz/TechResources';
import Testimonials from './voltz/Testimonials';
import CTABanner from './voltz/CTABanner';
import QuoteRequest from './voltz/QuoteRequest';
import Footer from './voltz/Footer';
import ScrollToTop from './voltz/ScrollToTop';
import ImageSlideshow from './voltz/ImageSlideshow';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import { useLiveSections, useLiveCMSSettings, useLiveContactDetails, useLiveSpecialOfferProducts } from '@/hooks/useLiveCMSData';
import { ChevronDown, ChevronUp, HelpCircle, Phone, Flame, Tag, X, Package, Star, CheckCircle, AlertCircle, Shield, Clock, Info, FileText, Download, ZoomIn } from 'lucide-react';
import { Product } from '@/data/products';

const faqItems = [
  { q: 'What brands do you carry?', a: 'We carry products from all major industrial brands including Siemens, ABB, Schneider Electric, Allen-Bradley, Omron, Mitsubishi, Danfoss, Yaskawa, Eaton, WEG, SMC, Festo, Parker, Grundfos, KSB, and many more.' },
  { q: 'Do you offer bulk pricing?', a: 'Yes! We offer competitive volume discounts on all product categories. Contact our sales team or submit a quote request for bulk pricing tailored to your needs.' },
  { q: 'What is your return policy?', a: 'We offer a 30-day return policy on all unused products in original packaging. Defective items are covered under the manufacturer warranty for exchange or repair.' },
  { q: 'Do you ship internationally?', a: 'Yes, we ship to over 40 countries worldwide. International orders are processed within 24-48 hours with tracking provided. Contact us for shipping rates to your location.' },
  { q: 'Can you help with product selection?', a: 'Absolutely! Our team of certified engineers provides free technical consultation to help you select the right products for your application. Call us or submit a quote request.' },
  { q: 'What payment methods do you accept?', a: 'We accept all major credit cards, wire transfers, purchase orders (for approved accounts), and PayPal. Net-30 terms are available for qualified businesses.' },
  { q: 'Do you offer installation support?', a: 'Yes, we provide installation guides, wiring diagrams, and technical datasheets for all products. Our 24/7 support team can also assist remotely during installation.' },
  { q: 'How fast is shipping?', a: 'Orders placed before 2 PM EST ship the same day. Standard delivery is 2-5 business days within the US. Expedited and next-day options are available.' },
];

const FAQSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section id="faq" className="py-20 lg:py-28 bg-white">
      <div className="max-w-4xl mx-auto px-4 lg:px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
            <HelpCircle className="w-4 h-4 text-[#e31e24]" />
            <span className="text-[#e31e24] text-sm font-semibold">FAQ</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-4">Frequently Asked Questions</h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">Find answers to the most common questions about our products, services, and ordering process.</p>
        </div>
        <div className="space-y-3">
          {faqItems.map((item, idx) => (
            <div key={idx} className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden hover:border-[#e31e24]/20 transition-colors">
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full flex items-center justify-between px-6 py-5 text-left"
              >
                <span className="font-semibold text-[#1a2332] pr-4">{item.q}</span>
                {openIndex === idx ? <ChevronUp className="w-5 h-5 text-[#e31e24] flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
              </button>
              {openIndex === idx && (
                <div className="px-6 pb-5 text-gray-500 leading-relaxed border-t border-gray-200 pt-4">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ─── Product Detail Modal for Special Offers ─── */
function parseBadgeTags(badge?: string): string[] {
  if (!badge) return [];
  return badge.split(',').map(t => t.trim()).filter(Boolean);
}

function getTagColor(tag: string): string {
  const map: Record<string, string> = {
    'Best Seller': 'bg-red-600', 'New': 'bg-blue-600', 'Popular': 'bg-green-600',
    'Best Value': 'bg-purple-600', 'Premium': 'bg-amber-600', 'Top Rated': 'bg-cyan-600',
  };
  return map[tag] || 'bg-gray-500';
}

const SpecialOfferDetailModal: React.FC<{
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

  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-6 pb-6 px-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-4xl shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header - NOT sticky */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-xs font-semibold text-[#e31e24] uppercase tracking-wider">{product.category}</p>
              {tags.map(tag => (
                <span key={tag} className={`${getTagColor(tag)} text-white text-[10px] font-bold px-2 py-0.5 rounded-md`}>{tag}</span>
              ))}
            </div>
            <h2 className="text-xl font-bold text-[#1a2332]">{product.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0 ml-4">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 lg:p-8">
          <div className="grid lg:grid-cols-5 gap-8">
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
                      src={resolveMediaUrl(selectedImage)}
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
                    <button key={idx} onClick={() => setSelectedImage(img)}
                      className={`w-16 h-16 flex-shrink-0 rounded-lg border-2 overflow-hidden bg-white transition-all ${selectedImage === img ? 'border-[#e31e24] shadow-md' : 'border-gray-200 hover:border-gray-300'}`}>
                      <img src={resolveMediaUrl(img)} alt={`View ${idx + 1}`} className="w-full h-full object-contain p-1" />
                    </button>
                  ))}
                </div>
              )}

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

              {!hidePrices && (
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-extrabold text-[#1a2332]">${product.price?.toLocaleString()}</span>
                  {product.originalPrice > product.price && (
                    <>
                      <span className="text-lg text-gray-400 line-through">${product.originalPrice?.toLocaleString()}</span>
                      <span className="text-sm font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md">
                        Save ${(product.originalPrice - product.price).toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
              )}

              <div className={`flex items-center gap-2 text-sm font-semibold ${product.inStock ? 'text-green-600' : 'text-red-500'}`}>
                {product.inStock ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {product.inStock ? 'In Stock — Ships Today' : 'Out of Stock — Contact for ETA'}
              </div>

              <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-xs text-gray-500"><Shield className="w-3.5 h-3.5 text-green-500" /><span>Genuine Product</span></div>
                <div className="flex items-center gap-1.5 text-xs text-gray-500"><Clock className="w-3.5 h-3.5 text-blue-500" /><span>Fast Shipping</span></div>
              </div>
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
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab.key ? 'border-[#e31e24] text-[#e31e24]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
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
                          <CheckCircle className="w-4 h-4 text-[#e31e24] flex-shrink-0 mt-0.5" /><span className="text-sm text-gray-600">{f}</span>
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
                    Object.entries(product.specs).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-500">{key}</span><span className="text-sm font-semibold text-[#1a2332]">{value}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-400"><Info className="w-8 h-8 mx-auto mb-2 opacity-50" /><p className="text-sm">No specs available.</p></div>
                  )}
                </div>
              )}

              {activeTab === 'docs' && (
                <div className="space-y-3">
                  {product.documents && product.documents.length > 0 ? (
                    product.documents.map((doc, i) => (
                      <a key={i} href={resolveMediaUrl(doc.url)} target="_blank" rel="noopener noreferrer"
                        className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-[#e31e24]/30 hover:bg-red-50/30 transition-all text-left group">
                        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0"><FileText className="w-5 h-5 text-[#e31e24]" /></div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-[#1a2332] truncate">{doc.name || 'Document'}</p><p className="text-xs text-gray-400">{[doc.type, doc.size].filter(Boolean).join(' — ') || 'Download'}</p></div>
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

        <div className="bg-white border-t border-gray-100 px-6 py-4 rounded-b-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className={`w-4 h-4 ${i < Math.floor(product.rating) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />
              ))}
            </div>
            <span className="text-sm text-gray-500">{product.reviews} reviews</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors">Close</button>
            <button
              onClick={onRequestQuote}
              className="flex items-center gap-2 bg-[#e31e24] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#c91a1f] transition-colors shadow-md shadow-red-200"
            >
              Request Quote
            </button>
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

/* ─── Special Offers Section ─── */
const SpecialOffersSection: React.FC<{
  hidePrices: boolean;
  phones: { label: string; number: string }[];
  emailAddress?: string;
}> = ({ hidePrices, phones, emailAddress }) => {
  const primaryPhone = phones[0];
  const telHref = primaryPhone ? `tel:${primaryPhone.number.replace(/[^+\d]/g, '')}` : '#';
  const { products: cmsOffers, loading } = useLiveSpecialOfferProducts();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [quoteContext, setQuoteContext] = useState<{ categorySlug?: string; productName?: string }>({});

  // Open quote modal with product context
  const openQuoteForProduct = useCallback((product: Product) => {
    setQuoteContext({ categorySlug: product.categorySlug, productName: product.name });
    setSelectedProduct(null);
    setShowQuoteModal(true);
  }, []);




  return (
    <section id="special-offers" className="py-20 lg:py-28 bg-gradient-to-br from-[#0f1923] to-[#1a2332] text-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#e31e24]/20 rounded-full px-4 py-1.5 mb-4">
            <Flame className="w-4 h-4 text-[#e31e24]" />
            <span className="text-[#e31e24] text-sm font-semibold">Special Offers</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">Limited-Time Deals</h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">Save big on top-rated industrial components. These exclusive offers won't last long.</p>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 animate-pulse">
                <div className="w-full h-40 rounded-xl bg-white/10 mb-4" />
                <div className="flex items-center justify-between mb-3">
                  <div className="h-3 w-20 rounded bg-white/10" />
                  <div className="h-6 w-12 rounded-lg bg-white/10" />
                </div>
                <div className="h-5 w-3/4 rounded bg-white/10 mb-2" />
                <div className="h-4 w-1/3 rounded bg-white/10 mb-4" />
                <div className="flex items-center gap-3">
                  <div className="h-7 w-24 rounded bg-white/10" />
                  <div className="h-5 w-16 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : cmsOffers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-5">
              <Tag className="w-7 h-7 text-gray-500" />
            </div>
            <p className="text-gray-400 text-lg font-medium mb-1">No special offers right now</p>
            <p className="text-gray-500 text-sm max-w-md text-center">Check back soon — we regularly add limited-time deals on top industrial components.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cmsOffers.map((product) => {
              const discount = product.originalPrice > product.price ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100) : 0;
              return (
                <div
                  key={product.id}
                  className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6 hover:border-[#e31e24]/40 transition-all hover:-translate-y-1 group cursor-pointer"
                  onClick={() => setSelectedProduct(product)}
                >
                  {product.image && (
                    <div className="w-full h-40 rounded-xl overflow-hidden mb-4 bg-white/10">
                      <img src={resolveMediaUrl(product.image)} alt={product.name} className="w-full h-full object-contain" />
                    </div>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-[#e31e24] uppercase tracking-wider">{product.category}</span>
                    {!hidePrices && discount > 0 && (
                      <span className="bg-[#e31e24] text-white text-xs font-bold px-2.5 py-1 rounded-lg">-{discount}%</span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1 group-hover:text-[#e31e24] transition-colors">{product.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{product.brand}</p>

                  {hidePrices ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openQuoteForProduct(product); }}
                        className="flex items-center gap-1.5 bg-[#e31e24] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#c91a1f] transition-colors shadow-sm"
                      >
                        Request a Quote
                      </button>
                      <a
                        href={telHref}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center bg-green-600 text-white w-9 h-9 rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                        title={primaryPhone ? `Call ${primaryPhone.number}` : 'Call us'}
                      >
                        <Phone className="w-4 h-4" />
                      </a>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <span className="text-2xl font-extrabold text-white">${product.price.toLocaleString()}</span>
                        {product.originalPrice > product.price && (
                          <span className="text-gray-500 line-through text-lg">${product.originalPrice.toLocaleString()}</span>
                        )}
                      </div>
                      {product.originalPrice > product.price && (
                        <div className="mt-4 text-xs text-gray-500">You save ${(product.originalPrice - product.price).toLocaleString()}</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <SpecialOfferDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          hidePrices={hidePrices}
          phones={phones}
          onRequestQuote={() => openQuoteForProduct(selectedProduct)}
          emailAddress={emailAddress}
        />
      )}

      {/* Quote Request Modal with pre-populated product context */}
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


const AppLayout: React.FC = () => {
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);

  // Use live hooks that fetch from DB (source of truth for ALL visitors on ALL devices)
  const { getSortedVisibleSections } = useLiveSections();
  const { settings: cmsSettings } = useLiveCMSSettings();
  const { contactDetails } = useLiveContactDetails();

  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const headerOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  }, []);

  const openQuoteModal = useCallback(() => { setQuoteModalOpen(true); }, []);
  const closeQuoteModal = useCallback(() => { setQuoteModalOpen(false); }, []);

  // Map section IDs to their React components
  const sectionComponentMap: Record<string, React.ReactNode> = useMemo(() => ({
    'hero': <HeroSection onBrowseProducts={() => scrollToSection('products')} onRequestQuote={openQuoteModal} />,
    'product-categories': <ProductCategories />,
    'featured-products': <FeaturedProducts />,
    'special-offers': (
      <SpecialOffersSection
        hidePrices={cmsSettings.hidePrices}
        phones={contactDetails.phones}
        emailAddress={contactDetails.emails[0]?.address}
      />
    ),
    'features': <FeaturesSection onRequestQuote={openQuoteModal} />,
    'industry-solutions': <IndustrySolutions />,
    'partners': <Partners />,
    'tech-resources': <TechResources />,
    'testimonials': <Testimonials />,
    'faq': <FAQSection />,
    'cta-banner': <CTABanner onRequestQuote={openQuoteModal} />,
    'quote-request': <QuoteRequest />,
  }), [scrollToSection, openQuoteModal, cmsSettings.hidePrices, contactDetails.phones, contactDetails.emails]);

  const visibleSections = getSortedVisibleSections();

  return (
    <div className="min-h-screen bg-white font-sans">
      <Header onNavigate={scrollToSection} onQuoteClick={openQuoteModal} />
      <main>
        {visibleSections.map((section) => {
          const component = sectionComponentMap[section.id];
          if (!component) return null;

          return (
            <div
              key={section.id}
              className="relative"
              style={{
                marginTop: section.marginTop !== 0 ? `${section.marginTop}px` : undefined,
              }}
            >
              {component}
            </div>
          );
        })}
      </main>
      <Footer onNavigate={scrollToSection} />
      <ScrollToTop />

      {quoteModalOpen && <QuoteRequest isModal onClose={closeQuoteModal} />}
    </div>
  );
};

export default AppLayout;
