import type { CartItem, Product, ProductVariant } from "../types";

const CART_STORAGE_KEY = "webshop-template.cart.v1";

export function getCheckoutPrice(product: Product) {
  return product.normal_price_huf;
}

export function getVariantCheckoutPrice(product: Product, variant: ProductVariant | null | undefined) {
  if (!variant) {
    return getCheckoutPrice(product);
  }
  return variant.normal_price_huf ?? getCheckoutPrice(product);
}

export function isProductSoldOut(product: Product, variant?: ProductVariant | null) {
  if (product.stock_status === "out_of_stock") {
    return true;
  }
  if (variant) {
    return variant.stock_quantity <= 0;
  }
  return product.manage_stock && product.stock_quantity <= 0;
}

export function getAvailableCartQuantity(product: Product, variant?: ProductVariant | null) {
  if (isProductSoldOut(product, variant)) {
    return 0;
  }
  if (variant) {
    return variant.stock_quantity;
  }
  return product.manage_stock ? product.stock_quantity : 99;
}

function isStoredCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<CartItem>;
  return Boolean(item.product) && typeof item.quantity === "number" && item.quantity > 0 && typeof item.unitPriceHuf === "number";
}

export function loadStoredCart(): CartItem[] {
  try {
    const storedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!storedCart) {
      return [];
    }
    const parsedCart: unknown = JSON.parse(storedCart);
    return Array.isArray(parsedCart) ? parsedCart.filter(isStoredCartItem) : [];
  } catch {
    return [];
  }
}

export function saveStoredCart(cartItems: CartItem[]) {
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
}
