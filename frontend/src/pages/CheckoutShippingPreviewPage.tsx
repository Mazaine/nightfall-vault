import { useState } from "react";
import { PickupPointSelector } from "../components/PickupPointSelector";
import { SiteHeader } from "../components/SiteHeader";
import type { PickupPoint } from "../types";
import "./CheckoutShippingPreviewPage.css";

type CheckoutShippingPreviewPageProps = {
  cartCount: number;
};

export function CheckoutShippingPreviewPage({ cartCount }: CheckoutShippingPreviewPageProps) {
  const [selectedPickupPoint, setSelectedPickupPoint] = useState<PickupPoint | null>(null);

  function handleSelect(pickupPoint: PickupPoint) {
    setSelectedPickupPoint(pickupPoint);
  }

  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className="shipping-preview-page page-content">
        <div className="shipping-preview-hero">
          <p className="eyebrow">Checkout előkészítés</p>
          <h1>Átvételi pont választó</h1>
          <p>
            Ez egy izolált tesztfelület a Foxpost és MPL / Postapont automata választóhoz. Még nem
            ment rendeléshez adatot.
          </p>
        </div>

        <div className="shipping-preview-layout">
          <PickupPointSelector
            selectedPickupPoint={selectedPickupPoint}
            onSelect={handleSelect}
          />

          <aside className="shipping-preview-debug" aria-label="Kiválasztott automata debug">
            <h2>Debug panel</h2>
            {selectedPickupPoint ? (
              <pre>{JSON.stringify(selectedPickupPoint, null, 2)}</pre>
            ) : (
              <p>Még nincs kiválasztott automata.</p>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
