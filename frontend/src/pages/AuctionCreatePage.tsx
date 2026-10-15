import { ListingComposer } from "../components/ListingComposer";

export function AuctionCreatePage() {
  return (
    <section className="container page-shell auction-create-page">
      <header className="page-heading"><p className="eyebrow">Új hirdetés</p><h1>Eladás vagy aukció</h1><p>Gyors hirdetésfeladás a Nightfall piacterére.</p></header>
      <section className="side-panel"><ListingComposer/></section>
    </section>
  );
}
