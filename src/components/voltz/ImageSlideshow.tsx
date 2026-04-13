import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { resolveMediaUrl } from '@/lib/mediaUrl';

interface ImageSlideshowProps {
  images: string[];
  startIndex?: number;
  alt?: string;
  onClose: () => void;
}

const ImageSlideshow: React.FC<ImageSlideshowProps> = ({ images, startIndex = 0, alt = 'Product', onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const touchStartX = useRef<number | null>(null);
  const thumbnailContainerRef = useRef<HTMLDivElement>(null);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 5;
  const ZOOM_STEP = 0.5;

  // Reset zoom/pan when changing images
  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % images.length);
    resetZoom();
  }, [images.length, resetZoom]);

  const goPrev = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + images.length) % images.length);
    resetZoom();
  }, [images.length, resetZoom]);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(prev + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => {
      const newZoom = Math.max(prev - ZOOM_STEP, MIN_ZOOM);
      if (newZoom === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return newZoom;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    resetZoom();
  }, [resetZoom]);

  // Double-click to toggle zoom
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (zoom > 1) {
      resetZoom();
    } else {
      // Zoom to 2.5x centered on click position
      const container = imageContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const clickX = e.clientX - rect.left - rect.width / 2;
        const clickY = e.clientY - rect.top - rect.height / 2;
        setZoom(2.5);
        setPan({ x: -clickX * 1.5, y: -clickY * 1.5 });
      } else {
        setZoom(2.5);
      }
    }
  }, [zoom, resetZoom]);

  // Scroll wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.3 : 0.3;
    setZoom(prev => {
      const newZoom = Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM);
      if (newZoom === MIN_ZOOM) setPan({ x: 0, y: 0 });
      return newZoom;
    });
  }, []);

  // Attach wheel listener (non-passive)
  useEffect(() => {
    const container = imageContainerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Mouse drag for panning
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  }, [zoom, pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({
      x: panStart.current.x + dx,
      y: panStart.current.y + dy,
    });
  }, [isDragging, zoom]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Touch pinch-to-zoom and drag
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      if (zoom > 1) {
        // Single finger drag when zoomed
        setIsDragging(true);
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        panStart.current = { ...pan };
      } else {
        // Swipe navigation when not zoomed
        touchStartX.current = e.touches[0].clientX;
      }
    } else if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDistance.current = Math.sqrt(dx * dx + dy * dy);
      lastTouchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging && zoom > 1) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      setPan({
        x: panStart.current.x + dx,
        y: panStart.current.y + dy,
      });
    } else if (e.touches.length === 2 && lastTouchDistance.current !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const scale = distance / lastTouchDistance.current;
      setZoom(prev => Math.min(Math.max(prev * scale, MIN_ZOOM), MAX_ZOOM));
      lastTouchDistance.current = distance;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      if (isDragging) {
        setIsDragging(false);
      } else if (touchStartX.current !== null && zoom <= 1) {
        const diff = touchStartX.current - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 50) {
          if (diff > 0) goNext();
          else goPrev();
        }
        touchStartX.current = null;
      }
      lastTouchDistance.current = null;
      lastTouchCenter.current = null;
      if (zoom <= 1) setPan({ x: 0, y: 0 });
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === '+' || e.key === '=') handleZoomIn();
      else if (e.key === '-') handleZoomOut();
      else if (e.key === '0') handleResetZoom();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, goNext, goPrev, handleZoomIn, handleZoomOut, handleResetZoom]);

  // Prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Auto-scroll thumbnail into view
  useEffect(() => {
    if (thumbnailContainerRef.current) {
      const thumb = thumbnailContainerRef.current.children[currentIndex] as HTMLElement;
      if (thumb) {
        thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [currentIndex]);

  if (images.length === 0) return null;

  const isZoomed = zoom > 1;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/95 backdrop-blur-md">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 flex-shrink-0">
        <div className="text-white/70 text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Zoom out"
            title="Zoom out (−)"
          >
            <ZoomOut className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-medium transition-colors min-w-[52px] text-center"
            aria-label="Reset zoom"
            title="Reset zoom (0)"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Zoom in"
            title="Zoom in (+)"
          >
            <ZoomIn className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors ml-1"
            aria-label="Fit to screen"
            title="Fit to screen"
          >
            <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <div className="w-px h-6 bg-white/20 mx-1" />
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close slideshow"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Main image area */}
      <div
        ref={imageContainerRef}
        className={`flex-1 relative flex items-center justify-center px-4 sm:px-16 min-h-0 overflow-hidden ${
          isZoomed ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
      >
        {/* Previous button */}
        {images.length > 1 && !isZoomed && (
          <button
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all hover:scale-110"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-5 h-5 sm:w-7 sm:h-7" />
          </button>
        )}

        {/* Image with zoom & pan */}
        <div
          className="w-full h-full flex items-center justify-center select-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          <img
            key={currentIndex}
            src={resolveMediaUrl(images[currentIndex])}
            alt={`${alt} - Image ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain rounded-lg select-none animate-in fade-in duration-200"
            draggable={false}
          />
        </div>

        {/* Next button */}
        {images.length > 1 && !isZoomed && (
          <button
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 p-2 sm:p-3 rounded-full bg-white/10 hover:bg-white/25 text-white transition-all hover:scale-110"
            aria-label="Next image"
          >
            <ChevronRight className="w-5 h-5 sm:w-7 sm:h-7" />
          </button>
        )}

        {/* Zoom hint overlay - only show when not zoomed */}
        {!isZoomed && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white/70 text-xs px-3 py-1.5 rounded-full pointer-events-none select-none">
            Double-click or scroll to zoom
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex-shrink-0 px-4 sm:px-8 py-3 sm:py-4">
          <div
            ref={thumbnailContainerRef}
            className="flex items-center justify-center gap-2 overflow-x-auto pb-1 scrollbar-hide"
          >
            {images.map((img, idx) => (
              <button
                key={idx}
                onClick={() => { setCurrentIndex(idx); resetZoom(); }}
                className={`w-14 h-14 sm:w-16 sm:h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                  idx === currentIndex
                    ? 'border-white shadow-lg shadow-white/20 scale-110'
                    : 'border-white/20 hover:border-white/50 opacity-60 hover:opacity-90'
                }`}
              >
                <img
                  src={resolveMediaUrl(img)}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-contain bg-white/10 p-0.5"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

export default ImageSlideshow;
