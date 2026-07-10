import { PageContainer } from "../../components/PageContainer";
import "./LegalPage.css";

type ShippingInfoPageProps = {
  cartCount: number;
};

export function ShippingInfoPage({ cartCount }: ShippingInfoPageProps) {
  return (
    <PageContainer
      cartCount={cartCount}
      eyebrow="Információ"
      title="Szállítási információk"
      lead="A jelenleg tervezett és elérhető szállítási, átvételi lehetőségek összefoglalója."
      className="legal-page"
    >
      <div className="legal-info-grid legal-info-grid--single">
        <section className="legal-info-card">
          <h2>Személyes átvétel</h2>
          <p>
            Személyes átvétel esetén a rendelés átvételéről külön egyeztetés vagy visszaigazolás
            alapján kapsz információt.
          </p>
        </section>

        <section className="legal-info-card">
          <h2>Foxpost / csomagautomata</h2>
          <p>
            Foxpost csomagautomatás szállításnál a checkout folyamatban kiválasztható lesz az
            átvételi automata. A csomag feladása után a szolgáltató küldhet további értesítést.
          </p>
        </section>

        <section className="legal-info-card">
          <h2>MPL / Magyar Posta lehetőségek</h2>
          <p>
            MPL vagy Magyar Posta szállítás esetén postai kézbesítés, postapont vagy automata
            átvétel is elérhető lehet a rendelés jellegétől és a választott szállítási módtól
            függően.
          </p>
        </section>

        <section className="legal-info-card">
          <h2>Átvételi pont választás</h2>
          <p>
            Csomagpontos vagy automatás szállításnál a vásárló választja ki az átvételi pontot. A
            kiválasztott pont adatai a rendeléshez kapcsolódnak.
          </p>
        </section>

        <section className="legal-info-card">
          <h2>Sikertelen kézbesítés</h2>
          <p>
            Sikertelen kézbesítés vagy át nem vett csomag esetén a szolgáltató szabályai szerint a
            csomag visszakerülhet a feladóhoz. Ilyenkor a további teendőkről egyeztetés szükséges.
          </p>
        </section>

        <section className="legal-info-card">
          <h2>Teljesítési határidő</h2>
          <p>A rendelés végső teljesítési határideje legfeljebb 30 nap.</p>
        </section>
      </div>
    </PageContainer>
  );
}
