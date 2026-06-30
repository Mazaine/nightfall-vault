import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { SiteFooter } from "./components/SiteFooter";
import { AccountPage } from "./pages/AccountPage";
import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminNewslettersPage } from "./pages/admin/AdminNewslettersPage";
import { AdminOrderDetailPage } from "./pages/admin/AdminOrderDetailPage";
import { AdminOrdersPage } from "./pages/admin/AdminOrdersPage";
import { AdminProductsPage } from "./pages/admin/AdminProductsPage";
import { AdminShippingPage } from "./pages/admin/AdminShippingPage";
import { AdminUsersPage } from "./pages/admin/AdminUsersPage";
import { AuthPage } from "./pages/AuthPage";
import { CartPage } from "./pages/CartPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { CheckoutShippingPreviewPage } from "./pages/CheckoutShippingPreviewPage";
import { CheckoutSuccessPage } from "./pages/CheckoutSuccessPage";
import { CategoryPage } from "./pages/products/CategoryPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { HomePage } from "./pages/HomePage";
import { CookiesPage } from "./pages/legal/CookiesPage";
import { ImpressumPage } from "./pages/legal/ImpressumPage";
import { PaymentInfoPage } from "./pages/legal/PaymentInfoPage";
import { PrivacyPage } from "./pages/legal/PrivacyPage";
import { ShippingInfoPage } from "./pages/legal/ShippingInfoPage";
import { TermsPage } from "./pages/legal/TermsPage";
import { MyOrdersPage } from "./pages/MyOrdersPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProductPage } from "./pages/products/ProductPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { SearchPage } from "./pages/products/SearchPage";
import type { CartItem, Product, ProductVariant } from "./types";
import { getAvailableCartQuantity, getVariantCheckoutPrice, loadStoredCart, saveStoredCart } from "./utils/cart";

function App() {
  const [cartItems, setCartItems] = useState<CartItem[]>(() => loadStoredCart());
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    setCartItems((currentItems) => currentItems.map((item) => ({ ...item, unitPriceHuf: getVariantCheckoutPrice(item.product, item.variant) })));
  }, []);

  useEffect(() => {
    saveStoredCart(cartItems);
  }, [cartItems]);

  function addToCart(product: Product, quantity = 1, variant?: ProductVariant | null) {
    const availableQuantity = getAvailableCartQuantity(product, variant);
    if (availableQuantity <= 0) {
      return;
    }
    const safeQuantity = Math.min(Math.max(quantity, 1), availableQuantity);
    setCartItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.product.id === product.id && (item.variant?.id ?? null) === (variant?.id ?? null));
      if (existingItem) {
        return currentItems.map((item) =>
          item.product.id === product.id && (item.variant?.id ?? null) === (variant?.id ?? null)
            ? { ...item, quantity: Math.min(item.quantity + safeQuantity, availableQuantity) }
            : item,
        );
      }
      return [...currentItems, { product, variant: variant ?? null, quantity: safeQuantity, unitPriceHuf: getVariantCheckoutPrice(product, variant) }];
    });
  }

  function increaseQuantity(productId: number, variantId?: number | null) {
    setCartItems((currentItems) =>
      currentItems.map((item) =>
        item.product.id === productId && (item.variant?.id ?? null) === (variantId ?? null)
          ? { ...item, quantity: Math.min(item.quantity + 1, getAvailableCartQuantity(item.product, item.variant)) }
          : item,
      ),
    );
  }

  function decreaseQuantity(productId: number, variantId?: number | null) {
    setCartItems((currentItems) =>
      currentItems
        .map((item) => (item.product.id === productId && (item.variant?.id ?? null) === (variantId ?? null) ? { ...item, quantity: item.quantity - 1 } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  function removeItem(productId: number, variantId?: number | null) {
    setCartItems((currentItems) => currentItems.filter((item) => item.product.id !== productId || (item.variant?.id ?? null) !== (variantId ?? null)));
  }

  function clearCart() {
    setCartItems([]);
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage cartCount={cartCount} onAddToCart={addToCart} />} />
        <Route path="/impressum" element={<ImpressumPage cartCount={cartCount} />} />
        <Route path="/privacy" element={<PrivacyPage cartCount={cartCount} />} />
        <Route path="/terms" element={<TermsPage cartCount={cartCount} />} />
        <Route path="/cookies" element={<CookiesPage cartCount={cartCount} />} />
        <Route path="/shipping-info" element={<ShippingInfoPage cartCount={cartCount} />} />
        <Route path="/payment-info" element={<PaymentInfoPage cartCount={cartCount} />} />
        <Route path="/auth" element={<AuthPage cartCount={cartCount} />} />
        <Route path="/auth/verify-email" element={<AuthPage cartCount={cartCount} />} />
        <Route path="/login" element={<AuthPage cartCount={cartCount} />} />
        <Route path="/register" element={<AuthPage cartCount={cartCount} />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage cartCount={cartCount} />} />
        <Route path="/reset-password" element={<ResetPasswordPage cartCount={cartCount} />} />
        <Route path="/search" element={<SearchPage cartCount={cartCount} onAddToCart={addToCart} />} />
        <Route path="/products" element={<CategoryPage cartCount={cartCount} onAddToCart={addToCart} />} />
        <Route path="/categories" element={<CategoriesPage cartCount={cartCount} />} />
        <Route path="/account" element={<ProtectedRoute><AccountPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/my-orders" element={<ProtectedRoute><MyOrdersPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/my-orders/:id" element={<ProtectedRoute><MyOrdersPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboardPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/admin/products" element={<ProtectedRoute requireAdmin><AdminProductsPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/admin/shipping" element={<ProtectedRoute requireAdmin><AdminShippingPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsersPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/admin/orders" element={<ProtectedRoute requireAdmin><AdminOrdersPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/admin/orders/:id" element={<ProtectedRoute requireAdmin><AdminOrderDetailPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/admin/newsletters" element={<ProtectedRoute requireAdmin><AdminNewslettersPage cartCount={cartCount} /></ProtectedRoute>} />
        <Route path="/products/:slug" element={<ProductPage cartCount={cartCount} onAddToCart={addToCart} />} />
        <Route path="/product/:slug" element={<ProductPage cartCount={cartCount} onAddToCart={addToCart} />} />
        <Route path="/category/:categorySlug" element={<CategoryPage cartCount={cartCount} onAddToCart={addToCart} />} />
        <Route path="/category/:categorySlug/:subcategorySlug" element={<CategoryPage cartCount={cartCount} onAddToCart={addToCart} />} />
        <Route path="/cart" element={<CartPage items={cartItems} onClear={clearCart} onDecrease={decreaseQuantity} onIncrease={increaseQuantity} onRemove={removeItem} />} />
        <Route path="/checkout" element={<CheckoutPage items={cartItems} onClear={clearCart} />} />
        <Route path="/checkout/shipping-preview" element={<CheckoutShippingPreviewPage cartCount={cartCount} />} />
        <Route path="/checkout/success" element={<CheckoutSuccessPage cartCount={cartCount} />} />
        <Route path="*" element={<NotFoundPage cartCount={cartCount} />} />
      </Routes>
      <SiteFooter />
    </>
  );
}

export default App;


