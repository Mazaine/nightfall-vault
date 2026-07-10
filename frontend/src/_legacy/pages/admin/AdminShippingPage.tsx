import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createAdminShippingMethod,
  deleteAdminShippingMethod,
  getAdminShippingMethods,
  updateAdminShippingMethod,
} from "../../api/admin";
import { AdminLayout } from "../../components/AdminLayout";
import type { ShippingMethod, ShippingMethodPayload } from "../../types";
import { formatHuf } from "../../utils/format";
import "./AdminShippingPage.css";

type AdminShippingPageProps = {
  cartCount: number;
};

type ShippingFormState = {
  name: string;
  code: string;
  description: string;
  price: string;
  minBoosterEquivalent: string;
  maxBoosterEquivalent: string;
  sortOrder: string;
  isActive: boolean;
};

const emptyShippingForm: ShippingFormState = {
  name: "",
  code: "",
  description: "",
  price: "0",
  minBoosterEquivalent: "",
  maxBoosterEquivalent: "",
  sortOrder: "100",
  isActive: true,
};

function mapMethodToForm(method: ShippingMethod): ShippingFormState {
  return {
    name: method.name,
    code: method.code,
    description: method.description ?? "",
    price: String(method.price),
    minBoosterEquivalent:
      method.min_booster_equivalent === null ? "" : String(method.min_booster_equivalent),
    maxBoosterEquivalent:
      method.max_booster_equivalent === null ? "" : String(method.max_booster_equivalent),
    sortOrder: String(method.sort_order),
    isActive: method.is_active,
  };
}

function buildPayload(form: ShippingFormState): ShippingMethodPayload {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    description: form.description.trim() || null,
    price: Number(form.price || 0),
    min_booster_equivalent: form.minBoosterEquivalent ?
      Number(form.minBoosterEquivalent)
    : null,
    max_booster_equivalent: form.maxBoosterEquivalent ?
      Number(form.maxBoosterEquivalent)
    : null,
    is_active: form.isActive,
    sort_order: Number(form.sortOrder || 0),
  };
}

export function AdminShippingPage({ cartCount }: AdminShippingPageProps) {
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [form, setForm] = useState<ShippingFormState>(emptyShippingForm);
  const [editingMethodId, setEditingMethodId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const activeMethodCount = useMemo(
    () => methods.filter((method) => method.is_active).length,
    [methods],
  );

  function updateForm(fieldName: keyof ShippingFormState, value: string | boolean) {
    setForm((currentForm) => ({ ...currentForm, [fieldName]: value }));
  }

  function loadMethods() {
    getAdminShippingMethods()
      .then((response) => {
        setMethods(response);
        setError(null);
      })
      .catch(() => setError("A szállítási módok betöltése nem sikerült."));
  }

  useEffect(() => {
    loadMethods();
  }, []);

  function resetForm() {
    setForm(emptyShippingForm);
    setEditingMethodId(null);
    setError(null);
  }

  function startEdit(method: ShippingMethod) {
    setForm(mapMethodToForm(method));
    setEditingMethodId(method.id);
    setError(null);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.name.trim() || !form.code.trim()) {
      setError("A név és a kód kötelező.");
      return;
    }

    const payload = buildPayload(form);

    if (payload.price < 0) {
      setError("Az ár nem lehet negatív.");
      return;
    }

    if (
      payload.min_booster_equivalent !== null &&
      payload.max_booster_equivalent !== null &&
      payload.min_booster_equivalent > payload.max_booster_equivalent
    ) {
      setError("A minimum booster határ nem lehet nagyobb, mint a maximum.");
      return;
    }

    setIsSaving(true);
    try {
      if (editingMethodId === null) {
        const createdMethod = await createAdminShippingMethod(payload);
        setMethods((currentMethods) => [...currentMethods, createdMethod]);
      } else {
        const updatedMethod = await updateAdminShippingMethod(editingMethodId, payload);
        setMethods((currentMethods) =>
          currentMethods.map((method) => (method.id === updatedMethod.id ? updatedMethod : method)),
        );
      }
      resetForm();
    } catch {
      setError("A szállítási mód mentése nem sikerült.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(method: ShippingMethod) {
    const updatedMethod = await updateAdminShippingMethod(method.id, {
      is_active: !method.is_active,
    });
    setMethods((currentMethods) =>
      currentMethods.map((item) => (item.id === updatedMethod.id ? updatedMethod : item)),
    );
  }

  async function handleDeactivate(method: ShippingMethod) {
    const updatedMethod = await deleteAdminShippingMethod(method.id);
    setMethods((currentMethods) =>
      currentMethods.map((item) => (item.id === updatedMethod.id ? updatedMethod : item)),
    );
  }

  return (
    <AdminLayout cartCount={cartCount}>
      <section className="admin-shipping-page">
        <div className="admin-hero">
          <p className="eyebrow">Admin</p>
          <h1>Szállítási módok</h1>
          <p className="lead">
            Booster-egyenérték alapján számolt szállítási szabályok. A checkout később ezekből
            kapja majd a választható opciókat.
          </p>
        </div>

        <div className="admin-shipping-stats">
          <span>Összes mód: {methods.length}</span>
          <span>Aktív mód: {activeMethodCount}</span>
        </div>

        <form className="admin-shipping-form" onSubmit={handleSave}>
          <h2>{editingMethodId === null ? "Új szállítási mód" : "Szállítási mód szerkesztése"}</h2>
          <input
            value={form.name}
            onChange={(event) => updateForm("name", event.target.value)}
            placeholder="Név"
            required
          />
          <input
            value={form.code}
            onChange={(event) => updateForm("code", event.target.value)}
            placeholder="Kód"
            required
          />
          <input
            min="0"
            type="number"
            value={form.price}
            onChange={(event) => updateForm("price", event.target.value)}
            placeholder="Ár"
          />
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.minBoosterEquivalent}
            onChange={(event) => updateForm("minBoosterEquivalent", event.target.value)}
            placeholder="Minimum booster"
          />
          <input
            min="0"
            step="0.01"
            type="number"
            value={form.maxBoosterEquivalent}
            onChange={(event) => updateForm("maxBoosterEquivalent", event.target.value)}
            placeholder="Maximum booster"
          />
          <input
            type="number"
            value={form.sortOrder}
            onChange={(event) => updateForm("sortOrder", event.target.value)}
            placeholder="Sorrend"
          />
          <label className="admin-inline-check">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => updateForm("isActive", event.target.checked)}
            />
            Aktív
          </label>
          <textarea
            className="wide-field"
            value={form.description}
            onChange={(event) => updateForm("description", event.target.value)}
            placeholder="Leírás"
          />
          {error ? <div className="admin-error">{error}</div> : null}
          <div className="admin-form-actions">
            <button className="primary-action" type="submit" disabled={isSaving}>
              {isSaving ? "Mentés..." : editingMethodId === null ? "Létrehozás" : "Módosítás mentése"}
            </button>
            {editingMethodId !== null ? (
              <button className="secondary-action" type="button" onClick={resetForm}>
                Mégse
              </button>
            ) : null}
          </div>
        </form>

        <div className="admin-shipping-list">
          {methods.map((method) => (
            <article
              className={method.is_active ? "admin-shipping-row" : "admin-shipping-row inactive"}
              key={method.id}
            >
              <div className="shipping-main">
                <h2>{method.name}</h2>
                <span>{method.code}</span>
                {method.description ? <p>{method.description}</p> : null}
              </div>
              <div>
                <span>Ár</span>
                <strong>{formatHuf(method.price)}</strong>
              </div>
              <div>
                <span>Booster határ</span>
                <strong>
                  {method.min_booster_equivalent ?? 0} - {method.max_booster_equivalent ?? "nincs"}
                </strong>
              </div>
              <div>
                <span>Sorrend</span>
                <strong>{method.sort_order}</strong>
              </div>
              <div>
                <span>Státusz</span>
                <strong>{method.is_active ? "Aktív" : "Inaktív"}</strong>
              </div>
              <button type="button" onClick={() => startEdit(method)}>
                Szerkesztés
              </button>
              <button type="button" onClick={() => handleToggleActive(method)}>
                {method.is_active ? "Inaktiválás" : "Aktiválás"}
              </button>
              {method.is_active ? (
                <button type="button" onClick={() => handleDeactivate(method)}>
                  Elrejtés
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </AdminLayout>
  );
}
