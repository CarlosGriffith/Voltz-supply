import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send, CheckCircle, Phone, Mail, MapPin, Clock, X, ArrowRight, Search, ChevronDown, Package, Plus, Trash2,
} from 'lucide-react';

import { useLiveContactDetails, useLiveCategories } from '@/hooks/useLiveCMSData';
import { fetchCustomProducts, fetchProductOverrides } from '@/lib/cmsData';
import { Product } from '@/data/products';
import { saveQuoteRequest } from '@/lib/posData';
import { digitsFromPhoneInput, formatPhoneUsMask } from '@/lib/utils';
import { resolveMediaUrl } from '@/lib/mediaUrl';

interface QuoteRequestProps {
  isModal?: boolean;
  onClose?: () => void;
  initialCategory?: string;      // category slug for first line hint when opening from a category page
  initialProductName?: string;    // product name to pre-fill
}

// ─── Lightweight product info for autocomplete ───
interface ProductOption {
  name: string;
  categorySlug: string;
  categoryName: string;
  partNumber: string;
  otherNames: string;
  brand: string;
  /** Resolved image URL (catalog + overrides). */
  image?: string;
}

type ProductLine = {
  key: string;
  productName: string;
  quantity: string;
  /** Narrow catalog search to this category (optional). */
  searchCategorySlug?: string;
  /** Filled when user picks a catalog product — informational + used for saved category field. */
  categorySlug?: string;
  categoryLabel?: string;
};

function newLineRow(): ProductLine {
  const key =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return { key, productName: '', quantity: '1' };
}

// ─── Product Autocomplete Sub-Component ───
interface ProductAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectProduct: (product: ProductOption) => void;
  products: ProductOption[];
  productsLoading: boolean;
  placeholder?: string;
  /** When the filtered catalog has no rows (e.g. category filter). */
  catalogEmptyHint?: string;
  className?: string;
  disabled?: boolean;
}

const ProductAutocomplete: React.FC<ProductAutocompleteProps> = ({
  value,
  onChange,
  onSelectProduct,
  products,
  productsLoading,
  placeholder = 'Search or type a product name...',
  catalogEmptyHint,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter products based on input value
  const filteredProducts = React.useMemo(() => {
    if (!value.trim()) return products.slice(0, 50); // Show first 50 when empty and dropdown is open
    const query = value.toLowerCase().trim();
    const tokens = query.split(/\s+/);

    return products.filter(p => {
      const searchText = `${p.name} ${p.otherNames} ${p.partNumber} ${p.brand} ${p.categoryName}`.toLowerCase();
      return tokens.every(token => searchText.includes(token));
    }).slice(0, 50); // Limit to 50 results
  }, [value, products]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when filtered results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredProducts.length]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-product-item]');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleSelectProduct = (product: ProductOption) => {
    onChange(product.name);
    onSelectProduct(product);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredProducts.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : filteredProducts.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredProducts.length) {
          handleSelectProduct(filteredProducts[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleFocus = () => {
    setIsOpen(true);
  };

  // Highlight matching text in product name
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const tokens = query.toLowerCase().trim().split(/\s+/);
    // Build a regex that matches any of the tokens
    const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <span key={i} className="font-bold text-[#e31e24]">{part}</span>
        : part
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          disabled={disabled}
          className={`w-full h-11 box-border px-3 pr-10 text-sm leading-snug rounded-xl border outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 transition-all text-[#1a2332] ${className}`}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-autocomplete="list"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (isOpen) {
              setIsOpen(false);
            } else {
              setIsOpen(true);
              inputRef.current?.focus();
            }
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto"
          role="listbox"
        >
          {productsLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-gray-400">
              <div className="w-4 h-4 border-2 border-gray-200 border-t-[#e31e24] rounded-full animate-spin" />
              <span className="text-sm">Loading products...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-6 text-center px-2">
              <Search className="w-5 h-5 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {value.trim()
                  ? 'No catalog match — you can still use what you typed below'
                  : catalogEmptyHint || 'No products available'}
              </p>
            </div>
          ) : (
            <>
              {value.trim() && (
                <div className="px-3 py-2 border-b border-gray-100">
                  <p className="text-xs text-gray-400">
                    {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found
                  </p>
                </div>
              )}
              {filteredProducts.map((product, index) => (
                <button
                  key={`${product.name}-${product.categorySlug}-${index}`}
                  type="button"
                  data-product-item
                  onClick={() => handleSelectProduct(product)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${
                    index === highlightedIndex
                      ? 'bg-[#e31e24]/5'
                      : 'hover:bg-gray-50'
                  } ${index < filteredProducts.length - 1 ? 'border-b border-gray-50' : ''}`}
                  role="option"
                  aria-selected={index === highlightedIndex}
                >
                  {product.image ? (
                    <img
                      src={resolveMediaUrl(product.image)}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover border border-gray-100 bg-white flex-shrink-0 mt-0.5"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Package className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1a2332] truncate leading-tight">
                      {highlightMatch(product.name, value)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 truncate">
                        {product.categoryName}
                      </span>
                      {product.brand && (
                        <>
                          <span className="text-gray-200">|</span>
                          <span className="text-xs text-gray-400 truncate">{product.brand}</span>
                        </>
                      )}
                      {product.partNumber && (
                        <>
                          <span className="text-gray-200">|</span>
                          <span className="text-xs text-gray-300 truncate font-mono">{product.partNumber}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {filteredProducts.length >= 50 && (
                <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-400 text-center">
                    Showing first 50 results. Type more to narrow down.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};



// ─── Main QuoteRequest Component ───
const QuoteRequest: React.FC<QuoteRequestProps> = ({ isModal = false, onClose, initialCategory, initialProductName }) => {
  const { contactDetails } = useLiveContactDetails();
  const { categories: liveCategories } = useLiveCategories();

  // ── All products for autocomplete ──
  const [allProducts, setAllProducts] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // Fetch all products on mount for the autocomplete
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [customProducts, overrides] = await Promise.all([
          fetchCustomProducts(),
          fetchProductOverrides(),
        ]);

        if (cancelled) return;

        // Build category slug → name map from live categories
        const catMap = new Map<string, string>();
        liveCategories.forEach(c => catMap.set(c.slug, c.name));

        // Build product options with overrides applied
        const options: ProductOption[] = customProducts
          .filter(p => p.showOnWebsite !== false)
          .map((p: Product) => {
            const override = overrides[p.id];
            const name = override?.name ?? p.name;
            const brand = override?.brand ?? p.brand;
            return {
              name,
              categorySlug: p.categorySlug,
              categoryName: catMap.get(p.categorySlug) || p.category || p.categorySlug,
              partNumber: p.partNumber || '',
              otherNames: p.otherNames || '',
              brand: brand || '',
              image: (override?.image ?? p.image) || undefined,
            };
          });

        // Sort alphabetically by name
        options.sort((a, b) => a.name.localeCompare(b.name));

        setAllProducts(options);
      } catch (err) {
        console.error('[QuoteRequest] Failed to fetch products for autocomplete:', err);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [liveCategories]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: '',
  });
  const [lines, setLines] = useState<ProductLine[]>(() => {
    const row = newLineRow();
    if (initialProductName) row.productName = initialProductName;
    return [row];
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Pre-populate fields when initial values change (e.g. when modal opens with product context)
  useEffect(() => {
    if (!initialCategory && !initialProductName) return;
    setLines((prev) => {
      const next = [...prev];
      if (!next[0]) return prev;
      const row: ProductLine = { ...next[0] };
      if (initialProductName) row.productName = initialProductName;
      if (initialCategory) {
        row.categorySlug = initialCategory;
        const cat = liveCategories.find((c) => c.slug === initialCategory);
        row.categoryLabel = cat?.name ?? initialCategory;
        row.searchCategorySlug = initialCategory;
      }
      next[0] = row;
      return next;
    });
  }, [initialCategory, initialProductName, liveCategories]);

  const sortedCategoryOptions = React.useMemo(
    () => [...liveCategories].sort((a, b) => a.name.localeCompare(b.name)),
    [liveCategories]
  );

  const hasPhones = contactDetails.phones.length > 0;
  const hasEmails = contactDetails.emails.length > 0;
  const hasAddresses = contactDetails.addresses.length > 0;
  const hasHours = contactDetails.businessHours.length > 0;
  const hasAnyContact = hasPhones || hasEmails || hasAddresses || hasHours;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (!formData.name.trim()) {
        setSubmitError('Please enter your name.');
        return;
      }
      if (!formData.email.trim()) {
        setSubmitError('Please enter your email address.');
        return;
      }
      const nonempty = lines.filter((l) => l.productName.trim());
      if (nonempty.length === 0) {
        setSubmitError('Add at least one product (search the catalog or type a description).');
        return;
      }
      const phoneDigits = digitsFromPhoneInput(formData.phone);
      const phoneForSave = phoneDigits.length === 10 ? formatPhoneUsMask(phoneDigits) : formData.phone.trim();

      const productPayload = nonempty
        .map((l, i) => {
          const name = l.productName.trim();
          const q = l.quantity.trim();
          return `${i + 1}. ${name}${q ? ` — Qty: ${q}` : ''}`;
        })
        .join('\n');
      const quantityPayload = nonempty.map((l) => l.quantity.trim()).filter(Boolean).join(' | ');

      const categorySlugs = [
        ...new Set(
          nonempty
            .map((l) => l.categorySlug || l.searchCategorySlug)
            .filter((s): s is string => Boolean(s && String(s).trim()))
        ),
      ];
      const categoryPayload = categorySlugs.join(', ') || '';

      const result = await saveQuoteRequest({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: phoneForSave,
        company: formData.company.trim(),
        category: categoryPayload,
        product: productPayload,
        quantity: quantityPayload,
        message: formData.message.trim(),
        status: 'new',
      });
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };


  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleProductSelectForLine = useCallback((lineKey: string, product: ProductOption) => {
    setLines((prev) =>
      prev.map((l) =>
        l.key === lineKey
          ? {
              ...l,
              productName: product.name,
              categorySlug: product.categorySlug,
              categoryLabel: product.categoryName || product.categorySlug,
              searchCategorySlug: product.categorySlug,
              quantity: '1',
            }
          : l
      )
    );
  }, []);

  const resetForm = () => {
    setSubmitted(false);
    setSubmitError(null);
    setFormData({ name: '', email: '', phone: '', company: '', message: '' });
    setLines([newLineRow()]);
  };


  const formContent = submitted ? (
    <div className="text-center py-12">
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>
      <h3 className="text-2xl font-bold text-[#1a2332] mb-2">Quote Request Submitted!</h3>
      <p className="text-gray-500 max-w-md mx-auto mb-6">
        Thank you for your interest. Our team will review your request and get back to you within 24 hours.
      </p>
      <button
        onClick={resetForm}
        className="text-[#e31e24] font-semibold hover:underline"
      >
        Submit Another Request
      </button>
    </div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold text-[#1a2332] mb-1.5">Full Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            required
            autoComplete="name"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 transition-all text-[#1a2332]"
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#1a2332] mb-1.5">Email Address *</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            required
            autoComplete="email"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 transition-all text-[#1a2332]"
            placeholder="john@company.com"
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-semibold text-[#1a2332] mb-1.5">Phone Number</label>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={formData.phone}
            onChange={(e) => {
              const masked = formatPhoneUsMask(digitsFromPhoneInput(e.target.value));
              handleChange('phone', masked);
            }}
            maxLength={14}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 transition-all text-[#1a2332] font-mono tracking-tight"
            placeholder="(876) 123-4567"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-[#1a2332] mb-1.5">Company Name</label>
          <input
            type="text"
            value={formData.company}
            onChange={(e) => handleChange('company', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 transition-all text-[#1a2332]"
            placeholder="Your Company Inc. (optional)"
          />
        </div>
      </div>

      {/* ── Product lines (catalog search or free text); catalog category shown as info when applicable ── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <label className="block text-sm font-semibold text-[#1a2332]">
            Products *
            <span className="text-xs font-normal text-gray-500 ml-1.5 block sm:inline mt-0.5 sm:mt-0">
              Pick a category to narrow the catalog, then search or type a description
            </span>
          </label>
        </div>

        <div className="hidden sm:grid sm:grid-cols-[minmax(0,8.75rem)_minmax(18rem,1fr)_minmax(0,5.5rem)_auto] gap-3 text-xs font-medium text-gray-500 px-0 mb-1">
          <span>Category</span>
          <span>Product</span>
          <span>Qty</span>
          <span className="w-10 sm:w-11 shrink-0" aria-hidden />
        </div>

        <div className="space-y-4">
          {lines.map((line, idx) => {
            const productsForLine = line.searchCategorySlug
              ? allProducts.filter((p) => p.categorySlug === line.searchCategorySlug)
              : allProducts;
            const filterCategoryName =
              line.searchCategorySlug &&
              (sortedCategoryOptions.find((c) => c.slug === line.searchCategorySlug)?.name ||
                line.searchCategorySlug);

            return (
            <div key={line.key} className="space-y-1.5">
              <span className="sm:hidden text-xs font-medium text-gray-500 block">
                Product line {lines.length > 1 ? `(${idx + 1})` : ''}
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,8.75rem)_minmax(18rem,1fr)_minmax(0,5.5rem)_auto] gap-3 items-center">
                <div className="min-w-0 max-w-full sm:max-w-[8.75rem]">
                  <span className="sm:hidden text-xs font-medium text-gray-500 mb-1 block">Category</span>
                  <select
                    aria-label={`Filter catalog for line ${idx + 1}`}
                    value={line.searchCategorySlug ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key
                            ? {
                                ...l,
                                searchCategorySlug: v || undefined,
                                categorySlug: undefined,
                                categoryLabel: undefined,
                              }
                            : l
                        )
                      );
                    }}
                    className="w-full max-w-full h-11 box-border px-3 rounded-xl border border-gray-200 outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 transition-all text-[#1a2332] text-sm leading-snug bg-white"
                  >
                    <option value="">All categories</option>
                    {sortedCategoryOptions.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                    {line.searchCategorySlug &&
                      !sortedCategoryOptions.some((c) => c.slug === line.searchCategorySlug) && (
                        <option value={line.searchCategorySlug}>
                          {line.categoryLabel || line.searchCategorySlug}
                        </option>
                      )}
                  </select>
                </div>
                <div className="min-w-0 sm:min-w-[18rem]">
                  <span className="sm:hidden text-xs font-medium text-gray-500 mb-1 block">Product</span>
                  <ProductAutocomplete
                    value={line.productName}
                    onChange={(val) =>
                      setLines((prev) =>
                        prev.map((l) => {
                          if (l.key !== line.key) return l;
                          const hadCatalogPick = Boolean(l.categorySlug);
                          return {
                            ...l,
                            productName: val,
                            categorySlug: undefined,
                            categoryLabel: undefined,
                            searchCategorySlug: hadCatalogPick ? undefined : l.searchCategorySlug,
                          };
                        })
                      )
                    }
                    onSelectProduct={(p) => handleProductSelectForLine(line.key, p)}
                    products={productsForLine}
                    productsLoading={productsLoading}
                    placeholder={
                      line.searchCategorySlug
                        ? `Search in ${filterCategoryName || 'category'}…`
                        : 'Search or type product name…'
                    }
                    catalogEmptyHint={
                      line.searchCategorySlug && productsForLine.length === 0
                        ? `No catalog items in “${filterCategoryName || 'this category'}”. Pick another category, choose All categories, or type a product description.`
                        : undefined
                    }
                    className="border-gray-200"
                  />
                </div>
                <div className="min-w-0">
                  <span className="sm:hidden text-xs font-medium text-gray-500 mb-1 block">Qty</span>
                  <input
                    type="text"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l) =>
                          l.key === line.key ? { ...l, quantity: e.target.value } : l
                        )
                      )
                    }
                    className="w-full h-11 box-border px-3 rounded-xl border border-gray-200 outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 transition-all text-[#1a2332] text-sm leading-snug"
                    placeholder="e.g. 10"
                    autoComplete="off"
                  />
                </div>
                <div className="flex justify-end items-center min-h-11 sm:min-h-0 self-center">
                  {lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setLines((prev) =>
                          prev.length <= 1 ? prev : prev.filter((l) => l.key !== line.key)
                        )
                      }
                      className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-colors shrink-0"
                      aria-label={`Remove product line ${idx + 1}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="inline-flex w-10 sm:w-11 h-10 shrink-0 items-center justify-center" aria-hidden />
                  )}
                </div>
              </div>
              {!line.categoryLabel && line.searchCategorySlug ? (
                <p className="text-xs text-gray-500 leading-snug pl-0 sm:col-span-full">
                  <span className="text-gray-400">Searching in:</span>{' '}
                  <span className="text-gray-700 font-medium">{filterCategoryName}</span>
                </p>
              ) : null}
            </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, newLineRow()])}
          className="inline-flex items-center gap-2 text-sm font-semibold text-black hover:text-gray-800"
        >
          <Plus className="w-4 h-4" />
          Add another product line
        </button>
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1a2332] mb-1.5">Additional Details</label>
        <textarea
          value={formData.message}
          onChange={(e) => handleChange('message', e.target.value)}
          rows={4}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:border-[#e31e24] focus:ring-2 focus:ring-[#e31e24]/10 transition-all text-[#1a2332] resize-none"
          placeholder="Describe your requirements, specifications, or any questions..."
        />
      </div>

      {submitError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {submitError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 bg-[#e31e24] text-white py-4 rounded-xl font-bold text-lg hover:bg-[#c91a1f] transition-all shadow-lg shadow-red-200 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <>Submitting…</>
        ) : (
          <>
            <Send className="w-5 h-5" />
            Submit Quote Request
          </>
        )}
      </button>
    </form>
  );

  // ── Modal variant ──
  if (isModal) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-slide-in">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
            <div>
              <h3 className="text-xl font-bold text-[#1a2332]">Request a Quote</h3>
              {initialProductName && (
                <p className="text-sm text-gray-500 mt-0.5">
                  For: <span className="font-medium text-[#1a2332]">{initialProductName}</span>
                </p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="p-6">{formContent}</div>
        </div>
      </div>
    );
  }

  // ── Full-page section variant ──
  return (
    <section id="contact" className="py-20 lg:py-28 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        {/* ── Section Header ── */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e31e24] text-sm font-semibold">Get in Touch</span>
          </div>
          <h2 className="text-3xl lg:text-4xl font-extrabold text-[#1a2332] mb-3">
            Request a Custom Quote
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto leading-relaxed">
            Need pricing for bulk orders or custom configurations? Our sales team is ready to help
            you find the perfect solution at the best price.
          </p>
        </div>

        {/* ── Two-Column Layout: Contact Info LEFT  |  Form RIGHT ── */}
        <div className={`grid ${hasAnyContact ? 'lg:grid-cols-5' : ''} gap-8 lg:gap-10 items-stretch`}>

          {/* ── LEFT: Contact Information (narrower — 2 of 5 cols) ── */}
          {hasAnyContact && (
            <div className="flex flex-col lg:col-span-2">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-lg overflow-hidden flex flex-col flex-1">
                {/* Card Header — matches form header */}
                <div className="bg-gradient-to-br from-[#1a2332] to-[#0f1923] px-6 py-5">
                  <h3 className="text-white font-bold text-lg">Contact Information</h3>
                  <p className="text-gray-400 text-sm mt-1">Reach out to us through any of these channels</p>
                </div>


                <div className="p-6 sm:p-8 space-y-6 flex-1">
                  {/* Phone Numbers — displayed side by side */}
                  {hasPhones && (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[#e31e24]/10 flex items-center justify-center flex-shrink-0">
                          <Phone className="w-5 h-5 text-[#e31e24]" />
                        </div>
                        <h4 className="font-semibold text-[#1a2332] text-sm">Call Us</h4>
                      </div>
                      <div className={`grid ${contactDetails.phones.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-4 ml-0`}>
                        {contactDetails.phones.map((phone, idx) => (
                          <div
                            key={`phone-${idx}`}
                            className="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:border-[#e31e24]/20 hover:bg-[#e31e24]/[0.02] transition-all"
                          >
                            {phone.label && (
                              <p className="text-sm text-gray-500 font-semibold mb-1.5">{phone.label}</p>
                            )}
                            <a
                              href={`tel:${phone.number.replace(/[^+\d]/g, '')}`}
                              className="text-[#1a2332] font-semibold hover:text-[#e31e24] transition-colors text-sm flex items-center gap-2 group"
                            >
                              {phone.number}
                              <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#e31e24]" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>

                  )}

                  {/* Divider */}
                  {hasPhones && (hasEmails || hasAddresses || hasHours) && (
                    <div className="border-t border-gray-100" />
                  )}

                  {/* Email */}
                  {hasEmails && (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[#e31e24]/10 flex items-center justify-center flex-shrink-0">
                          <Mail className="w-5 h-5 text-[#e31e24]" />
                        </div>
                        <h4 className="font-semibold text-[#1a2332] text-sm">Email Us</h4>
                      </div>
                      <div className={`grid ${contactDetails.emails.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                        {contactDetails.emails.map((email, idx) => (
                          <div
                            key={`email-${idx}`}
                            className="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:border-[#e31e24]/20 hover:bg-[#e31e24]/[0.02] transition-all"
                          >
                            {email.label && contactDetails.emails.length > 1 && (
                              <p className="text-sm text-gray-500 font-semibold mb-1.5">{email.label}</p>
                            )}
                            <a
                              href={`mailto:${email.address}`}
                              className="text-[#1a2332] font-semibold hover:text-[#e31e24] transition-colors text-sm break-all flex items-center gap-2 group"
                            >
                              {email.address}
                              <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-[#e31e24] flex-shrink-0" />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  {hasEmails && (hasAddresses || hasHours) && (
                    <div className="border-t border-gray-100" />
                  )}

                  {/* Address */}
                  {hasAddresses && (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[#e31e24]/10 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-5 h-5 text-[#e31e24]" />
                        </div>
                        <h4 className="font-semibold text-[#1a2332] text-sm">Visit Us</h4>
                      </div>
                      <div className={`grid ${contactDetails.addresses.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                        {contactDetails.addresses.map((addr, idx) => (
                          <div
                            key={`addr-${idx}`}
                            className="bg-gray-50 rounded-xl p-4 border border-gray-100"
                          >
                            {addr.label && contactDetails.addresses.length > 1 && (
                              <p className="text-sm text-gray-500 font-semibold mb-1.5">{addr.label}</p>
                            )}
                            <p className="text-[#1a2332] font-semibold text-sm leading-relaxed">
                              {addr.address}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Divider */}
                  {hasAddresses && hasHours && (
                    <div className="border-t border-gray-100" />
                  )}

                  {/* Business Hours */}
                  {hasHours && (
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[#e31e24]/10 flex items-center justify-center flex-shrink-0">
                          <Clock className="w-5 h-5 text-[#e31e24]" />
                        </div>
                        <h4 className="font-semibold text-[#1a2332] text-sm">Business Hours</h4>
                      </div>
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <div className="space-y-2">
                          {contactDetails.businessHours.map((h, idx) => (
                            <div key={`hours-${idx}`} className="flex items-baseline gap-3 text-sm">
                              <span className="text-gray-500 font-semibold min-w-[70px]">{h.day}:</span>
                              <span className="text-[#1a2332] font-semibold">{h.hours}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}



          {/* ── RIGHT: Quote Form (wider — 3 of 5 cols) ── */}
          <div className={`flex flex-col ${hasAnyContact ? 'lg:col-span-3' : 'max-w-4xl mx-auto w-full'}`}>

            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden flex flex-col flex-1">
              {/* Card Header — matches contact info header */}
              <div className="bg-gradient-to-br from-[#1a2332] to-[#0f1923] px-6 py-5">
                <h3 className="text-white font-bold text-lg">Fill Out the Form Below</h3>
                <p className="text-gray-400 text-sm mt-1">We'll get back to you within 24 hours with a competitive quote</p>
              </div>

              <div className="p-6 sm:p-8 flex-1">
                {formContent}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default QuoteRequest;
