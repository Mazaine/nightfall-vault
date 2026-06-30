export type HealthResponse = { status: string; service: string };

export type Category = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
};

export type Product = {
  id: number;
  category_id: number;
  name: string;
  slug: string;
  subcategory_name: string | null;
  subcategory_slug: string | null;
  short_description: string | null;
  image_url: string | null;
  normal_price_huf: number;
  shipping_unit_type: ShippingUnitType;
  shipping_unit_value: number | null;
  shipping_class: string | null;
  manage_stock: boolean;
  stock_quantity: number;
  stock_status: StockStatus;
  is_featured: boolean;
  badge_label: string | null;
  variants: ProductVariant[];
};

export type ProductVariant = {
  id: number;
  product_id: number;
  name: string;
  slug: string;
  stock_quantity: number;
  normal_price_huf: number | null;
  image_url: string | null;
  is_active: boolean;
};

export type ProductAdmin = Product & { is_active: boolean };

export type ProductCreatePayload = {
  category_id: number;
  name: string;
  slug: string;
  subcategory_name: string | null;
  subcategory_slug: string | null;
  short_description: string | null;
  image_url: string | null;
  normal_price_huf: number;
  shipping_unit_type: ShippingUnitType;
  shipping_unit_value: number | null;
  shipping_class: string | null;
  manage_stock: boolean;
  stock_quantity: number;
  stock_status: StockStatus;
  is_active: boolean;
  is_featured: boolean;
  badge_label: string | null;
};

export type ProductUpdatePayload = Partial<ProductCreatePayload>;
export type StockStatus = "in_stock" | "out_of_stock";
export type ShippingUnitType = "SINGLE_ITEM" | "SMALL" | "MEDIUM" | "LARGE" | "CUSTOM";

export type ShippingMethod = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  price: number;
  min_booster_equivalent: number | null;
  max_booster_equivalent: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ShippingMethodPayload = {
  name: string;
  code: string;
  description: string | null;
  price: number;
  min_booster_equivalent: number | null;
  max_booster_equivalent: number | null;
  is_active: boolean;
  sort_order: number;
};

export type AvailableShippingMethodsResponse = { total_booster_equivalent: number; methods: ShippingMethod[] };
export type Carrier = "foxpost" | "mpl";

export type PickupPoint = {
  id: number;
  carrier: Carrier;
  external_id: string;
  name: string;
  zip: string | null;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  opening_hours: unknown | null;
  comment: string | null;
};

export type CartItem = { product: Product; variant: ProductVariant | null; quantity: number; unitPriceHuf: number };
export type AddToCartHandler = (product: Product, quantity?: number, variant?: ProductVariant | null) => void;

export type UserRole = "user" | "admin";
export type User = {
  id: number;
  email: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
  updated_at: string;
};

export type UserAdminUpdatePayload = { role?: UserRole; is_active?: boolean; is_email_verified?: boolean };

export type AdminStats = {
  total_orders: number;
  today_orders: number;
  week_orders: number;
  pending_orders: number;
  completed_revenue: number;
  total_users: number;
  new_users: number;
  total_products: number;
  low_stock_products: number;
};

export type ForgotPasswordRequest = { email: string; captcha_token?: string | null };
export type ResetPasswordRequest = { token: string; new_password: string };
export type MessageResponse = { message: string };
export type LoginRequest = { email: string; password: string; captcha_token?: string | null };

export type RegisterRequest = {
  email: string;
  username: string;
  full_name: string;
  password: string;
  confirm_password: string;
  accepted_terms: boolean;
  accepted_privacy: boolean;
  subscribed_newsletter: boolean;
  captcha_token?: string | null;
};

export type UserProfileUpdateRequest = { email: string; username: string; full_name: string };
export type PasswordChangeRequest = { current_password: string; new_password: string; confirm_password: string };
export type AuthResponse = { access_token: string; token_type: "bearer"; user: User };
export type FieldErrors = Record<string, string>;

export type OrderStatus = "pending_payment" | "processing" | "completed" | "cancelled";
export type Order = {
  id: number;
  order_number: string;
  user_id: number | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  status: OrderStatus;
  total_amount: number;
  shipping_method: string;
  shipping_price: number;
  pickup_point_snapshot: Record<string, unknown> | null;
  shipping_address_snapshot: Record<string, unknown> | null;
  payment_method: string;
  payment_status: "pending" | "paid" | "failed" | "refunded";
  source: string;
  stock_released_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OrderItem = { id: number; order_id: number; product_id: number | null; product_name: string; quantity: number; unit_price: number; total_price: number };
export type OrderDetail = Order & { items: OrderItem[] };
export type OrderCreateItem = { product_id: number; variant_id: number | null; quantity: number };

export type OrderCreatePayload = {
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  shipping_method: string | null;
  pickup_point_id: number | null;
  shipping_zip?: string | null;
  shipping_city?: string | null;
  shipping_address?: string | null;
  payment_method: string;
  captcha_token?: string | null;
  turnstile_token?: string | null;
  items: OrderCreateItem[];
};

export type StockMovementType = "order_created" | "order_cancelled" | "admin_adjustment" | "import" | "correction";
export type StockMovement = { id: number; product_id: number; order_id: number | null; quantity_change: number; movement_type: StockMovementType; note: string | null; created_by_admin_id: number | null; created_at: string };
export type StockAdjustmentPayload = { quantity_change: number; note: string | null };

export type NewsletterCampaignStatus = "draft" | "test_sent" | "ready" | "sent";
export type NewsletterSubscriberSource = "registration" | "manual" | "checkout" | "import";
export type NewsletterCampaign = { id: number; title: string; subject: string; content_html: string; content_text: string | null; status: NewsletterCampaignStatus; created_by_admin_id: number | null; test_email: string | null; sent_at: string | null; created_at: string; updated_at: string };
export type NewsletterCampaignPayload = { title: string; subject: string; content_html: string; content_text: string | null; status: NewsletterCampaignStatus };
export type NewsletterSubscriber = { id: number; email: string; full_name: string | null; user_id: number | null; is_active: boolean; source: NewsletterSubscriberSource; created_at: string; unsubscribed_at: string | null };
export type NewsletterSubscriberPayload = { email: string; full_name: string | null; user_id?: number | null; is_active: boolean; source: NewsletterSubscriberSource; captcha_token?: string | null };
export type NewsletterBulkSendResponse = { message: string; sent_count: number; failed_count: number };
export type NewsletterSubscribeRequest = { email: string; full_name?: string | null; captcha_token?: string | null };
export type NewsletterMe = { is_active: boolean; email: string; full_name: string | null };

