export interface ProductDocument {
  name: string;
  url: string;
  type?: string;
  size?: string;
}

export interface Product {
  id: string;
  name: string;
  otherNames?: string;
  category: string;
  categorySlug: string;
  brand: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviews: number;
  inStock: boolean;
  stockCount?: number;
  badge?: string;
  badgeColor?: string;
  isFeatured?: boolean;
  showOnWebsite?: boolean;
  image?: string;
  additionalImages?: string[];
  description: string;
  specs: Record<string, string>;
  features: string[];
  partNumber: string;
  warranty: string;
  weight: string;
  dimensions: string;
  voltage?: string;
  amperage?: string;
  phase?: string;
  power?: string;
  documents?: ProductDocument[];
}


