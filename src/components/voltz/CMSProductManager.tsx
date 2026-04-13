import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { broadcastCMSUpdate, onCMSUpdate } from '@/lib/cmsCache';

import {
  ArrowLeft,
  Plus, Search, Edit3, Trash2, Save, X, Image, DollarSign,
  Package, ChevronDown, ChevronUp, AlertCircle, Check, Filter, Upload, FileImage,
  Star, Tag, Award, Loader2, Cloud, CloudOff, AlertTriangle, Flame, FileText, Link2, Shield, Weight, ListChecks, Settings2, Zap, Gauge, Activity, ImagePlus,
  Eye, EyeOff, Printer
} from 'lucide-react';


import { Product, type ProductDocument } from '@/data/products';
import { useCMS } from '@/contexts/CMSContext';
import { useCMSNotification } from '@/contexts/CMSNotificationContext';
import { DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS, fmtCurrency } from '@/lib/utils';
import {
  fetchProductOverrides,
  fetchCustomProducts,
  saveAllOverrides,
  saveAllCustomProducts,
  deleteCustomProduct as dbDeleteCustomProduct,
  deleteProductOverride as dbDeleteProductOverride,
  uploadCompressedImage,
  uploadProductDocument,
  toggleProductWebsiteVisibility,
  updateProductStockCount,
  type ProductOverride,
} from '@/lib/cmsData';
import { resolveMediaUrl } from '@/lib/mediaUrl';
import BarcodePrintModal from '@/components/voltz/BarcodePrintModal';



const TAG_OPTIONS: { label: string; value: string; color: string }[] = [
  { label: 'Best Seller', value: 'Best Seller', color: 'bg-red-600' },
  { label: 'New', value: 'New', color: 'bg-blue-600' },
  { label: 'Popular', value: 'Popular', color: 'bg-green-600' },
  { label: 'Best Value', value: 'Best Value', color: 'bg-purple-600' },
  { label: 'Premium', value: 'Premium', color: 'bg-amber-600' },
  { label: 'Top Rated', value: 'Top Rated', color: 'bg-cyan-600' },
];

function getTagColor(tagValue: string): string {
  if (tagValue === 'Special Offer') return 'bg-[#e31e24]';
  return TAG_OPTIONS.find(t => t.value === tagValue)?.color || 'bg-gray-500';
}

interface NewProduct {
  name: string;
  otherNames: string;
  categorySlug: string;
  brand: string;
  price: string;
  originalPrice: string;
  description: string;
  image: string;
  additionalImages: string[];
  partNumber: string;
  stockCount: string;
  isFeatured: boolean;
  badge: string;
  warranty: string;
  weight: string;
  voltage: string;
  amperage: string;
  phase: string;
  power: string;
  featuresText: string;
  specsText: string;
  documents: ProductDocument[];
}

const emptyNewProduct: NewProduct = {
  name: '', otherNames: '', categorySlug: '', brand: '', price: '', originalPrice: '',
  description: '', image: '', additionalImages: [], partNumber: '', stockCount: '', isFeatured: false,
  badge: '', warranty: '', weight: '', voltage: '', amperage: '', phase: '', power: '',
  featuresText: '', specsText: '', documents: [],
};

/** Non-empty trimmed part numbers are compared case-insensitively for uniqueness. */
function partNumberUniquenessKey(raw: string | undefined | null): string | null {
  const t = String(raw ?? '').trim();
  return t ? t.toLowerCase() : null;
}

/** Returns another product in the list with the same part # (excluding `excludeId` when set). */
function findDuplicatePartNumberProduct(
  products: Product[],
  partNumber: string,
  excludeId?: string | null
): Product | undefined {
  const key = partNumberUniquenessKey(partNumber);
  if (!key) return undefined;
  return products.find((p) => p.id !== excludeId && partNumberUniquenessKey(p.partNumber) === key);
}

/** True if `customProducts` contains two different rows with the same non-empty part #. */
function hasDuplicatePartNumbersInList(products: Product[]): boolean {
  const seen = new Map<string, string>();
  for (const p of products) {
    const key = partNumberUniquenessKey(p.partNumber);
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.set(key, p.id);
  }
  return false;
}




function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.readAsDataURL(file);
  });
}


// Image Upload Field
const ImageUploadField: React.FC<{
  value: string; onChange: (url: string) => void; accentColor?: string; id: string; label?: string;
}> = ({ value, onChange, accentColor = 'blue', id, label = 'Product Image' }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMode, setUploadMode] = useState<'url' | 'file'>('file');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const focusColorClass = accentColor === 'green' ? 'focus:border-green-500' : 'focus:border-blue-500';
  const accentBgLightClass = accentColor === 'green' ? 'bg-green-50 border-green-200 hover:bg-green-100' : 'bg-blue-50 border-blue-200 hover:bg-blue-100';
  const accentTextClass = accentColor === 'green' ? 'text-green-700' : 'text-blue-700';
  const dragBorderClass = accentColor === 'green' ? 'border-green-400 bg-green-50' : 'border-blue-400 bg-blue-50';

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) { setUploadError('Please select an image file.'); return; }
    if (file.size > 10 * 1024 * 1024) { setUploadError('Image too large. Max 10MB.'); return; }
    setUploading(true); setUploadError(null); setUploadSuccess(false);
    try {
      const dataUrl = await readImageAsDataUrl(file);

      onChange(dataUrl);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to process image:', err);
      setUploadError('Failed to process image.');
    } finally { setUploading(false); }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const isDataUrl = value?.startsWith('data:');
  const hasImage = !!value;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
        <Image className="w-3 h-3" /> {label}
      </label>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button type="button" onClick={() => { setUploadMode('url'); setUploadError(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${uploadMode === 'url' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
          <Image className="w-3 h-3" /> URL
        </button>
        <button type="button" onClick={() => { setUploadMode('file'); setUploadError(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${uploadMode === 'file' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>
          <Upload className="w-3 h-3" /> Upload
        </button>
      </div>
      {uploadMode === 'url' ? (
        <input type="url" value={isDataUrl ? '' : (value || '')} onChange={(e) => onChange(e.target.value)}
          placeholder={isDataUrl ? 'Image uploaded (enter URL to replace)' : 'https://example.com/image.jpg'}
          className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none ${focusColorClass}`} />
      ) : (
        <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all cursor-pointer ${
            uploadSuccess ? 'border-green-400 bg-green-50' : dragOver ? dragBorderClass : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
          }`}
          onClick={() => fileInputRef.current?.click()}>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileInputChange} className="hidden" />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 py-3">
              <div className="w-8 h-8 border-3 border-gray-300 border-t-[#e31e24] rounded-full animate-spin" />
              <span className="text-sm text-gray-600 font-semibold">Processing...</span>

            </div>
          ) : uploadSuccess ? (
            <div className="flex flex-col items-center gap-2 py-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center"><Check className="w-6 h-6 text-green-600" /></div>
              <span className="text-sm text-green-700 font-semibold">Uploaded!</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className={`w-10 h-10 rounded-xl ${accentBgLightClass} border flex items-center justify-center`}>
                <Upload className={`w-5 h-5 ${accentTextClass}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-700">Tap to upload or drag & drop</p>
                <p className="text-xs text-gray-400 mt-0.5">PNG, JPG, WebP up to 10MB</p>
              </div>
            </div>
          )}
        </div>
      )}
      {uploadError && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <span className="text-xs text-red-600 font-medium flex-1">{uploadError}</span>
          <button type="button" onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {hasImage && (
        <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-2 border border-gray-100">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 bg-white">
            <img src={resolveMediaUrl(value)} alt="Preview" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-green-700 flex items-center gap-1"><Check className="w-3 h-3" />{isDataUrl ? 'Uploaded' : 'URL'}</p>
          </div>
          <button type="button" onClick={(e) => { e.stopPropagation(); onChange(''); setUploadSuccess(false); }}
            className="w-9 h-9 sm:w-7 sm:h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 flex-shrink-0" title="Remove">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

// Additional Images Upload Field
const AdditionalImagesField: React.FC<{
  images: string[];
  onChange: (images: string[]) => void;
  accentColor?: string;
}> = ({ images, onChange, accentColor = 'blue' }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (files: FileList) => {
    setUploading(true);
    try {
      const newImages: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 10 * 1024 * 1024) continue;
        const dataUrl = await readImageAsDataUrl(file);

        newImages.push(dataUrl);
      }
      onChange([...images, ...newImages]);
    } catch (err) {
      console.error('Failed to process additional images:', err);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const accentBgClass = accentColor === 'green' ? 'bg-green-50 border-green-200 hover:bg-green-100' : 'bg-blue-50 border-blue-200 hover:bg-blue-100';
  const accentTxtClass = accentColor === 'green' ? 'text-green-700' : 'text-blue-700';

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
        <ImagePlus className="w-3 h-3" /> Additional Images
        <span className="text-gray-400 font-normal">(side view, top view, etc.)</span>
      </label>

      {/* Existing images grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative group aspect-square rounded-lg border border-gray-200 overflow-hidden bg-white">
              <img src={resolveMediaUrl(img)} alt={`Additional ${idx + 1}`} className="w-full h-full object-contain p-1" />
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[9px] text-center py-0.5">
                {idx === 0 ? 'Side' : idx === 1 ? 'Top' : idx === 2 ? 'Bottom' : `View ${idx + 1}`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all ${accentBgClass}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFileSelect(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-[#e31e24] rounded-full animate-spin" />
            <span className="text-xs text-gray-600 font-semibold">Processing...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1">
            <ImagePlus className={`w-4 h-4 ${accentTxtClass}`} />
            <span className={`text-xs font-semibold ${accentTxtClass}`}>
              Add More Images
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Tag Selector
const TagSelector: React.FC<{
  selectedTags: string[]; onChange: (tags: string[]) => void; accentColor?: string;
}> = ({ selectedTags, onChange, accentColor = 'blue' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTag = (tagValue: string) => {
    if (selectedTags.includes(tagValue)) onChange(selectedTags.filter(t => t !== tagValue));
    else onChange([...selectedTags, tagValue]);
  };

  const focusBorderClass = accentColor === 'green' ? 'border-green-500 ring-2 ring-green-100' : 'border-blue-500 ring-2 ring-blue-100';

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-gray-600 flex items-center gap-1"><Tag className="w-3 h-3" /> Product Tags</label>
      <div className="relative" ref={dropdownRef}>
        <button type="button" onClick={() => setIsOpen(!isOpen)}
          className={`w-full border rounded-lg px-3 py-2.5 sm:py-2 text-sm text-left flex items-center justify-between transition-all ${isOpen ? focusBorderClass : 'border-gray-200'}`}>
          <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
            {selectedTags.length === 0 ? (
              <span className="text-gray-400">Select tags...</span>
            ) : (
              selectedTags.map(tag => (
                <span key={tag} className={`inline-flex items-center gap-1 text-[11px] font-bold text-white px-2 py-0.5 rounded-md ${getTagColor(tag)}`}>
                  {tag}
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggleTag(tag); }} className="hover:bg-white/20 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
            <div className="p-1.5">
              {TAG_OPTIONS.map(option => {
                const isSelected = selectedTags.includes(option.value);
                return (
                  <button key={option.value} type="button" onClick={() => toggleTag(option.value)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 sm:py-2 rounded-lg text-sm transition-all ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                    <div className={`w-5 h-5 sm:w-4 sm:h-4 rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-[#e31e24] border-[#e31e24]' : 'border-gray-300'}`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`inline-block text-[11px] font-bold text-white px-2.5 py-0.5 rounded-md ${option.color}`}>{option.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedTags.length > 0 && (
              <div className="border-t border-gray-100 p-1.5">
                <button type="button" onClick={() => onChange([])} className="w-full text-xs text-gray-400 hover:text-red-500 py-2 sm:py-1.5 font-medium">Clear all</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Delete Confirmation Modal
const DeleteConfirmModal: React.FC<{
  productName: string; isDeleting: boolean; onConfirm: () => void; onCancel: () => void;
}> = ({ productName, isDeleting, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={isDeleting ? undefined : onCancel} />
    <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-6">
      <div className="flex justify-center mb-4">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 sm:w-7 sm:h-7 text-red-600" />
        </div>
      </div>
      <h3 className="text-base sm:text-lg font-bold text-[#1a2332] text-center mb-2">Delete Product</h3>
      <p className="text-xs sm:text-sm text-gray-500 text-center mb-1">Are you sure you want to permanently delete this product?</p>
      <div className="bg-red-50 border border-red-100 rounded-lg px-3 sm:px-4 py-3 mb-5 sm:mb-6 mt-3">
        <p className="text-sm font-semibold text-red-800 text-center truncate">{productName}</p>
        <p className="text-xs text-red-500 text-center mt-1">This action cannot be undone.</p>
      </div>
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
        <button onClick={onCancel} disabled={isDeleting}
          className="flex-1 px-4 py-3 sm:py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 text-center">
          Cancel
        </button>
        <button onClick={onConfirm} disabled={isDeleting}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-70">
          {isDeleting ? (
            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Deleting...</>
          ) : (
            <><Trash2 className="w-4 h-4" /> Delete Product</>
          )}
        </button>
      </div>
    </div>
  </div>
);

// Section Header for form organization
const FormSectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2 pt-3 pb-1 border-t border-gray-200 first:border-t-0 first:pt-0">
    {icon}
    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</span>
  </div>
);

const CMS_PRODUCTS_WHERE = 'Website → Products';

const CMSProductManager: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const { categories } = useCMS();
  const { notify } = useCMSNotification();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [overrides, setOverrides] = useState<Record<string, ProductOverride>>({});
  const [customProducts, setCustomProducts] = useState<Product[]>([]);
  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProductOverride> & {
    tags?: string[]; warranty?: string; weight?: string; partNumber?: string;
    otherNames?: string;
    voltage?: string; amperage?: string; phase?: string; power?: string;
    additionalImages?: string[];
    featuresText?: string; specsText?: string; documents?: ProductDocument[];
    stockCount?: string;
  }>({});


  const [showAddForm, setShowAddForm] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProduct>(emptyNewProduct);
  const [newProductTags, setNewProductTags] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<{ name: string } | null>(null);
  const [togglingVisibility, setTogglingVisibility] = useState<string | null>(null);

  // Handle toggling website visibility with immediate DB save
  const handleToggleVisibility = async (product: Product) => {
    const newVal = !(product.showOnWebsite !== false);
    setTogglingVisibility(product.id);
    // Optimistic update
    setCustomProducts(prev => prev.map(p => p.id === product.id ? { ...p, showOnWebsite: newVal } : p));
    const ok = await toggleProductWebsiteVisibility(product.id, newVal);
    if (!ok) {
      // Revert on failure
      setCustomProducts(prev => prev.map(p => p.id === product.id ? { ...p, showOnWebsite: !newVal } : p));
      notify({ variant: 'error', title: 'Could not update website visibility', subtitle: CMS_PRODUCTS_WHERE });
    } else {
      broadcastCMSUpdate();
      notify({
        variant: 'success',
        title: newVal ? 'Product will show on the website' : 'Product hidden from the website',
        subtitle: CMS_PRODUCTS_WHERE,
      });
    }
    setTogglingVisibility(null);
  };


  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) setSelectedCategory(categories[0].slug);
  }, [categories, selectedCategory]);

  const refreshFromDB = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [dbOverrides, dbCustom] = await Promise.all([fetchProductOverrides(), fetchCustomProducts()]);
      setOverrides(dbOverrides);
      setCustomProducts(dbCustom);
      localStorage.setItem('voltz-cms-products', JSON.stringify(dbOverrides));
      localStorage.setItem('voltz-cms-products-custom', JSON.stringify(dbCustom));
      console.log(`[CMS] Refreshed from DB: ${dbCustom.length} products, ${Object.keys(dbOverrides).length} overrides`);
    } catch (err) {
      console.error('Failed to refresh CMS data from DB:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFromDB(true);
  }, [refreshFromDB]);

  // Real-time cross-device sync: listen for CMS updates from other devices/tabs
  // and refresh product data (without showing loading spinner) so all CMS users
  // see stock count changes, visibility toggles, etc. immediately.
  useEffect(() => {
    const unsubscribe = onCMSUpdate(() => {
      // Only refresh if NOT currently editing (to avoid disrupting in-progress edits)
      if (!editingProduct) {
        console.log('[CMS ProductManager] Received cross-device update — refreshing');
        refreshFromDB(false);
      }
    });
    return () => unsubscribe();
  }, [refreshFromDB, editingProduct]);


  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of customProducts) {
      counts[p.categorySlug] = (counts[p.categorySlug] || 0) + 1;
    }
    return counts;
  }, [customProducts]);

  const categoryCustomProducts = customProducts.filter(p => p.categorySlug === selectedCategory);
  const displayProducts = categoryCustomProducts.map(p => {
    const override = overrides[p.id];
    if (override) {
      return { ...p, name: override.name ?? p.name, price: override.price ?? p.price, originalPrice: override.originalPrice ?? p.originalPrice,
        image: override.image ?? p.image, description: override.description ?? p.description, brand: override.brand ?? p.brand,
        inStock: override.inStock ?? p.inStock, isFeatured: override.isFeatured ?? p.isFeatured,
        badge: override.badge !== undefined ? override.badge : p.badge, badgeColor: override.badgeColor !== undefined ? override.badgeColor : p.badgeColor };
    }
    return p;
  });

  const filteredProducts = displayProducts.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.otherNames || '').toLowerCase().includes(searchQuery.toLowerCase())
  );


  const handleSaveOverrides = useCallback(async () => {
    if (hasDuplicatePartNumbersInList(customProducts)) {
      notify({
        variant: 'error',
        title: 'Duplicate part numbers',
        subtitle: `${CMS_PRODUCTS_WHERE} — each part # must be unique. Fix duplicates before saving.`,
      });
      return;
    }
    setSaveStatus('saving');
    try {
      const processedOverrides = { ...overrides };
      for (const [key, override] of Object.entries(processedOverrides)) {
        if (override.image?.startsWith('data:')) {
          try {
            const response = await fetch(override.image); const blob = await response.blob();
            const url = await uploadCompressedImage(blob, `product-${key}.jpg`);
            if (url) processedOverrides[key] = { ...override, image: url };
          } catch (e) { console.warn('Failed to upload image for override', key, e); }
        }
      }
      const processedCustom = await Promise.all(customProducts.map(async (p) => {
        const updatedProduct = { ...p };
        // Upload main image
        if (p.image?.startsWith('data:')) {
          try {
            const response = await fetch(p.image); const blob = await response.blob();
            const url = await uploadCompressedImage(blob, `product-${p.id}.jpg`);
            if (url) updatedProduct.image = url;
          } catch (e) { console.warn('Failed to upload image for custom product', p.id, e); }
        }
        // Upload additional images
        if (updatedProduct.additionalImages && updatedProduct.additionalImages.length > 0) {
          const uploadedAdditional: string[] = [];
          for (let i = 0; i < updatedProduct.additionalImages.length; i++) {
            const img = updatedProduct.additionalImages[i];
            if (img.startsWith('data:')) {
              try {
                const response = await fetch(img); const blob = await response.blob();
                const url = await uploadCompressedImage(blob, `product-${p.id}-additional-${i}.jpg`);
                uploadedAdditional.push(url || img);
              } catch (e) {
                console.warn('Failed to upload additional image', i, e);
                uploadedAdditional.push(img);
              }
            } else {
              uploadedAdditional.push(img);
            }
          }
          updatedProduct.additionalImages = uploadedAdditional;
        }
        return updatedProduct;
      }));
      const [overrideSuccess, customSuccess] = await Promise.all([saveAllOverrides(processedOverrides), saveAllCustomProducts(processedCustom)]);
      if (overrideSuccess && customSuccess) {
        await refreshFromDB();
        broadcastCMSUpdate();
        setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000);
        notify({ variant: 'success', title: 'All product changes saved', subtitle: CMS_PRODUCTS_WHERE });
      } else {
        notify({ variant: 'error', title: 'Some changes may not have saved', subtitle: CMS_PRODUCTS_WHERE });
        setSaveStatus('idle');
      }
    } catch (err) {
      console.error('Save failed:', err);
      notify({ variant: 'error', title: 'Failed to save product changes', subtitle: CMS_PRODUCTS_WHERE });
      setSaveStatus('idle');
    }
  }, [overrides, customProducts, refreshFromDB, notify]);

  const parseBadgeTags = (badge?: string): string[] => {
    if (!badge) return [];
    return badge.split(',').map(t => t.trim()).filter(Boolean);
  };
  const tagsToProductFields = (tags: string[]): { badge: string; badgeColor: string } => {
    if (tags.length === 0) return { badge: '', badgeColor: '' };
    return { badge: tags.join(', '), badgeColor: getTagColor(tags[0]) };
  };
  const parseFeaturesText = (text: string): string[] => text.split('\n').map(l => l.trim()).filter(Boolean);
  const parseSpecsText = (text: string): Record<string, string> => {
    const specs: Record<string, string> = {};
    text.split('\n').forEach(line => { const idx = line.indexOf(':'); if (idx > 0) { specs[line.slice(0, idx).trim()] = line.slice(idx + 1).trim(); } });
    return specs;
  };

  const startEdit = (product: Product) => {
    setEditingProduct(product.id);
    const override = overrides[product.id] || {};
    const currentBadge = override.badge !== undefined ? override.badge : product.badge;
    const featuresArr = Array.isArray(product.features) ? product.features : [];
    const specsObj = (product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs)) ? product.specs : {};
    const docsArr = Array.isArray(product.documents) ? product.documents : [];
    setEditForm({
      name: override.name ?? product.name, price: override.price ?? product.price,
      originalPrice: override.originalPrice ?? product.originalPrice, image: override.image ?? product.image ?? '',
      description: override.description ?? product.description, brand: override.brand ?? product.brand,
      inStock: override.inStock ?? product.inStock, isFeatured: override.isFeatured ?? product.isFeatured ?? false,
      tags: parseBadgeTags(currentBadge), warranty: product.warranty || '', weight: product.weight || '',
      partNumber: product.partNumber || '',
      otherNames: product.otherNames || '',
      stockCount: (product.stockCount ?? 0) === 0 ? '' : String(product.stockCount ?? 0),
      voltage: product.voltage || '', amperage: product.amperage || '',
      phase: product.phase || '', power: product.power || '',
      additionalImages: Array.isArray(product.additionalImages) ? [...product.additionalImages] : [],
      featuresText: featuresArr.join('\n'),
      specsText: Object.entries(specsObj).map(([k, v]) => `${k}: ${v}`).join('\n'), documents: [...docsArr],
    });
  };


  const saveEdit = () => {
    if (!editingProduct) return;
    const { tags, warranty, weight, partNumber, otherNames, voltage, amperage, phase, power, additionalImages, featuresText, specsText, documents, stockCount: stockCountStr, ...rest } = editForm;
    const dup = findDuplicatePartNumberProduct(customProducts, partNumber ?? '', editingProduct);
    if (dup) {
      notify({
        variant: 'error',
        title: 'Part number already in use',
        subtitle: `${CMS_PRODUCTS_WHERE} — "${(partNumber ?? '').trim()}" matches "${dup.name}". Use a unique part #.`,
      });
      return;
    }
    const tagFields = tagsToProductFields(tags || []);
    const parsedFeatures = parseFeaturesText(featuresText || '');
    const parsedSpecs = parseSpecsText(specsText || '');
    const stockVal = parseInt(stockCountStr || '0') || 0;
    setCustomProducts(prev => prev.map(p => {
      if (p.id === editingProduct) {
        return { ...p, name: rest.name ?? p.name, price: rest.price ?? p.price, originalPrice: rest.originalPrice ?? p.originalPrice,
          image: rest.image ?? p.image, description: rest.description ?? p.description, brand: rest.brand ?? p.brand,
          inStock: stockVal > 0, isFeatured: rest.isFeatured ?? p.isFeatured,
          stockCount: stockVal,
          badge: tagFields.badge, badgeColor: tagFields.badgeColor, warranty: warranty ?? p.warranty,
          weight: weight ?? p.weight, partNumber: partNumber ?? p.partNumber,
          otherNames: otherNames ?? p.otherNames,
          voltage: voltage ?? p.voltage, amperage: amperage ?? p.amperage,
          phase: phase ?? p.phase, power: power ?? p.power,
          additionalImages: additionalImages ?? p.additionalImages,
          features: parsedFeatures, specs: parsedSpecs, documents: documents ?? p.documents };
      }
      return p;
    }));
    setEditingProduct(null); setEditForm({});
  };



  const cancelEdit = () => { setEditingProduct(null); setEditForm({}); };

  const promptDeleteProduct = (product: Product) => { setDeleteConfirm({ id: product.id, name: product.name }); };

  const confirmDeleteProduct = async () => {
    if (!deleteConfirm) return;
    const productId = deleteConfirm.id; const productName = deleteConfirm.name;
    setIsDeleting(true);
    try {
      const backupCustomProducts = [...customProducts];
      const backupOverrides = { ...overrides };
      setCustomProducts(prev => prev.filter(p => p.id !== productId));
      setOverrides(prev => { const copy = { ...prev }; delete copy[productId]; return copy; });

      const deleteOk = await dbDeleteCustomProduct(productId);
      await dbDeleteProductOverride(productId);

      if (!deleteOk) {
        console.error('[CMS] Delete failed in DB, rolling back local state');
        setCustomProducts(backupCustomProducts);
        setOverrides(backupOverrides);
        notify({ variant: 'error', title: 'Could not delete product from the database', subtitle: CMS_PRODUCTS_WHERE });
        setDeleteConfirm(null);
        setIsDeleting(false);
        return;
      }

      await refreshFromDB();
      await broadcastCMSUpdate();

      setDeleteConfirm(null);
      notify({
        variant: 'success',
        title: 'Product deleted',
        subtitle: `"${productName}" · ${CMS_PRODUCTS_WHERE}`,
      });
      if (editingProduct === productId) { setEditingProduct(null); setEditForm({}); }
      if (expandedProduct === productId) setExpandedProduct(null);
    } catch (err) {
      console.error('Failed to delete:', err);
      notify({ variant: 'error', title: 'Failed to delete product', subtitle: CMS_PRODUCTS_WHERE });
    }
    finally { setIsDeleting(false); }
  };


  const cancelDelete = () => { if (!isDeleting) setDeleteConfirm(null); };

  const uploadDocumentFile = async (file: File): Promise<{ url: string; type: string; size: string } | null> => {
    try {
      const ext = file.name.split('.').pop() || 'pdf';
      const url = await uploadProductDocument(file);
      if (!url) return null;
      const sizeStr = file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(0)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      return { url, type: ext.toUpperCase(), size: sizeStr };
    } catch (err) { console.error('Document upload failed:', err); return null; }
  };

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'edit' | 'add') => {
    const file = e.target.files?.[0]; if (!file) return;
    const result = await uploadDocumentFile(file);
    if (result) {
      const newDoc: ProductDocument = { name: file.name.replace(/\.[^.]+$/, ''), url: result.url, type: result.type, size: result.size };
      if (target === 'edit') setEditForm(f => ({ ...f, documents: [...(f.documents || []), newDoc] }));
      else setNewProduct(p => ({ ...p, documents: [...p.documents, newDoc] }));
      notify({ variant: 'success', title: 'Document uploaded', subtitle: CMS_PRODUCTS_WHERE });
    } else {
      notify({ variant: 'error', title: 'Could not upload document', subtitle: CMS_PRODUCTS_WHERE });
    }
    e.target.value = '';
  };

  const addNewProduct = () => {
    if (!newProduct.name || !newProduct.brand || !newProduct.price) return;
    const partNumInput = newProduct.partNumber.trim();
    if (partNumInput) {
      const dup = findDuplicatePartNumberProduct(customProducts, partNumInput);
      if (dup) {
        notify({
          variant: 'error',
          title: 'Part number already in use',
          subtitle: `${CMS_PRODUCTS_WHERE} — "${partNumInput}" matches "${dup.name}". Use a unique part #.`,
        });
        return;
      }
    }
    const catSlug = newProduct.categorySlug || selectedCategory;
    const catData = categories.find(c => c.slug === catSlug);
    const id = `custom-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const tagFields = tagsToProductFields(newProductTags);
    const stockVal = parseInt(newProduct.stockCount) || 0;
    const product: Product = {
      id, name: newProduct.name, otherNames: newProduct.otherNames || '', category: catData?.name || catSlug, categorySlug: catSlug,
      brand: newProduct.brand, price: parseFloat(newProduct.price) || 0,
      originalPrice: parseFloat(newProduct.originalPrice) || parseFloat(newProduct.price) || 0,
      rating: 4.5, reviews: 0, inStock: stockVal > 0, stockCount: stockVal, isFeatured: newProduct.isFeatured,
      badge: tagFields.badge, badgeColor: tagFields.badgeColor, image: newProduct.image || undefined,
      additionalImages: newProduct.additionalImages.filter(Boolean),
      description: newProduct.description || `${newProduct.name} from ${newProduct.brand}`,
      specs: parseSpecsText(newProduct.specsText || ''), features: parseFeaturesText(newProduct.featuresText || ''),
      partNumber: newProduct.partNumber || `CUSTOM-${Date.now()}`, warranty: newProduct.warranty || '',
      weight: newProduct.weight || '', dimensions: 'N/A', documents: newProduct.documents,
      voltage: newProduct.voltage || '', amperage: newProduct.amperage || '',
      phase: newProduct.phase || '', power: newProduct.power || '',
    };


    setCustomProducts(prev => [...prev, product]);
    setNewProduct({ ...emptyNewProduct, categorySlug: selectedCategory }); setNewProductTags([]); setShowAddForm(false);
  };

  const featuredCount = customProducts.filter(p => p.isFeatured).length;

  const selectedCategoryName = categories.find(c => c.slug === selectedCategory)?.name || selectedCategory;

  // Shared toggle component
  const ToggleRow: React.FC<{ icon: React.ReactNode; title: string; desc: string; active: boolean; onToggle: () => void; bgClass: string; activeClass: string }> = ({ icon, title, desc, active, onToggle, bgClass, activeClass }) => (
    <div className={`flex items-start sm:items-center gap-3 sm:gap-4 ${bgClass} border rounded-xl p-3 sm:p-4`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 sm:mb-1">{icon}<span className="text-xs sm:text-sm font-bold text-[#1a2332]">{title}</span></div>
        <p className="text-[10px] sm:text-xs text-gray-500">{desc}</p>
      </div>
      <button type="button" onClick={onToggle}
        className={`relative w-12 h-7 rounded-full transition-all flex-shrink-0 ${active ? activeClass : 'bg-gray-300'}`}>
        <div className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow-md transition-all flex items-center justify-center ${active ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {deleteConfirm && <DeleteConfirmModal productName={deleteConfirm.name} isDeleting={isDeleting} onConfirm={confirmDeleteProduct} onCancel={cancelDelete} />}
      {barcodeProduct && <BarcodePrintModal productName={barcodeProduct.name} onClose={() => setBarcodeProduct(null)} />}

      {/* Category + Search */}
      <div className="flex flex-col gap-3 sm:gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
            <button
              type="button"
              onClick={() => (onBack ? onBack() : window.history.back())}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <label className="block text-xs sm:text-sm font-semibold text-gray-700">Category</label>
          </div>
          <div className="relative">
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl px-3 sm:px-4 py-3 sm:py-2.5 text-sm font-medium text-[#1a2332] appearance-none cursor-pointer focus:border-[#e31e24] outline-none">
              {categories.map(cat => (
                <option key={cat.id} value={cat.slug}>
                  {cat.name} ({categoryCounts[cat.slug] || 0} product{(categoryCounts[cat.slug] || 0) !== 1 ? 's' : ''})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
        </div>
        <div>
          <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2">Search Products</label>
          <div className="relative">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, brand, or part #..."
              className="w-full bg-white border border-gray-200 rounded-xl pl-10 sm:pl-11 pr-4 py-3 sm:py-2.5 text-sm outline-none focus:border-[#e31e24]" />
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="bg-gray-50 rounded-xl px-3 sm:px-5 py-3">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Package className="w-4 h-4 text-[#e31e24]" />
            <span className="font-semibold text-[#1a2332]">{categoryCustomProducts.length}</span>
            <span className="text-gray-500">in {selectedCategoryName}</span>
          </div>
          <div className="w-px h-4 bg-gray-300" />
          <div className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Package className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-[#1a2332]">{customProducts.length}</span>
            <span className="text-gray-500">total across all categories</span>
          </div>
          <div className="w-px h-4 bg-gray-300 hidden sm:block" />
          <div className="hidden sm:flex items-center gap-1.5 text-sm">
            <Award className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-[#1a2332]">{featuredCount}</span>
            <span className="text-gray-500">featured</span>
          </div>
        </div>
        {searchQuery && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Showing <strong className="text-[#1a2332]">{filteredProducts.length}</strong> of {categoryCustomProducts.length} matching "{searchQuery}"</span>
          </div>
        )}
        <div className="mt-3">
          <button
            onClick={() => { setShowAddForm(true); setNewProduct({ ...emptyNewProduct, categorySlug: selectedCategory }); }}
            className="flex items-center justify-center gap-2 bg-[#e31e24] text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold hover:bg-[#c91a1f] transition-colors w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>


      {/* Add Product Form */}
      {showAddForm && (
        <div className="bg-green-50 border border-green-200 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-[#1a2332] flex items-center gap-2 text-sm sm:text-base">
              <Plus className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" /> Add New Product
            </h3>
            <button onClick={() => setShowAddForm(false)} className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {/* Basic Information */}
            <FormSectionHeader icon={<Package className="w-3.5 h-3.5 text-gray-400" />} title="Basic Information" />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Product Name *</label>
              <input type="text" value={newProduct.name} onChange={(e) => setNewProduct(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. VFD-700 Series" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Other Names / Aliases</label>
              <input type="text" value={newProduct.otherNames} onChange={(e) => setNewProduct(p => ({ ...p, otherNames: e.target.value }))}
                placeholder="e.g. Variable Speed Drive, AC Drive, Inverter" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
              <p className="text-[10px] text-gray-400 mt-0.5">Comma-separated alternative names for this product</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category *</label>
              <select value={newProduct.categorySlug || selectedCategory} onChange={(e) => setNewProduct(p => ({ ...p, categorySlug: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500">
                {categories.map(cat => (<option key={cat.id} value={cat.slug}>{cat.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Brand *</label>
              <input type="text" value={newProduct.brand} onChange={(e) => setNewProduct(p => ({ ...p, brand: e.target.value }))}
                placeholder="e.g. Siemens" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Part Number</label>
              <input type="text" value={newProduct.partNumber} onChange={(e) => setNewProduct(p => ({ ...p, partNumber: e.target.value }))}
                placeholder="VFD-700-S" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
              <textarea value={newProduct.description} onChange={(e) => setNewProduct(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description..." rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500 resize-none" />
            </div>


            {/* Pricing */}
            <FormSectionHeader icon={<DollarSign className="w-3.5 h-3.5 text-gray-400" />} title="Pricing" />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Sale Price ($) *</label>
              <input type="number" value={newProduct.price} onChange={(e) => setNewProduct(p => ({ ...p, price: e.target.value }))}
                placeholder="349" className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500 ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Original Price ($)</label>
              <input type="number" value={newProduct.originalPrice} onChange={(e) => setNewProduct(p => ({ ...p, originalPrice: e.target.value }))}
                placeholder="0" className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500 ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Package className="w-3 h-3" /> Stock Count</label>
              <input type="number" min={0} value={newProduct.stockCount} onChange={(e) => setNewProduct(p => ({ ...p, stockCount: e.target.value }))}
                placeholder="0" className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500 ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`} />
              <p className="text-[10px] text-gray-400 mt-0.5">Set to 0 to show "Out of Stock" on website</p>
            </div>


            {/* Electrical Specifications */}
            <FormSectionHeader icon={<Zap className="w-3.5 h-3.5 text-gray-400" />} title="Electrical Specifications" />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> Voltage</label>
              <input type="text" value={newProduct.voltage} onChange={(e) => setNewProduct(p => ({ ...p, voltage: e.target.value }))}
                placeholder="e.g. 220V, 380V" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Gauge className="w-3 h-3" /> Amperage</label>
              <input type="text" value={newProduct.amperage} onChange={(e) => setNewProduct(p => ({ ...p, amperage: e.target.value }))}
                placeholder="e.g. 10A, 25A" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> Phase</label>
              <input type="text" value={newProduct.phase} onChange={(e) => setNewProduct(p => ({ ...p, phase: e.target.value }))}
                placeholder="e.g. Single Phase, 3-Phase" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> Power</label>
              <input type="text" value={newProduct.power} onChange={(e) => setNewProduct(p => ({ ...p, power: e.target.value }))}
                placeholder="e.g. 2.2 kW, 5 HP" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>

            {/* Physical Specifications */}
            <FormSectionHeader icon={<Shield className="w-3.5 h-3.5 text-gray-400" />} title="Physical & Warranty" />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Shield className="w-3 h-3" /> Warranty</label>
              <input type="text" value={newProduct.warranty} onChange={(e) => setNewProduct(p => ({ ...p, warranty: e.target.value }))}
                placeholder="e.g. 2 Years" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Weight className="w-3 h-3" /> Weight</label>
              <input type="text" value={newProduct.weight} onChange={(e) => setNewProduct(p => ({ ...p, weight: e.target.value }))}
                placeholder="e.g. 2.5 kg" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500" />
            </div>

            {/* Images */}
            <FormSectionHeader icon={<Image className="w-3.5 h-3.5 text-gray-400" />} title="Product Images" />
            <div className="sm:col-span-2 lg:col-span-3">
              <ImageUploadField id="add-product" value={newProduct.image} onChange={(url) => setNewProduct(p => ({ ...p, image: url }))} accentColor="green" label="Main Product Image" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <AdditionalImagesField
                images={newProduct.additionalImages}
                onChange={(imgs) => setNewProduct(p => ({ ...p, additionalImages: imgs }))}
                accentColor="green"
              />
            </div>

            {/* Visibility & Tags */}
            <FormSectionHeader icon={<Star className="w-3.5 h-3.5 text-gray-400" />} title="Visibility & Tags" />
            <div className="sm:col-span-2 lg:col-span-3">
              <ToggleRow icon={<Award className="w-4 h-4 text-amber-600" />} title="Best Sales (Top Picks)" desc="Feature on homepage." active={newProduct.isFeatured}
                onToggle={() => setNewProduct(p => ({ ...p, isFeatured: !p.isFeatured }))} bgClass="bg-amber-50 border-amber-200" activeClass="bg-amber-500" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <ToggleRow icon={<Flame className="w-4 h-4 text-red-500" />} title="Special Offer" desc="Show in Special Offers section." active={newProductTags.includes('Special Offer')}
                onToggle={() => setNewProductTags(t => t.includes('Special Offer') ? t.filter(x => x !== 'Special Offer') : [...t, 'Special Offer'])} bgClass="bg-red-50 border-red-200" activeClass="bg-red-500" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <TagSelector selectedTags={newProductTags} onChange={setNewProductTags} accentColor="green" />
            </div>

            {/* Technical Details */}
            <FormSectionHeader icon={<ListChecks className="w-3.5 h-3.5 text-gray-400" />} title="Technical Details" />
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><ListChecks className="w-3 h-3" /> Key Features <span className="text-gray-400 font-normal">(one per line)</span></label>
              <textarea value={newProduct.featuresText} onChange={(e) => setNewProduct(p => ({ ...p, featuresText: e.target.value }))}
                rows={3} placeholder="High efficiency motor control&#10;Built-in EMC filter"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500 resize-none font-mono" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Settings2 className="w-3 h-3" /> Technical Specs <span className="text-gray-400 font-normal">(Key: Value)</span></label>
              <textarea value={newProduct.specsText} onChange={(e) => setNewProduct(p => ({ ...p, specsText: e.target.value }))}
                rows={3} placeholder="Voltage: 230V&#10;Power Rating: 2.2 kW"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-green-500 resize-none font-mono" />
            </div>

            {/* Documents */}
            <FormSectionHeader icon={<FileText className="w-3.5 h-3.5 text-gray-400" />} title="Documents" />
            <div className="sm:col-span-2 lg:col-span-3">
              {newProduct.documents.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                    <FileText className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                    <input type="text" value={doc.name} placeholder="Name" onChange={(e) => {
                      const docs = [...newProduct.documents]; docs[idx] = { ...docs[idx], name: e.target.value }; setNewProduct(p => ({ ...p, documents: docs }));
                    }} className="flex-1 text-sm outline-none min-w-0" />
                  </div>
                  <button type="button" onClick={() => { const docs = [...newProduct.documents]; docs.splice(idx, 1); setNewProduct(p => ({ ...p, documents: docs })); }}
                    className="w-9 h-9 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                </div>
              ))}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-1">
                <label className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-800 font-semibold cursor-pointer py-1">
                  <Upload className="w-3.5 h-3.5" /> Upload from Device
                  <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.dwg,.dxf,.zip" className="hidden" onChange={(e) => handleDocFileUpload(e, 'add')} />
                </label>
                <span className="text-gray-300 hidden sm:inline">|</span>
                <button type="button" onClick={() => setNewProduct(p => ({ ...p, documents: [...p.documents, { name: '', url: '' }] }))}
                  className="flex items-center gap-1.5 text-xs text-green-600 hover:text-green-800 font-semibold py-1"><Link2 className="w-3.5 h-3.5" /> Add URL</button>
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 mt-4">
            <button onClick={() => { setShowAddForm(false); setNewProduct(emptyNewProduct); setNewProductTags([]); }}
              className="px-4 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 text-center">Cancel</button>
            <button onClick={addNewProduct} disabled={!newProduct.name || !newProduct.brand || !newProduct.price}
              className="flex items-center justify-center gap-2 bg-green-600 text-white px-5 py-2.5 sm:py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              <Plus className="w-4 h-4" /> Add Product
            </button>
          </div>
        </div>
      )}

      {/* Product List */}
      <div className="space-y-2 sm:space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <div className="w-10 h-10 border-3 border-gray-200 border-t-[#e31e24] rounded-full animate-spin mx-auto mb-3" />
            <p className="font-medium">Loading products...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No products found</p>
            <p className="text-sm mt-1">Add products using the button above</p>
          </div>
        ) : null}

        {filteredProducts.map((product) => {
          const productTags = parseBadgeTags(product.badge);
          return (
            <div key={product.id}

              className={`bg-white rounded-xl border transition-all ${
                editingProduct === product.id ? 'border-blue-300 shadow-lg shadow-blue-100'
                  : product.showOnWebsite === false ? 'border-orange-200 bg-orange-50/30'
                  : 'border-gray-100 hover:border-gray-200'
              }`}>
              {/* Product Row - Mobile optimized */}
              <div className="p-3 sm:p-4">
                {/* Mobile: stacked layout / Desktop: horizontal */}
                <div className="flex gap-3 sm:gap-4">
                  {/* Left icons column - hidden on mobile, shown on sm+ */}
                  <div className="hidden sm:flex flex-col gap-1 flex-shrink-0 pt-0.5">
                    {product.isFeatured && (
                      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center" title="Featured">
                        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                      </div>
                    )}
                    {productTags.includes('Special Offer') && (
                      <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center" title="Special Offer">
                        <Flame className="w-4 h-4 text-red-500 fill-red-500" />
                      </div>
                    )}
                  </div>
                  {/* Product image - larger on mobile for better visibility */}
                  <div className={`w-16 h-16 sm:w-14 sm:h-14 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden ${product.showOnWebsite === false ? 'opacity-50' : ''}`}>
                    {product.image ? (
                      <img src={resolveMediaUrl(product.image)} alt={product.name} className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <Package className="w-6 h-6 text-gray-300" />
                    )}
                  </div>
                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`flex-1 min-w-0 ${product.showOnWebsite === false ? 'opacity-60' : ''}`}>
                        {/* Full product name - no truncate on mobile */}
                        <h4 className="font-bold text-[#1a2332] text-sm leading-snug break-words">{product.name}</h4>
                        <div className="flex items-center gap-2 sm:gap-3 mt-0.5 flex-wrap">
                          <span className="text-[10px] sm:text-xs text-gray-500">{product.brand}</span>
                          <span className="text-[10px] sm:text-xs text-gray-300">|</span>
                          <span className={`text-[10px] sm:text-xs font-medium ${product.inStock ? 'text-green-600' : 'text-red-500'}`}>
                            {product.inStock ? 'In Stock' : 'Out of Stock'}
                          </span>
                          {product.showOnWebsite === false && (
                            <>
                              <span className="text-[10px] sm:text-xs text-gray-300">|</span>
                              <span className="text-[10px] sm:text-xs font-bold text-orange-600 flex items-center gap-0.5">
                                <EyeOff className="w-3 h-3" /> Hidden
                              </span>
                            </>
                          )}
                        </div>
                        {/* Tags + mobile-only featured/special icons inline */}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {/* Mobile-only: show featured/special icons inline with tags */}
                          {product.isFeatured && (
                            <span className="sm:hidden inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md">
                              <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> Featured
                            </span>
                          )}
                          {productTags.includes('Special Offer') && (
                            <span className="sm:hidden inline-flex items-center gap-0.5 text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-md">
                              <Flame className="w-3 h-3 fill-red-500 text-red-500" /> Offer
                            </span>
                          )}
                          {productTags.map(tag => (
                            <span key={tag} className={`text-[9px] sm:text-[10px] font-bold text-white px-1.5 sm:px-2 py-0.5 rounded-md ${getTagColor(tag)}`}>{tag}</span>
                          ))}
                        </div>
                      </div>
                      {/* Price - top right */}
                      <div className="text-right flex-shrink-0">
                        <div className="font-extrabold text-[#1a2332] text-sm sm:text-base">${fmtCurrency(product.price)}</div>
                        {product.originalPrice > product.price && (
                          <div className="text-[10px] sm:text-xs text-gray-400 line-through">${fmtCurrency(product.originalPrice)}</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock count + Action buttons - separate row on mobile for full width */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mt-2.5 sm:mt-2 gap-2 sm:gap-2 pl-0 sm:pl-11">
                  {/* Inline stock count editor */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] sm:text-xs font-semibold text-gray-500">Stock:</span>
                    <input
                      type="number"
                      min={0}
                      value={(product.stockCount ?? 0) === 0 ? '' : product.stockCount ?? 0}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const val = raw === '' ? 0 : parseInt(raw, 10) || 0;
                        setCustomProducts(prev => prev.map(p => p.id === product.id ? { ...p, stockCount: val, inStock: val > 0 } : p));
                      }}
                      onBlur={async (e) => {
                        const val = parseInt(e.target.value) || 0;
                        const ok = await updateProductStockCount(product.id, val);
                        if (ok) {
                          broadcastCMSUpdate();
                          notify({ variant: 'success', title: 'Stock count saved', subtitle: CMS_PRODUCTS_WHERE });
                        } else {
                          notify({ variant: 'error', title: 'Could not update stock count', subtitle: CMS_PRODUCTS_WHERE });
                        }
                      }}
                      placeholder="0"
                      className={`w-16 sm:w-14 text-center border rounded-lg px-1.5 py-1.5 sm:py-1 text-xs font-bold outline-none transition-colors ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS} ${
                        (product.stockCount ?? 0) === 0
                          ? 'border-red-200 bg-red-50 text-red-600 focus:border-red-400'
                          : (product.stockCount ?? 0) <= 5
                            ? 'border-amber-200 bg-amber-50 text-amber-700 focus:border-amber-400'
                            : 'border-gray-200 bg-white text-[#1a2332] focus:border-blue-400'
                      }`}
                    />
                    {(product.stockCount ?? 0) === 0 && (
                      <span className="text-[9px] sm:text-[10px] font-bold text-red-500">Empty</span>
                    )}
                    {(product.stockCount ?? 0) > 0 && (product.stockCount ?? 0) <= 5 && (
                      <span className="text-[9px] sm:text-[10px] font-bold text-amber-600">Low</span>
                    )}
                  </div>

                  {/* Action buttons - full width on mobile, right-aligned on desktop */}
                  <div className="flex items-center gap-1 sm:gap-0.5 justify-end flex-shrink-0">
                    {/* Show on Website toggle */}
                    <button
                      onClick={() => handleToggleVisibility(product)}
                      disabled={togglingVisibility === product.id}
                      className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all ${
                        togglingVisibility === product.id ? 'opacity-50 cursor-wait' :
                        product.showOnWebsite !== false
                          ? 'bg-green-50 text-green-600 hover:bg-green-100 border border-green-200'
                          : 'bg-orange-50 text-orange-500 hover:bg-orange-100 border border-orange-200'
                      }`}
                      title={product.showOnWebsite !== false ? 'Visible on website — click to hide' : 'Hidden from website — click to show'}
                    >
                      {togglingVisibility === product.id ? (
                        <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      ) : product.showOnWebsite !== false ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4" />
                      )}
                    </button>
                    {/* Print Barcode */}
                    <button
                      onClick={() => setBarcodeProduct({ name: product.name })}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-purple-50 flex items-center justify-center text-gray-400 hover:text-purple-600 border border-transparent hover:border-purple-200 transition-all"
                      title="Print Barcode Label"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                    {/* Expand/Collapse */}
                    <button onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600">
                      {expandedProduct === product.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {/* Edit */}
                    <button onClick={() => startEdit(product)}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-600" title="Edit">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {/* Delete */}
                    <button onClick={() => promptDeleteProduct(product)}
                      className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-600" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>




              {/* Expanded Details */}
              {expandedProduct === product.id && editingProduct !== product.id && (
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1 border-t border-gray-50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                    <div className="sm:col-span-2 lg:col-span-3"><span className="text-gray-400 text-xs font-semibold">Description</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.description || 'No description'}</p></div>
                    <div><span className="text-gray-400 text-xs font-semibold">Part #</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.partNumber || 'N/A'}</p></div>
                    <div><span className="text-gray-400 text-xs font-semibold">Brand</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.brand || 'N/A'}</p></div>
                    <div><span className="text-gray-400 text-xs font-semibold">Warranty</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.warranty || 'N/A'}</p></div>
                    <div><span className="text-gray-400 text-xs font-semibold">Weight</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.weight || 'N/A'}</p></div>
                    <div><span className="text-gray-400 text-xs font-semibold">Voltage</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.voltage || 'N/A'}</p></div>
                    <div><span className="text-gray-400 text-xs font-semibold">Amperage</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.amperage || 'N/A'}</p></div>
                    <div><span className="text-gray-400 text-xs font-semibold">Phase</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.phase || 'N/A'}</p></div>
                    <div><span className="text-gray-400 text-xs font-semibold">Power</span><p className="text-gray-600 mt-0.5 text-xs sm:text-sm">{product.power || 'N/A'}</p></div>
                  </div>
                  {product.additionalImages && product.additionalImages.length > 0 && (
                    <div className="mt-3">
                      <span className="text-gray-400 text-xs font-semibold">Additional Images ({product.additionalImages.length})</span>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {product.additionalImages.map((img, i) => (
                          <div key={i} className="w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-white">
                            <img src={resolveMediaUrl(img)} alt={`Additional ${i + 1}`} className="w-full h-full object-contain p-0.5" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {product.features && product.features.length > 0 && (
                    <div className="mt-3">
                      <span className="text-gray-400 text-xs font-semibold">Key Features</span>
                      <ul className="mt-1 space-y-0.5">
                        {product.features.map((f, i) => (
                          <li key={i} className="text-gray-600 text-xs flex items-start gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />{f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {product.specs && Object.keys(product.specs).length > 0 && (
                    <div className="mt-3">
                      <span className="text-gray-400 text-xs font-semibold">Specs</span>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                        {Object.entries(product.specs).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-1 text-xs">
                            <span className="text-gray-500 font-medium">{key}:</span>
                            <span className="text-gray-700">{val}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Edit Form */}
              {editingProduct === product.id && (
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 border-t border-blue-100 bg-blue-50/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {/* Basic Information */}
                    <FormSectionHeader icon={<Package className="w-3.5 h-3.5 text-gray-400" />} title="Basic Information" />
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Product Name</label>
                      <input type="text" value={editForm.name || ''} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Other Names / Aliases</label>
                      <input type="text" value={editForm.otherNames || ''} onChange={(e) => setEditForm(f => ({ ...f, otherNames: e.target.value }))}
                        placeholder="e.g. Variable Speed Drive, AC Drive, Inverter" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                      <p className="text-[10px] text-gray-400 mt-0.5">Comma-separated alternative names for this product</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Brand</label>
                      <input type="text" value={editForm.brand || ''} onChange={(e) => setEditForm(f => ({ ...f, brand: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Part Number</label>
                      <input type="text" value={editForm.partNumber || ''} onChange={(e) => setEditForm(f => ({ ...f, partNumber: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
                      <textarea value={editForm.description || ''} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                        rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500 resize-none" />
                    </div>

                    {/* Pricing */}
                    <FormSectionHeader icon={<DollarSign className="w-3.5 h-3.5 text-gray-400" />} title="Pricing" />
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Sale Price</label>
                      <input type="number" value={editForm.price == null || editForm.price === 0 ? '' : editForm.price} onChange={(e) => setEditForm(f => ({ ...f, price: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                        className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500 ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Original Price</label>
                      <input type="number" value={editForm.originalPrice == null || editForm.originalPrice === 0 ? '' : editForm.originalPrice} onChange={(e) => setEditForm(f => ({ ...f, originalPrice: e.target.value === '' ? 0 : parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                        className={`w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500 ${DECIMAL_INPUT_ZERO_PLACEHOLDER_CLASS}`} />
                    </div>



                    {/* Electrical Specifications */}
                    <FormSectionHeader icon={<Zap className="w-3.5 h-3.5 text-gray-400" />} title="Electrical Specifications" />
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> Voltage</label>
                      <input type="text" value={editForm.voltage || ''} onChange={(e) => setEditForm(f => ({ ...f, voltage: e.target.value }))}
                        placeholder="e.g. 220V, 380V" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Gauge className="w-3 h-3" /> Amperage</label>
                      <input type="text" value={editForm.amperage || ''} onChange={(e) => setEditForm(f => ({ ...f, amperage: e.target.value }))}
                        placeholder="e.g. 10A, 25A" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Activity className="w-3 h-3" /> Phase</label>
                      <input type="text" value={editForm.phase || ''} onChange={(e) => setEditForm(f => ({ ...f, phase: e.target.value }))}
                        placeholder="e.g. Single Phase, 3-Phase" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1"><Zap className="w-3 h-3" /> Power</label>
                      <input type="text" value={editForm.power || ''} onChange={(e) => setEditForm(f => ({ ...f, power: e.target.value }))}
                        placeholder="e.g. 2.2 kW, 5 HP" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>

                    {/* Physical & Warranty */}
                    <FormSectionHeader icon={<Shield className="w-3.5 h-3.5 text-gray-400" />} title="Physical & Warranty" />
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Warranty</label>
                      <input type="text" value={editForm.warranty || ''} onChange={(e) => setEditForm(f => ({ ...f, warranty: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Weight</label>
                      <input type="text" value={editForm.weight || ''} onChange={(e) => setEditForm(f => ({ ...f, weight: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500" />
                    </div>

                    {/* Images */}
                    <FormSectionHeader icon={<Image className="w-3.5 h-3.5 text-gray-400" />} title="Product Images" />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <ImageUploadField id={`edit-${product.id}`} value={editForm.image || ''} onChange={(url) => setEditForm(f => ({ ...f, image: url }))} accentColor="blue" label="Main Product Image" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <AdditionalImagesField
                        images={editForm.additionalImages || []}
                        onChange={(imgs) => setEditForm(f => ({ ...f, additionalImages: imgs }))}
                        accentColor="blue"
                      />
                    </div>

                    {/* Visibility & Tags */}
                    <FormSectionHeader icon={<Star className="w-3.5 h-3.5 text-gray-400" />} title="Visibility & Tags" />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <ToggleRow icon={<Award className="w-4 h-4 text-amber-600" />} title="Best Sales (Top Picks)" desc="Feature on homepage." active={!!editForm.isFeatured}
                        onToggle={() => setEditForm(f => ({ ...f, isFeatured: !f.isFeatured }))} bgClass="bg-amber-50 border-amber-200" activeClass="bg-amber-500" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <ToggleRow icon={<Flame className="w-4 h-4 text-red-500" />} title="Special Offer" desc="Show in Special Offers section." active={(editForm.tags || []).includes('Special Offer')}
                        onToggle={() => {
                          const tags = editForm.tags || [];
                          setEditForm(f => ({ ...f, tags: tags.includes('Special Offer') ? tags.filter(t => t !== 'Special Offer') : [...tags, 'Special Offer'] }));
                        }} bgClass="bg-red-50 border-red-200" activeClass="bg-red-500" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <TagSelector selectedTags={editForm.tags || []} onChange={(tags) => setEditForm(f => ({ ...f, tags }))} accentColor="blue" />
                    </div>

                    {/* Technical Details */}
                    <FormSectionHeader icon={<ListChecks className="w-3.5 h-3.5 text-gray-400" />} title="Technical Details" />
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Key Features (one per line)</label>
                      <textarea value={editForm.featuresText || ''} onChange={(e) => setEditForm(f => ({ ...f, featuresText: e.target.value }))}
                        rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500 resize-none font-mono" />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Technical Specs (Key: Value)</label>
                      <textarea value={editForm.specsText || ''} onChange={(e) => setEditForm(f => ({ ...f, specsText: e.target.value }))}
                        rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 sm:py-2 text-sm outline-none focus:border-blue-500 resize-none font-mono" />
                    </div>

                    {/* Documents */}
                    <FormSectionHeader icon={<FileText className="w-3.5 h-3.5 text-gray-400" />} title="Documents" />
                    <div className="sm:col-span-2 lg:col-span-3">
                      {(editForm.documents || []).map((doc: ProductDocument, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 mb-2">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                            <FileText className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            <input type="text" value={doc.name} placeholder="Name" onChange={(e) => {
                              const docs = [...(editForm.documents || [])]; docs[idx] = { ...docs[idx], name: e.target.value }; setEditForm(f => ({ ...f, documents: docs }));
                            }} className="flex-1 text-sm outline-none min-w-0" />
                          </div>
                          <button type="button" onClick={() => { const docs = [...(editForm.documents || [])]; docs.splice(idx, 1); setEditForm(f => ({ ...f, documents: docs })); }}
                            className="w-9 h-9 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                        </div>
                      ))}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mt-1">
                        <label className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer py-1">
                          <Upload className="w-3.5 h-3.5" /> Upload
                          <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.dwg,.dxf,.zip" className="hidden" onChange={(e) => handleDocFileUpload(e, 'edit')} />
                        </label>
                        <span className="text-gray-300 hidden sm:inline">|</span>
                        <button type="button" onClick={() => setEditForm(f => ({ ...f, documents: [...(f.documents || []), { name: '', url: '' }] }))}
                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold py-1"><Link2 className="w-3.5 h-3.5" /> Add URL</button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 mt-4">
                    <button onClick={cancelEdit} className="px-4 py-2.5 sm:py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 text-center">Cancel</button>
                    <button onClick={saveEdit} className="flex items-center justify-center gap-2 bg-blue-600 text-white px-5 py-2.5 sm:py-2 rounded-lg text-sm font-semibold hover:bg-blue-700">
                      <Check className="w-4 h-4" /> Apply Changes
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky Save Bar */}
      <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 -mx-3 sm:-mx-5 lg:-mx-8 -mb-3 sm:-mb-5 lg:-mb-8 px-3 sm:px-5 lg:px-8 py-3 sm:py-4 mt-6 sm:mt-8">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <p className="text-[10px] sm:text-xs text-gray-400 flex items-center gap-1.5">
            <Cloud className="w-3.5 h-3.5 flex-shrink-0" /> Click "Save All Changes" to publish.
          </p>
          <button onClick={handleSaveOverrides}
            className={`flex items-center justify-center gap-2 px-5 sm:px-6 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition-all w-full sm:w-auto ${
              saveStatus === 'saved' ? 'bg-green-600 text-white'
                : saveStatus === 'saving' ? 'bg-gray-400 text-white cursor-wait'
                : 'bg-[#e31e24] text-white hover:bg-[#c91a1f] shadow-md shadow-red-200'
            }`}
            disabled={saveStatus === 'saving'}>
            {saveStatus === 'saved' ? (<><Check className="w-4 h-4" />Saved!</>)
              : saveStatus === 'saving' ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</>)
              : (<><Save className="w-4 h-4" />Save All Changes</>)}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CMSProductManager;
