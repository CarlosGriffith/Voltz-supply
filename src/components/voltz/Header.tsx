import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Phone, Mail, ChevronDown, ChevronLeft, ChevronRight, Menu, X,
  User, Globe, Package, Clock
} from 'lucide-react';
import { getIconComponent } from '@/lib/iconMap';
import { useLiveCategories, useLiveContactDetails } from '@/hooks/useLiveCMSData';

const LOGO_URL = 'https://d64gsuwffb70l.cloudfront.net/6995573664728a165adc7a9f_1772110039178_7206a7df.png';
const MEGA_MENU_PER_PAGE = 10;
const MOBILE_PER_PAGE = 10;

interface HeaderProps {
  onNavigate: (section: string) => void;
  onQuoteClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onNavigate, onQuoteClick }) => {
  const navigate = useNavigate();
  const { categories } = useLiveCategories();
  const { contactDetails } = useLiveContactDetails();

  const [scrolled, setScrolled] = useState(false);
  const [megaMenuOpen, setMegaMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);
  const [megaPage, setMegaPage] = useState(0);
  const [mobilePage, setMobilePage] = useState(0);
  const megaMenuRef = useRef<HTMLDivElement>(null);
  const megaMenuTimeout = useRef<NodeJS.Timeout | null>(null);

  // Mobile swipe refs
  const mobileTouchStartX = useRef(0);
  const mobileTouchEndX = useRef(0);
  const mobileIsDragging = useRef(false);

  // Only visible categories from CMS
  const visibleCategories = categories.filter(c => c.visible);
  const visibleCategoriesProductTotal = visibleCategories.reduce(
    (sum, c) => sum + (c.productCount || 0),
    0
  );

  // Mega menu pagination
  const megaTotalPages = Math.ceil(visibleCategories.length / MEGA_MENU_PER_PAGE);
  const megaPageCategories = visibleCategories.slice(
    megaPage * MEGA_MENU_PER_PAGE,
    (megaPage + 1) * MEGA_MENU_PER_PAGE
  );

  // Mobile pagination
  const mobileTotalPages = Math.ceil(visibleCategories.length / MOBILE_PER_PAGE);
  const mobilePageCategories = visibleCategories.slice(
    mobilePage * MOBILE_PER_PAGE,
    (mobilePage + 1) * MOBILE_PER_PAGE
  );

  // All phones & primary email/hours from CMS (live-synced)
  const phones = contactDetails.phones;
  const primaryPhone = phones[0];
  const primaryEmail = contactDetails.emails[0];
  const firstHours = contactDetails.businessHours[0];

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Reset mega page when menu opens
  useEffect(() => {
    if (megaMenuOpen) setMegaPage(0);
  }, [megaMenuOpen]);

  // Reset mobile page when accordion opens
  useEffect(() => {
    if (mobileProductsOpen) setMobilePage(0);
  }, [mobileProductsOpen]);

  const handleMegaEnter = () => {
    if (megaMenuTimeout.current) clearTimeout(megaMenuTimeout.current);
    setMegaMenuOpen(true);
  };

  const handleMegaLeave = () => {
    megaMenuTimeout.current = setTimeout(() => setMegaMenuOpen(false), 200);
  };

  const handleNavClick = (section: string) => {
    if (section === 'company-profile') {
      navigate('/company-profile');
      setMobileMenuOpen(false);
      setMegaMenuOpen(false);
      return;
    }
    onNavigate(section);
    setMobileMenuOpen(false);
    setMegaMenuOpen(false);
  };

  const handleCategoryClick = (slug: string) => {
    navigate(`/products/${slug}`);
    setMegaMenuOpen(false);
    setMobileMenuOpen(false);
  };

  const handleSearchSelect = (slug: string) => {
    navigate(`/products/${slug}`);
    setSearchOpen(false);
    setSearchQuery('');
  };

  // Mobile swipe handlers
  const handleMobileTouchStart = useCallback((e: React.TouchEvent) => {
    mobileTouchStartX.current = e.touches[0].clientX;
    mobileIsDragging.current = true;
  }, []);

  const handleMobileTouchMove = useCallback((e: React.TouchEvent) => {
    if (mobileIsDragging.current) {
      mobileTouchEndX.current = e.touches[0].clientX;
    }
  }, []);

  const handleMobileTouchEnd = useCallback(() => {
    if (!mobileIsDragging.current) return;
    mobileIsDragging.current = false;
    const diff = mobileTouchStartX.current - mobileTouchEndX.current;
    const threshold = 50;
    if (diff > threshold && mobilePage < mobileTotalPages - 1) {
      setMobilePage(p => p + 1);
    } else if (diff < -threshold && mobilePage > 0) {
      setMobilePage(p => p - 1);
    }
  }, [mobilePage, mobileTotalPages]);

  return (
    <>
      {/* Top Bar */}
      <div className="bg-[#0f1923] text-gray-300 text-sm hidden lg:block">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-10">
          <div className="flex items-center gap-4">
            {phones.map((phone, idx) => (
              <React.Fragment key={`topbar-phone-${idx}`}>
                {idx > 0 && <span className="text-gray-600">|</span>}
                <a
                  href={`tel:${phone.number.replace(/[^+\d]/g, '')}`}
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>
                    {phones.length > 1 && phone.label ? `${phone.label}: ` : ''}
                    {phone.number}
                  </span>
                </a>
              </React.Fragment>
            ))}
            {primaryEmail && (
              <>
                {phones.length > 0 && <span className="text-gray-600">|</span>}
                <a href={`mailto:${primaryEmail.address}`} className="flex items-center gap-1.5 hover:text-white transition-colors">
                  <Mail className="w-3.5 h-3.5" />
                  <span>{primaryEmail.address}</span>
                </a>
              </>
            )}
          </div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              Shipping Worldwide
            </span>
            {firstHours && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                {firstHours.day}: {firstHours.hours}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Header */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-white/95 backdrop-blur-md shadow-lg'
            : 'bg-white shadow-sm'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Left side: Logo + Primary Phone */}
            <div className="flex items-center gap-4 lg:gap-5">
              <button onClick={() => handleNavClick('hero')} className="flex-shrink-0">
                <img src={LOGO_URL} alt="Voltz Industrial Supply" className="h-10 lg:h-14 w-auto" />
              </button>
              {primaryPhone && (
                <a
                  href={`tel:${primaryPhone.number.replace(/[^+\d]/g, '')}`}
                  className="hidden md:flex items-center gap-2 text-[#1a2332] hover:text-[#e31e24] transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[#e31e24]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#e31e24] transition-colors">
                    <Phone className="w-4 h-4 text-[#e31e24] group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    {primaryPhone.label && (
                      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{primaryPhone.label}</span>
                    )}
                    <span className="text-sm font-bold">{primaryPhone.number}</span>
                  </div>
                </a>
              )}
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-0.5">
              <button
                onClick={() => handleNavClick('hero')}
                className="px-3 py-2 text-[#1a2332] font-medium text-sm hover:text-[#e31e24] transition-colors rounded-lg hover:bg-red-50"
              >
                Home
              </button>

              {/* Products Mega Menu Trigger */}
              <div
                className="relative"
                onMouseEnter={handleMegaEnter}
                onMouseLeave={handleMegaLeave}
                ref={megaMenuRef}
              >
                <button
                  className={`px-3 py-2 font-medium text-sm flex items-center gap-1 rounded-lg transition-colors ${
                    megaMenuOpen ? 'text-[#e31e24] bg-red-50' : 'text-[#1a2332] hover:text-[#e31e24] hover:bg-red-50'
                  }`}
                  onClick={() => handleNavClick('products')}
                >
                  Products
                  <ChevronDown className={`w-4 h-4 transition-transform ${megaMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Mega Menu with Pagination */}
                {megaMenuOpen && visibleCategories.length > 0 && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-[780px] bg-white rounded-xl shadow-2xl border border-gray-100 p-6 animate-fade-in">
                    {/* Pagination Header */}
                    {megaTotalPages > 1 && (
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                        <span className="text-xs text-gray-400 font-medium">
                          Page {megaPage + 1} of {megaTotalPages} ({visibleCategories.length}{' '}
                          categor{visibleCategories.length === 1 ? 'y' : 'ies'}, {visibleCategoriesProductTotal}{' '}
                          product{visibleCategoriesProductTotal === 1 ? '' : 's'})
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (megaPage > 0) setMegaPage(p => p - 1);
                            }}
                            disabled={megaPage === 0}
                            className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                              megaPage === 0
                                ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                : 'bg-[#e31e24] text-white hover:bg-[#c91a1f]'
                            }`}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          {/* Dot indicators */}
                          {Array.from({ length: megaTotalPages }).map((_, idx) => (
                            <button
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMegaPage(idx);
                              }}
                              className={`rounded-full transition-all ${
                                idx === megaPage
                                  ? 'w-5 h-2 bg-[#e31e24]'
                                  : 'w-2 h-2 bg-gray-300 hover:bg-gray-400'
                              }`}
                            />
                          ))}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (megaPage < megaTotalPages - 1) setMegaPage(p => p + 1);
                            }}
                            disabled={megaPage === megaTotalPages - 1}
                            className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                              megaPage === megaTotalPages - 1
                                ? 'bg-gray-50 text-gray-300 cursor-not-allowed'
                                : 'bg-[#e31e24] text-white hover:bg-[#c91a1f]'
                            }`}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {megaPageCategories.map((cat) => {
                        const IconComp = getIconComponent(cat.icon);
                        return (
                          <button
                            key={cat.id}
                            onClick={() => handleCategoryClick(cat.slug)}
                            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-red-50 transition-colors text-left group"
                          >
                            <div className="w-9 h-9 rounded-lg bg-[#e31e24]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[#e31e24] transition-colors">
                              <IconComp className="w-4 h-4 text-[#e31e24] group-hover:text-white transition-colors" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-[#1a2332] text-sm group-hover:text-[#e31e24] transition-colors">
                                {cat.name}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5 truncate">{cat.description}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => handleNavClick('products')}
                        className="text-[#e31e24] font-semibold text-sm hover:underline"
                      >
                        View All Products →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleNavClick('company-profile')}
                className="px-3 py-2 text-[#1a2332] font-medium text-sm hover:text-[#e31e24] transition-colors rounded-lg hover:bg-red-50"
              >
                Company Profile
              </button>
              <button
                onClick={() => handleNavClick('featured')}
                className="px-3 py-2 text-[#1a2332] font-medium text-sm hover:text-[#e31e24] transition-colors rounded-lg hover:bg-red-50"
              >
                Best Sales
              </button>
              <button
                onClick={() => handleNavClick('special-offers')}
                className="px-3 py-2 text-[#1a2332] font-medium text-sm hover:text-[#e31e24] transition-colors rounded-lg hover:bg-red-50"
              >
                Special Offers
              </button>
              <button
                onClick={() => handleNavClick('contact')}
                className="px-3 py-2 text-[#1a2332] font-medium text-sm hover:text-[#e31e24] transition-colors rounded-lg hover:bg-red-50"
              >
                Contact
              </button>
              <button
                onClick={() => handleNavClick('faq')}
                className="px-3 py-2 text-[#1a2332] font-medium text-sm hover:text-[#e31e24] transition-colors rounded-lg hover:bg-red-50"
              >
                FAQ
              </button>
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <button
                  onClick={() => setSearchOpen(!searchOpen)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#1a2332]"
                >
                  <Search className="w-5 h-5" />
                </button>
                {searchOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 animate-fade-in z-50">
                    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <Search className="w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent outline-none text-sm flex-1 text-[#1a2332]"
                        autoFocus
                      />
                    </div>
                    {searchQuery && (
                      <div className="mt-2 space-y-1 max-h-64 overflow-y-auto">
                        {visibleCategories
                          .filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase()))
                          .map(c => {
                            const IconComp = getIconComponent(c.icon);
                            return (
                              <button
                                key={c.id}
                                onClick={() => handleSearchSelect(c.slug)}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-sm flex items-center gap-2"
                              >
                                <IconComp className="w-4 h-4 text-[#e31e24]" />
                                <span className="font-medium text-[#1a2332]">{c.name}</span>
                              </button>
                            );
                          })}
                        {visibleCategories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.description.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                          <p className="text-sm text-gray-400 px-3 py-2">No results found</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button className="hidden lg:flex p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#1a2332]">
                <User className="w-5 h-5" />
              </button>

              <button
                onClick={onQuoteClick}
                className="hidden lg:flex items-center gap-2 bg-[#e31e24] text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#c91a1f] transition-colors shadow-md shadow-red-200"
              >
                Request Quote
              </button>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors text-[#1a2332]"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-gray-100 animate-slide-in max-h-[80vh] overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
              <button onClick={() => handleNavClick('hero')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 font-medium text-[#1a2332]">Home</button>
              
              {/* Products Accordion with Pagination */}
              <button
                onClick={() => setMobileProductsOpen(!mobileProductsOpen)}
                className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 font-medium text-[#1a2332] flex items-center justify-between"
              >
                <span>Products</span>
                <div className="flex items-center gap-2">
                  {visibleCategoriesProductTotal > 0 && (
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {visibleCategoriesProductTotal}
                    </span>
                  )}
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobileProductsOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>
              {mobileProductsOpen && (
                <div
                  className="pl-2 space-y-0.5"
                  onTouchStart={handleMobileTouchStart}
                  onTouchMove={handleMobileTouchMove}
                  onTouchEnd={handleMobileTouchEnd}
                >
                  {/* Mobile pagination controls */}
                  {mobileTotalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2 mb-1">
                      <span className="text-[11px] text-gray-400 font-medium">
                        {mobilePage * MOBILE_PER_PAGE + 1}–{Math.min((mobilePage + 1) * MOBILE_PER_PAGE, visibleCategories.length)} of {visibleCategories.length}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { if (mobilePage > 0) setMobilePage(p => p - 1); }}
                          disabled={mobilePage === 0}
                          className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                            mobilePage === 0
                              ? 'bg-gray-50 text-gray-300'
                              : 'bg-[#e31e24] text-white'
                          }`}
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        {Array.from({ length: mobileTotalPages }).map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => setMobilePage(idx)}
                            className={`rounded-full transition-all ${
                              idx === mobilePage
                                ? 'w-4 h-2 bg-[#e31e24]'
                                : 'w-2 h-2 bg-gray-300'
                            }`}
                          />
                        ))}
                        <button
                          onClick={() => { if (mobilePage < mobileTotalPages - 1) setMobilePage(p => p + 1); }}
                          disabled={mobilePage === mobileTotalPages - 1}
                          className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${
                            mobilePage === mobileTotalPages - 1
                              ? 'bg-gray-50 text-gray-300'
                              : 'bg-[#e31e24] text-white'
                          }`}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {mobilePageCategories.map(cat => {
                    const IconComp = getIconComponent(cat.icon);
                    return (
                      <button
                        key={cat.id}
                        onClick={() => handleCategoryClick(cat.slug)}
                        className="w-full text-left px-4 py-2.5 rounded-lg hover:bg-red-50 text-[#1a2332] flex items-center gap-3 text-sm"
                      >
                        <IconComp className="w-4 h-4 text-[#e31e24]" />
                        {cat.name}
                      </button>
                    );
                  })}

                  {/* Swipe hint for mobile */}
                  {mobileTotalPages > 1 && (
                    <p className="text-center text-[10px] text-gray-300 pt-2 pb-1">
                      Swipe left/right for more categories
                    </p>
                  )}
                </div>
              )}

              <button onClick={() => handleNavClick('company-profile')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 font-medium text-[#1a2332]">Company Profile</button>
              <button onClick={() => handleNavClick('featured')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 font-medium text-[#1a2332]">Best Sales</button>
              <button onClick={() => handleNavClick('special-offers')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 font-medium text-[#1a2332]">Special Offers</button>
              <button onClick={() => handleNavClick('contact')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 font-medium text-[#1a2332]">Contact</button>
              <button onClick={() => handleNavClick('faq')} className="w-full text-left px-4 py-3 rounded-lg hover:bg-red-50 font-medium text-[#1a2332]">FAQ</button>

              {/* Mobile Contact Numbers */}
              {phones.length > 0 && (
                <div className="pt-3 border-t border-gray-100 mt-2 space-y-1.5">
                  <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Call Us</p>
                  {phones.map((phone, idx) => (
                    <a
                      key={`mobile-phone-${idx}`}
                      href={`tel:${phone.number.replace(/[^+\d]/g, '')}`}
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-red-50 text-[#1a2332] text-sm"
                    >
                      <Phone className="w-4 h-4 text-[#e31e24]" />
                      <span>
                        {phones.length > 1 && phone.label ? <span className="text-gray-400 text-xs font-medium mr-1">{phone.label}:</span> : null}
                        <span className="font-medium">{phone.number}</span>
                      </span>
                    </a>
                  ))}
                </div>
              )}

              <div className="pt-3">
                <button
                  onClick={onQuoteClick}
                  className="w-full bg-[#e31e24] text-white px-5 py-3 rounded-lg font-semibold text-sm hover:bg-[#c91a1f] transition-colors"
                >
                  Request Quote
                </button>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
};

export default Header;
