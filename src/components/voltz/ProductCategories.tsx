import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Filter, Package } from 'lucide-react';
import { useLiveCategories } from '@/hooks/useLiveCMSData';
import { getIconComponent } from '@/lib/iconMap';

const ITEMS_PER_PAGE = 10;

const ProductCategories: React.FC = () => {
  const navigate = useNavigate();
  const { categories } = useLiveCategories();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('popular');
  const [currentPage, setCurrentPage] = useState(0);
  const [showAllFilters, setShowAllFilters] = useState(false);


  // Touch/swipe state
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const isDragging = useRef(false);

  const visibleCategories = categories.filter(cat => cat.visible);

  const filteredCategories = visibleCategories
    .filter(cat => !activeCategory || cat.id === activeCategory)
    .sort((a, b) => {
      if (sortBy === 'newest') return b.productCount - a.productCount;
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'count-high') return b.productCount - a.productCount;
      if (sortBy === 'count-low') return a.productCount - b.productCount;
      return 0;
    });

  const totalPages = Math.ceil(filteredCategories.length / ITEMS_PER_PAGE);
  const paginatedCategories = filteredCategories.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(0);
  }, [activeCategory, sortBy]);

  const goToPage = useCallback((page: number) => {
    if (page >= 0 && page < totalPages) {
      setCurrentPage(page);
    }
  }, [totalPages]);

  const goNext = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const goPrev = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  // Touch handlers for swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isDragging.current) {
      touchEndX.current = e.touches[0].clientX;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;
    if (diff > threshold) {
      goNext();
    } else if (diff < -threshold) {
      goPrev();
    }
  }, [goNext, goPrev]);

  // Mouse drag handlers for desktop swipe
  const mouseStartX = useRef(0);
  const isMouseDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseStartX.current = e.clientX;
    isMouseDragging.current = true;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMouseDragging.current) {
      e.preventDefault();
    }
  }, []);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isMouseDragging.current) return;
    isMouseDragging.current = false;
    const diff = mouseStartX.current - e.clientX;
    const threshold = 50;
    if (diff > threshold) {
      goNext();
    } else if (diff < -threshold) {
      goPrev();
    }
  }, [goNext, goPrev]);

  const handleViewCategory = (slug: string) => {
    navigate(`/products/${slug}`);
  };

  if (visibleCategories.length === 0) {
    return (
      <section id="products" className="py-20 lg:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 text-center">
          <Package className="w-16 h-16 text-gray-200 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#1a2332] mb-2">No Categories Available</h2>
          <p className="text-gray-500">Product categories will appear here once added via the CMS.</p>
        </div>
      </section>
    );
  }

  return (
    <section id="products" className="py-20 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-[#e31e24]/5 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e31e24] text-sm font-semibold">Our Product Range</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold text-[#1a2332] mb-4">
            Industrial-Grade Components
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto">
            Browse our comprehensive catalog of electrical and automation products from the world's leading manufacturers.
          </p>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                !activeCategory
                  ? 'bg-[#e31e24] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {(showAllFilters ? visibleCategories : visibleCategories.slice(0, 6)).map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeCategory === cat.id
                    ? 'bg-[#e31e24] text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat.name}
              </button>
            ))}
            {!showAllFilters && visibleCategories.length > 6 && (
              <button
                onClick={() => setShowAllFilters(true)}
                className="text-xs text-[#e31e24] font-semibold ml-1 hover:text-[#c91a1f] hover:underline transition-all cursor-pointer"
              >
                +{visibleCategories.length - 6} more
              </button>
            )}
            {showAllFilters && visibleCategories.length > 6 && (
              <button
                onClick={() => setShowAllFilters(false)}
                className="text-xs text-[#e31e24] font-semibold ml-1 hover:text-[#c91a1f] hover:underline transition-all cursor-pointer"
              >
                Show less
              </button>
            )}

          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-sm bg-gray-100 rounded-lg px-3 py-2 text-gray-600 font-medium outline-none cursor-pointer"
            >
              <option value="popular">Most Popular</option>
              <option value="name">Name: A–Z</option>
              <option value="count-high">Products: High to Low</option>
              <option value="count-low">Products: Low to High</option>
            </select>
          </div>
        </div>

        {/* Carousel Navigation Header */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-gray-500">
              Showing {currentPage * ITEMS_PER_PAGE + 1}–{Math.min((currentPage + 1) * ITEMS_PER_PAGE, filteredCategories.length)} of {filteredCategories.length} categories
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={goPrev}
                disabled={currentPage === 0}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  currentPage === 0
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-[#e31e24] text-white hover:bg-[#c91a1f] shadow-md'
                }`}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goNext}
                disabled={currentPage === totalPages - 1}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  currentPage === totalPages - 1
                    ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                    : 'bg-[#e31e24] text-white hover:bg-[#c91a1f] shadow-md'
                }`}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Categories Grid with Swipe */}
        <div
          ref={containerRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { isMouseDragging.current = false; }}
          className="select-none"
        >
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5 transition-opacity duration-300">
            {paginatedCategories.map((cat) => {
              const IconComp = getIconComponent(cat.icon);
              return (
                <div
                  key={cat.id}
                  onClick={() => handleViewCategory(cat.slug)}
                  className="group bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-xl hover:border-[#e31e24]/20 transition-all duration-300 hover:-translate-y-1 cursor-pointer"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors"
                        style={{ backgroundColor: `${cat.color}15` }}
                      >
                        <IconComp className="w-6 h-6" style={{ color: cat.color }} />
                      </div>
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
                        {cat.productCount} {cat.productCount === 1 ? 'Product' : 'Products'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#1a2332] mb-1 group-hover:text-[#e31e24] transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-xs text-gray-500 mb-4 line-clamp-2">{cat.description}</p>
                    <div className="flex items-center gap-1 text-[#e31e24] font-semibold text-sm group-hover:gap-2 transition-all">
                      Browse
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dot Indicators */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-8">
            {Array.from({ length: totalPages }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => goToPage(idx)}
                className={`transition-all duration-300 rounded-full ${
                  idx === currentPage
                    ? 'w-8 h-3 bg-[#e31e24]'
                    : 'w-3 h-3 bg-gray-300 hover:bg-gray-400'
                }`}
                aria-label={`Go to page ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default ProductCategories;
