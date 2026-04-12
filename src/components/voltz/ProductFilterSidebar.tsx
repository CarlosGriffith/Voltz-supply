import React, { useState } from 'react';
import { DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS } from '@/lib/utils';
import { ChevronDown, ChevronUp, X, SlidersHorizontal } from 'lucide-react';

export interface FilterState {
  priceRange: [number, number];
  brands: string[];
  specs: Record<string, string[]>;
  inStockOnly: boolean;
}

interface ProductFilterSidebarProps {
  brands: string[];
  specFilters: { key: string; label: string; options: string[] }[];
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  maxPrice: number;
  productCount: number;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const ProductFilterSidebar: React.FC<ProductFilterSidebarProps> = ({
  brands,
  specFilters,
  filters,
  onFilterChange,
  maxPrice,
  productCount,
  mobileOpen,
  onMobileClose,
}) => {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    price: true,
    brand: true,
    stock: true,
    ...Object.fromEntries(specFilters.map(s => [s.key, true])),
  });

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleBrand = (brand: string) => {
    const newBrands = filters.brands.includes(brand)
      ? filters.brands.filter(b => b !== brand)
      : [...filters.brands, brand];
    onFilterChange({ ...filters, brands: newBrands });
  };

  const toggleSpec = (key: string, value: string) => {
    const current = filters.specs[key] || [];
    const newValues = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onFilterChange({
      ...filters,
      specs: { ...filters.specs, [key]: newValues },
    });
  };

  const clearAllFilters = () => {
    onFilterChange({
      priceRange: [0, maxPrice],
      brands: [],
      specs: {},
      inStockOnly: false,
    });
  };

  const hasActiveFilters =
    filters.brands.length > 0 ||
    Object.values(filters.specs).some(v => v.length > 0) ||
    filters.inStockOnly ||
    filters.priceRange[0] > 0 ||
    filters.priceRange[1] < maxPrice;

  const filterContent = (
    <div className="space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-[#e31e24]" />
          <h3 className="font-bold text-[#1a2332] text-lg">Filters</h3>
        </div>
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="text-sm text-[#e31e24] font-semibold hover:underline"
          >
            Clear All
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 pt-3 pb-2">{productCount} products found</p>

      {/* Price Range */}
      <div className="border-b border-gray-100 pb-4">
        <button
          onClick={() => toggleSection('price')}
          className="flex items-center justify-between w-full py-3 text-left"
        >
          <span className="font-semibold text-[#1a2332] text-sm">Price Range</span>
          {expandedSections.price ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {expandedSections.price && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Min ($)</label>
                <input
                  type="number"
                  value={filters.priceRange[0] === 0 ? '' : filters.priceRange[0]}
                  placeholder="0"
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      priceRange: [Number(e.target.value) || 0, filters.priceRange[1]],
                    })
                  }
                  className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#e31e24] text-[#1a2332] ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`}
                  min={0}
                />
              </div>
              <span className="text-gray-300 mt-5">–</span>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Max ($)</label>
                <input
                  type="number"
                  value={filters.priceRange[1]}
                  onChange={(e) =>
                    onFilterChange({
                      ...filters,
                      priceRange: [filters.priceRange[0], Number(e.target.value) || maxPrice],
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#e31e24] text-[#1a2332]"
                  min={0}
                />
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={maxPrice}
              value={filters.priceRange[1]}
              onChange={(e) =>
                onFilterChange({
                  ...filters,
                  priceRange: [filters.priceRange[0], Number(e.target.value)],
                })
              }
              className="w-full accent-[#e31e24]"
            />
          </div>
        )}
      </div>

      {/* In Stock */}
      <div className="border-b border-gray-100 pb-4">
        <button
          onClick={() => toggleSection('stock')}
          className="flex items-center justify-between w-full py-3 text-left"
        >
          <span className="font-semibold text-[#1a2332] text-sm">Availability</span>
          {expandedSections.stock ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {expandedSections.stock && (
          <label className="flex items-center gap-3 cursor-pointer py-1">
            <div
              onClick={() => onFilterChange({ ...filters, inStockOnly: !filters.inStockOnly })}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                filters.inStockOnly
                  ? 'bg-[#e31e24] border-[#e31e24]'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {filters.inStockOnly && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-sm text-gray-600">In Stock Only</span>
          </label>
        )}
      </div>

      {/* Brand Filter */}
      <div className="border-b border-gray-100 pb-4">
        <button
          onClick={() => toggleSection('brand')}
          className="flex items-center justify-between w-full py-3 text-left"
        >
          <span className="font-semibold text-[#1a2332] text-sm">Brand</span>
          {expandedSections.brand ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </button>
        {expandedSections.brand && (
          <div className="space-y-2">
            {brands.map((brand) => (
              <label key={brand} className="flex items-center gap-3 cursor-pointer py-0.5">
                <div
                  onClick={() => toggleBrand(brand)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                    filters.brands.includes(brand)
                      ? 'bg-[#e31e24] border-[#e31e24]'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {filters.brands.includes(brand) && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-gray-600">{brand}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Spec Filters */}
      {specFilters.map((spec) => (
        <div key={spec.key} className="border-b border-gray-100 pb-4">
          <button
            onClick={() => toggleSection(spec.key)}
            className="flex items-center justify-between w-full py-3 text-left"
          >
            <span className="font-semibold text-[#1a2332] text-sm">{spec.label}</span>
            {expandedSections[spec.key] ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {expandedSections[spec.key] && (
            <div className="space-y-2">
              {spec.options.map((option) => (
                <label key={option} className="flex items-center gap-3 cursor-pointer py-0.5">
                  <div
                    onClick={() => toggleSpec(spec.key, option)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                      (filters.specs[spec.key] || []).includes(option)
                        ? 'bg-[#e31e24] border-[#e31e24]'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {(filters.specs[spec.key] || []).includes(option) && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-gray-600">{option}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0">
        <div className="sticky top-24 bg-white rounded-2xl border border-gray-200 p-5 max-h-[calc(100vh-120px)] overflow-y-auto">
          {filterContent}
        </div>
      </aside>

      {/* Mobile Filter Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white shadow-2xl overflow-y-auto animate-slide-in">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center justify-between z-10">
              <h3 className="font-bold text-[#1a2332]">Filters</h3>
              <button onClick={onMobileClose} className="p-1 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5">{filterContent}</div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProductFilterSidebar;
