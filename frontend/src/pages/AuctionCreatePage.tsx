import { SellingNavigation } from "../components/SellingNavigation";
import { useSearchParams } from "react-router";
import { ListingComposer } from "../components/ListingComposer";

export function AuctionCreatePage() {
  const [params] = useSearchParams();
  return (
    <section className="container page-shell auction-create-page">
      <header className="page-heading"><p className="eyebrow">Új hirdetés</p><h1>Eladás vagy aukció</h1><p>Gyors hirdetésfeladás a Nightfall piacterére.</p></header>
      <SellingNavigation />
      <section className="side-panel"><ListingComposer key={params.get("type")} initialMode={params.get("type") === "auction" ? "auction" : "fixed"} hideMode/></section>
    </section>
  );
}
