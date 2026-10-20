import { apiRequest } from "./client";

export type CartItemState = "available" | "quantity_changed" | "sold_out" | "listing_removed";
export type CartItem = {
  id: number; auction_id: number; title: string; seller_id: number; seller_name: string;
  listing_format: "single" | "bundle"; variant: string | null; quantity: number; max_quantity: number;
  unit_price: string; current_price: string; subtotal: string; price_changed: boolean; state: CartItemState;
  reservation_expires_at: string | null; image_url: string | null; external_card_id: string | null;
  bundle_items: Array<{ card_name: string; quantity: number; external_card_id: string; image_url: string | null }>;
};
export type Cart = { items: CartItem[]; item_count: number; total: string; server_time: string };
export type CheckoutResult = { checkout_batch_id: number; transaction_count: number; seller_count: number; item_count: number; total: string; transactions: Array<{ id: number; seller_id: number; auction_id: number; item_count: number }> };

export const CART_CHANGED_EVENT = "nightfall-cart-changed";
export function announceCartChanged(count?: number) { window.dispatchEvent(new CustomEvent(CART_CHANGED_EVENT, { detail: count })); }
export function getCart() { return apiRequest<Cart>("/api/cart"); }
export function addCartItem(auctionId: number, quantity = 1) { return apiRequest<Cart>("/api/cart/items", { method: "POST", body: JSON.stringify({ auction_id: auctionId, quantity }) }); }
export function updateCartItem(itemId: number, quantity: number, acceptPrice = false) { return apiRequest<Cart>(`/api/cart/items/${itemId}`, { method: "PATCH", body: JSON.stringify({ quantity, accept_price: acceptPrice }) }); }
export function removeCartItem(itemId: number) { return apiRequest<Cart>(`/api/cart/items/${itemId}`, { method: "DELETE" }); }
export function renewCartItem(itemId: number) { return apiRequest<Cart>(`/api/cart/items/${itemId}/reserve`, { method: "POST" }); }
export function checkoutCart(idempotencyKey: string, itemIds?: number[]) { return apiRequest<CheckoutResult>("/api/cart/checkout", { method: "POST", body: JSON.stringify({ idempotency_key: idempotencyKey, item_ids: itemIds }) }); }
