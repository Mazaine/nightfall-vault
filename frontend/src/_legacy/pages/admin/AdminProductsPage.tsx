import { FormEvent, useEffect, useState } from "react";
import { createAdminProduct, deactivateAdminProduct, getAdminProducts, updateAdminProduct } from "../../api/admin";
import { getActiveCategories } from "../../api/categories";
import { AdminLayout } from "../../components/AdminLayout";
import { Badge, Button, EmptyState, PageHeader } from "../../components/ui";
import { useI18n } from "../../i18n";
import type { Category, ProductAdmin, ProductCreatePayload, ShippingUnitType, StockStatus } from "../../types";
import { formatHuf } from "../../utils/format";
import "./AdminProductsPage.css";

type AdminProductsPageProps = { cartCount: number };
type ProductForm = { category_id: number; name: string; slug: string; short_description: string; image_url: string; normal_price_huf: string; stock_quantity: string; stock_status: StockStatus; shipping_unit_type: ShippingUnitType; is_active: boolean; is_featured: boolean; badge_label: string };
const emptyForm: ProductForm = { category_id: 0, name: "", slug: "", short_description: "", image_url: "", normal_price_huf: "0", stock_quantity: "0", stock_status: "in_stock", shipping_unit_type: "CUSTOM", is_active: true, is_featured: false, badge_label: "" };
function toPayload(form: ProductForm): ProductCreatePayload { return { category_id: form.category_id, name: form.name, slug: form.slug, subcategory_name: null, subcategory_slug: null, short_description: form.short_description || null, image_url: form.image_url || null, normal_price_huf: Number(form.normal_price_huf), shipping_unit_type: form.shipping_unit_type, shipping_unit_value: null, shipping_class: null, manage_stock: true, stock_quantity: Number(form.stock_quantity), stock_status: form.stock_status, is_active: form.is_active, is_featured: form.is_featured, badge_label: form.badge_label || null }; }
function fromProduct(product: ProductAdmin): ProductForm { return { category_id: product.category_id, name: product.name, slug: product.slug, short_description: product.short_description ?? "", image_url: product.image_url ?? "", normal_price_huf: String(product.normal_price_huf), stock_quantity: String(product.stock_quantity), stock_status: product.stock_status, shipping_unit_type: product.shipping_unit_type, is_active: product.is_active, is_featured: product.is_featured, badge_label: product.badge_label ?? "" }; }

export function AdminProductsPage({ cartCount }: AdminProductsPageProps) {
  const { t } = useI18n();
  const [products, setProducts] = useState<ProductAdmin[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  function refresh() { getAdminProducts().then(setProducts); getActiveCategories().then((items) => { setCategories(items); setForm((current) => ({ ...current, category_id: current.category_id || items[0]?.id || 0 })); }); }
  useEffect(refresh, []);
  function update<K extends keyof ProductForm>(key: K, value: ProductForm[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (editingId) { await updateAdminProduct(editingId, toPayload(form)); setMessage(t("common.update")); } else { await createAdminProduct(toPayload(form)); setMessage(t("common.create")); } setEditingId(null); setForm({ ...emptyForm, category_id: categories[0]?.id ?? 0 }); refresh(); }
  function edit(product: ProductAdmin) { setEditingId(product.id); setForm(fromProduct(product)); }
  async function deactivate(product: ProductAdmin) { await deactivateAdminProduct(product.id); refresh(); }

  return (
    <AdminLayout cartCount={cartCount}>
      <section className="admin-products-page">
        <PageHeader eyebrow="Admin" title={t("admin.products")} lead={t("admin.manageProducts")} />
        {message ? <div className="admin-success">{message}</div> : null}
        <form className="admin-product-form" onSubmit={save}>
          <select value={form.category_id} onChange={(e) => update("category_id", Number(e.target.value))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder={t("common.name")} required />
          <input value={form.slug} onChange={(e) => update("slug", e.target.value)} placeholder="slug" required />
          <input value={form.normal_price_huf} onChange={(e) => update("normal_price_huf", e.target.value)} placeholder={t("common.price")} type="number" />
          <input value={form.stock_quantity} onChange={(e) => update("stock_quantity", e.target.value)} placeholder={t("products.stock")} type="number" />
          <textarea value={form.short_description} onChange={(e) => update("short_description", e.target.value)} placeholder={t("products.productDetails")} />
          <input value={form.image_url} onChange={(e) => update("image_url", e.target.value)} placeholder="Image URL" />
          <input value={form.badge_label} onChange={(e) => update("badge_label", e.target.value)} placeholder="Badge" />
          <label><input type="checkbox" checked={form.is_featured} onChange={(e) => update("is_featured", e.target.checked)} /> {t("products.featured")}</label>
          <label><input type="checkbox" checked={form.is_active} onChange={(e) => update("is_active", e.target.checked)} /> {t("admin.active")}</label>
          <Button type="submit">{editingId ? t("common.update") : t("common.create")}</Button>
        </form>
        {products.length === 0 ? <EmptyState title={t("products.noProducts")} /> : null}
        <div className="admin-products-list">{products.map((product) => <article className="admin-product-row" key={product.id}><div><strong>{product.name}</strong><span>{product.slug}</span></div><Badge tone={product.is_active ? "gold" : "muted"}>{product.is_active ? t("admin.active") : t("admin.inactive")}</Badge><span>{formatHuf(product.normal_price_huf)}</span><span>{product.stock_quantity} {t("common.pcs")}</span><button type="button" onClick={() => edit(product)}>{t("common.edit")}</button><button type="button" onClick={() => deactivate(product)}>{t("admin.deactivate")}</button></article>)}</div>
      </section>
    </AdminLayout>
  );
}
