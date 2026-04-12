import { apiGet, apiPost, apiPatch, apiDelete, apiUploadFile, ensureArray } from '@/lib/api';
import { Product } from '@/data/products';

export interface ProductOverride {
  id: string;
  name?: string;
  price?: number;
  originalPrice?: number;
  image?: string;
  description?: string;
  brand?: string;
  inStock?: boolean;
  isFeatured?: boolean;
  badge?: string;
  badgeColor?: string;
}

export interface CMSCategoryRow {
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

export async function uploadProductImage(file: File): Promise<string | null> {
  try {
    const { url } = await apiUploadFile('/api/upload/product-image', file, 'file');
    return url || null;
  } catch (err) {
    console.error('Upload failed:', err);
    return null;
  }
}

export async function uploadCompressedImage(blob: Blob, originalName: string): Promise<string | null> {
  try {
    const { url } = await apiUploadFile('/api/upload/product-image', blob, 'file', originalName);
    return url || null;
  } catch (err) {
    console.error('Upload failed:', err);
    return null;
  }
}

/** Product datasheet / PDF etc. */
export async function uploadProductDocument(file: File): Promise<string | null> {
  try {
    const { url } = await apiUploadFile('/api/upload/product-document', file, 'document');
    return url || null;
  } catch (err) {
    console.error('Document upload failed:', err);
    return null;
  }
}

export function compressImageToBlob(file: File): Promise<Blob> {
  return Promise.resolve(file as Blob);
}

export async function fetchProductOverrides(): Promise<Record<string, ProductOverride>> {
  try {
    const data = await apiGet<unknown>('/api/cms/overrides');
    const overrides: Record<string, ProductOverride> = {};
    for (const row of ensureArray<any>(data)) {
      overrides[row.product_id] = {
        id: row.product_id,
        name: row.name ?? undefined,
        price: row.price != null ? Number(row.price) : undefined,
        originalPrice: row.original_price != null ? Number(row.original_price) : undefined,
        image: row.image ?? undefined,
        description: row.description ?? undefined,
        brand: row.brand ?? undefined,
        inStock: row.in_stock != null ? Boolean(row.in_stock) : undefined,
        isFeatured: row.is_featured != null ? Boolean(row.is_featured) : undefined,
        badge: row.badge ?? undefined,
        badgeColor: row.badge_color ?? undefined,
      };
    }
    return overrides;
  } catch {
    return {};
  }
}

export async function saveProductOverride(override: ProductOverride): Promise<boolean> {
  try {
    await apiPost('/api/cms/overrides', {
      id: override.id,
      product_id: override.id,
      name: override.name ?? null,
      price: override.price ?? null,
      original_price: override.originalPrice ?? null,
      image: override.image ?? null,
      description: override.description ?? null,
      brand: override.brand ?? null,
      in_stock: override.inStock ?? null,
      is_featured: override.isFeatured ?? null,
      badge: override.badge ?? null,
      badge_color: override.badgeColor ?? null,
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteProductOverride(productId: string): Promise<boolean> {
  try {
    await apiDelete(`/api/cms/overrides/${encodeURIComponent(productId)}`);
    return true;
  } catch {
    return false;
  }
}

function parseJsonbArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(v => String(v));
  if (typeof val === 'string' && val.length > 0) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map((v: unknown) => String(v));
    } catch { /* ignore */ }
  }
  return [];
}

function parseJsonbObject(val: unknown): Record<string, string> {
  if (val && typeof val === 'object' && !Array.isArray(val)) return val as Record<string, string>;
  if (typeof val === 'string' && val.length > 0) {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return {};
}

function parseJsonbDocuments(val: unknown): Array<{ name: string; url: string; type?: string; size?: string }> {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.length > 0) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
  }
  return [];
}

function toJsonbString(val: unknown): string {
  try {
    return JSON.stringify(val ?? null);
  } catch {
    return '[]';
  }
}

export async function fetchCustomProducts(): Promise<Product[]> {
  try {
    const data = await apiGet<unknown>('/api/cms/custom-products');
    return ensureArray<any>(data).map((row) => ({
      id: row.id,
      name: row.name,
      otherNames: row.other_names || '',
      category: row.category,
      categorySlug: row.category_slug,
      brand: row.brand,
      price: Number(row.price),
      originalPrice: Number(row.original_price),
      rating: Number(row.rating),
      reviews: row.reviews,
      inStock: Boolean(row.in_stock),
      isFeatured: Boolean(row.is_featured),
      showOnWebsite: row.show_on_website !== 0 && row.show_on_website !== false,
      stockCount: row.stock_count != null ? Number(row.stock_count) : 0,
      badge: row.badge || '',
      badgeColor: row.badge_color || '',
      image: row.image || undefined,
      additionalImages: parseJsonbArray(row.additional_images),
      description: row.description || '',
      specs: parseJsonbObject(row.specs),
      features: parseJsonbArray(row.features),
      partNumber: row.part_number || '',
      warranty: row.warranty || '',
      weight: row.weight || '',
      dimensions: row.dimensions || '',
      voltage: row.voltage || '',
      amperage: row.amperage || '',
      phase: row.phase || '',
      power: row.power || '',
      documents: parseJsonbDocuments(row.documents),
    }));
  } catch {
    return [];
  }
}

export async function saveCustomProduct(product: Product): Promise<boolean> {
  try {
    const cleanFeatures = Array.isArray(product.features)
      ? product.features.map(f => String(f)).filter(Boolean)
      : [];
    const cleanSpecs = (product.specs && typeof product.specs === 'object' && !Array.isArray(product.specs))
      ? product.specs : {};
    const cleanDocs = Array.isArray(product.documents) ? product.documents : [];
    const cleanAdditionalImages = Array.isArray(product.additionalImages) ? product.additionalImages.filter(Boolean) : [];

    await apiPost('/api/cms/custom-products', {
      id: product.id,
      name: product.name,
      other_names: product.otherNames || '',
      category: product.category,
      category_slug: product.categorySlug,
      brand: product.brand,
      price: product.price,
      original_price: product.originalPrice,
      rating: product.rating,
      reviews: product.reviews,
      in_stock: product.inStock,
      is_featured: product.isFeatured ?? false,
      show_on_website: product.showOnWebsite !== false,
      stock_count: product.stockCount ?? 0,
      badge: product.badge || '',
      badge_color: product.badgeColor || '',
      image: product.image || null,
      additional_images: toJsonbString(cleanAdditionalImages),
      description: product.description,
      specs: toJsonbString(cleanSpecs),
      features: toJsonbString(cleanFeatures),
      part_number: product.partNumber,
      warranty: product.warranty,
      weight: product.weight,
      dimensions: product.dimensions,
      voltage: product.voltage || '',
      amperage: product.amperage || '',
      phase: product.phase || '',
      power: product.power || '',
      documents: toJsonbString(cleanDocs),
    });
    return true;
  } catch {
    return false;
  }
}

export async function toggleProductWebsiteVisibility(productId: string, showOnWebsite: boolean): Promise<boolean> {
  try {
    await apiPatch(`/api/cms/custom-products/${encodeURIComponent(productId)}/visibility`, { showOnWebsite });
    console.log(`[cmsData] Product ${productId} visibility set to ${showOnWebsite}`);
    return true;
  } catch (err) {
    console.error('toggleProductWebsiteVisibility exception:', err);
    return false;
  }
}

export async function updateProductStockCount(productId: string, stockCount: number): Promise<boolean> {
  try {
    await apiPatch(`/api/cms/custom-products/${encodeURIComponent(productId)}/stock`, { stockCount });
    console.log(`[cmsData] Product ${productId} stock count set to ${stockCount}`);
    return true;
  } catch (err) {
    console.error('updateProductStockCount exception:', err);
    return false;
  }
}

export async function deleteCustomProduct(productId: string): Promise<boolean> {
  try {
    await apiDelete(`/api/cms/custom-products/${encodeURIComponent(productId)}`);
    return true;
  } catch (err) {
    console.error('deleteCustomProduct exception:', err);
    return false;
  }
}

export async function fetchProductCountsByCategory(): Promise<Record<string, number>> {
  try {
    const data = await apiGet<unknown>('/api/cms/custom-products');
    const counts: Record<string, number> = {};
    for (const row of ensureArray<{ category_slug: string }>(data)) {
      const slug = row.category_slug;
      if (slug) counts[slug] = (counts[slug] || 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}

export async function fetchCategories(): Promise<CMSCategoryRow[]> {
  try {
    const [catResult, productCounts] = await Promise.all([
      apiGet<unknown>('/api/cms/categories'),
      fetchProductCountsByCategory(),
    ]);

    return ensureArray<any>(catResult).map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description || '',
      color: row.color || '#e31e24',
      icon: row.icon || 'Package',
      productCount: productCounts[row.slug] || 0,
      visible: row.visible !== 0 && row.visible !== false,
      isCustom: Boolean(row.is_custom),
    }));
  } catch {
    return [];
  }
}

export async function saveCategory(cat: CMSCategoryRow): Promise<boolean> {
  try {
    await apiPost('/api/cms/categories', {
      id: cat.id,
      slug: cat.slug,
      name: cat.name,
      description: cat.description,
      color: cat.color,
      icon: cat.icon,
      visible: cat.visible,
      is_custom: cat.isCustom || false,
    });
    return true;
  } catch {
    return false;
  }
}

export async function deleteCategory(catId: string): Promise<{ success: boolean; deletedProducts?: number; error?: string }> {
  try {
    const res = await apiDelete<{ success: boolean; deletedProducts?: number; error?: string }>(
      `/api/cms/categories/${encodeURIComponent(catId)}`
    );
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('deleteCategory exception:', msg);
    return { success: false, error: msg };
  }
}

export async function cleanupOrphanedProducts(): Promise<number> {
  try {
    const { deleted_orphans } = await apiPost<{ deleted_orphans: number }>('/api/cms/cleanup-orphans', {});
    const count = deleted_orphans || 0;
    if (count > 0) {
      console.log(`[cmsData] Cleaned up ${count} orphaned product(s)`);
    }
    return count;
  } catch {
    return 0;
  }
}

export async function fetchConfig(key: string): Promise<any | null> {
  try {
    return await apiGet(`/api/cms/config/${encodeURIComponent(key)}`);
  } catch (err) {
    console.error(`[cmsData] fetchConfig error for "${key}":`, err);
    return null;
  }
}

export async function saveConfig(key: string, value: any): Promise<boolean> {
  try {
    const jsonValue = JSON.parse(JSON.stringify(value));
    console.log(`[cmsData] saveConfig: key="${key}"`);
    await apiPost('/api/cms/config', { key, value: jsonValue });
    console.log(`[cmsData] saveConfig: successfully saved "${key}"`);
    return true;
  } catch (err) {
    console.error(`[cmsData] saveConfig exception for "${key}":`, err);
    return false;
  }
}

export async function saveConfigDetailed(key: string, value: any): Promise<{ ok: boolean; errorMessage?: string }> {
  try {
    const jsonValue = JSON.parse(JSON.stringify(value));
    console.log(`[cmsData] saveConfigDetailed: key="${key}"`);
    await apiPost('/api/cms/config', { key, value: jsonValue });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, errorMessage: `Save failed for "${key}": ${msg}` };
  }
}

export async function verifySave(key: string): Promise<any | null> {
  try {
    await new Promise(resolve => setTimeout(resolve, 200));
    const val = await fetchConfig(key);
    console.log(`[cmsData] verifySave: "${key}" read back`);
    return val;
  } catch (err) {
    console.error(`[cmsData] verifySave exception for "${key}":`, err);
    return null;
  }
}

export async function fetchFeaturedProducts(): Promise<Product[]> {
  const [overrides, customProducts] = await Promise.all([
    fetchProductOverrides(),
    fetchCustomProducts(),
  ]);

  const featured: Product[] = [];

  for (const product of customProducts) {
    if (product.showOnWebsite === false) continue;
    const override = overrides[product.id];
    const isFeatured = override?.isFeatured ?? product.isFeatured;
    if (isFeatured) {
      featured.push({
        ...product,
        ...(override ? {
          name: override.name ?? product.name,
          price: override.price ?? product.price,
          originalPrice: override.originalPrice ?? product.originalPrice,
          image: override.image ?? product.image,
          description: override.description ?? product.description,
          brand: override.brand ?? product.brand,
          inStock: override.inStock ?? product.inStock,
          badge: override.badge !== undefined ? override.badge : product.badge,
          badgeColor: override.badgeColor !== undefined ? override.badgeColor : product.badgeColor,
        } : {}),
        isFeatured: true,
      });
    }
  }
  return featured;
}

function hasSpecialOfferTag(badge?: string): boolean {
  if (!badge) return false;
  return badge.split(',').map(t => t.trim()).some(t => t === 'Special Offer');
}

export async function fetchSpecialOfferProducts(): Promise<Product[]> {
  const [overrides, customProducts] = await Promise.all([
    fetchProductOverrides(),
    fetchCustomProducts(),
  ]);

  const specialOffers: Product[] = [];

  for (const product of customProducts) {
    if (product.showOnWebsite === false) continue;
    const override = overrides[product.id];
    const effectiveBadge = override?.badge !== undefined ? override.badge : product.badge;
    if (hasSpecialOfferTag(effectiveBadge)) {
      specialOffers.push({
        ...product,
        ...(override ? {
          name: override.name ?? product.name,
          price: override.price ?? product.price,
          originalPrice: override.originalPrice ?? product.originalPrice,
          image: override.image ?? product.image,
          description: override.description ?? product.description,
          brand: override.brand ?? product.brand,
          inStock: override.inStock ?? product.inStock,
          badge: effectiveBadge,
          badgeColor: override.badgeColor !== undefined ? override.badgeColor : product.badgeColor,
        } : {}),
      });
    }
  }

  return specialOffers;
}

export async function fetchCategoryProducts(categorySlug: string): Promise<Product[]> {
  const [overrides, customProducts] = await Promise.all([
    fetchProductOverrides(),
    fetchCustomProducts(),
  ]);

  const categoryCustom = customProducts.filter(p => p.categorySlug === categorySlug && p.showOnWebsite !== false);

  const applyOverride = (p: Product): Product => {
    const override = overrides[p.id];
    if (!override) return p;
    return {
      ...p,
      name: override.name ?? p.name,
      price: override.price ?? p.price,
      originalPrice: override.originalPrice ?? p.originalPrice,
      image: override.image ?? p.image,
      description: override.description ?? p.description,
      brand: override.brand ?? p.brand,
      inStock: override.inStock ?? p.inStock,
      isFeatured: override.isFeatured ?? p.isFeatured,
      badge: override.badge !== undefined ? override.badge : p.badge,
      badgeColor: override.badgeColor !== undefined ? override.badgeColor : p.badgeColor,
    };
  };

  return categoryCustom.map(applyOverride);
}

export async function saveAllOverrides(overrides: Record<string, ProductOverride>): Promise<boolean> {
  try {
    const entries = Object.values(overrides);
    await apiPost('/api/cms/overrides/batch', { overrides: entries });
    return true;
  } catch {
    return false;
  }
}

export async function saveAllCustomProducts(products: Product[]): Promise<boolean> {
  try {
    await apiPost('/api/cms/custom-products/batch', { products });
    return true;
  } catch (err) {
    console.error('saveAllCustomProducts exception:', err);
    return false;
  }
}
