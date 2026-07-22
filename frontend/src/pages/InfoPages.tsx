import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type InformationPageProps = {
  eyebrow: string;
  title: string;
  lead: string;
  children: ReactNode;
};

function InformationPage({ eyebrow, title, lead, children }: InformationPageProps) {
  return (
    <article className="container page-shell information-page" aria-labelledby="information-title">
      <header className="information-hero">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="information-title">{title}</h1>
        <p>{lead}</p>
      </header>
      <div className="information-sections">{children}</div>
    </article>
  );
}

export function TermsPage() {
  return (
    <InformationPage eyebrow="Jogi információk" title="Felhasználási feltételek" lead="A zárt béta közös tere akkor működik jól, ha minden résztvevő ugyanazokat az alapelveket követi.">
      <section><h2>Fiók és részvétel</h2><p>A fiókban valós, elérhető e-mail-címet és pontos adatokat kell használni. A hozzáférés személyes; a fiók biztonságáért és az azon keresztül végzett műveletekért a felhasználó felel.</p></section>
      <section><h2>Aukciók és licitek</h2><p>Csak olyan tárgy hirdethető meg, amelynek értékesítésére és képeinek használatára az eladó jogosult. A leadott licit valós vételi szándékot jelent, ezért az aukció részleteit licitálás előtt át kell tekinteni.</p></section>
      <section><h2>Közvetlen megállapodás</h2><p>A Nightfall Vault nem kezel fizetést és szállítást. A lezárt aukció után az eladó és a nyertes közvetlenül egyeztet, a teljesítés feltételeiről és biztonságáról ők gondoskodnak.</p></section>
      <section><h2>Közösségi biztonság</h2><p>A megtévesztő, jogsértő, zaklató vagy a rendszer működését veszélyeztető használat moderációs intézkedést vonhat maga után. Probléma esetén használd az aukció- vagy profiljelentést.</p></section>
      <section><h2>Zárt béta</h2><p>A szolgáltatás bétaállapotban változhat, átmenetileg szünetelhet, és egyes részei meghíváshoz kötöttek lehetnek. Lényeges változásról a felületen vagy a fiókhoz tartozó elérhetőségen adunk tájékoztatást.</p></section>
    </InformationPage>
  );
}

export function PrivacyPage() {
  return (
    <InformationPage eyebrow="Adatvédelem" title="Adatvédelmi tájékoztató" lead="Csak a fiók, az aukciók és a közösségi biztonság működéséhez szükséges adatokat használjuk.">
      <section><h2>Milyen adatokat kezelünk?</h2><p>A regisztrációs és profiladatokat, az aukciókhoz feltöltött tartalmat, a liciteket, a felhasználók közötti üzeneteket, az értesítési beállításokat, valamint a biztonsági és moderációs eseményeket.</p></section>
      <section><h2>Mire használjuk?</h2><p>Fiókazonosításra, az aukciós folyamat működtetésére, a résztvevők összekapcsolására, visszaélések megelőzésére, ügyintézésre és a szolgáltatás megbízhatóságának fenntartására.</p></section>
      <section><h2>Mit nem kezel a platform?</h2><p>A Nightfall Vault nem kér és nem tárol bankkártyaadatot, nem dolgoz fel fizetést, és nem szervez szállítást. Ezekről az eladó és a nyertes egymással állapodik meg.</p></section>
      <section><h2>Megőrzés és védelem</h2><p>Az adatokat csak a szolgáltatás, a biztonság és a jogszerű működés által indokolt ideig őrizzük. A hozzáférést jogosultságok, naplózás és technikai védelmi intézkedések korlátozzák.</p></section>
      <section><h2>Felhasználói lehetőségek</h2><p>A profiladatok a fiókban szerkeszthetők, a fiók törlése pedig ugyanott kezdeményezhető. Egyéb adatvédelmi kérdéshez a <Link to="/contact">kapcsolati oldalon</Link> található csatorna használható.</p></section>
    </InformationPage>
  );
}

export function SupportPage() {
  return (
    <InformationPage eyebrow="Támogatás" title="Miben segíthetünk?" lead="A legtöbb kérdés néhány lépésben rendezhető; az alábbi útvonalak gyorsan a megfelelő helyre visznek.">
      <section><h2>Fiókhozzáférés</h2><p>Elfelejtett jelszónál indíts <Link to="/forgot-password">jelszó-helyreállítást</Link>. Ha az aktiváló levél nem érkezett meg, a regisztrációnál megadott címmel újraküldhető.</p></section>
      <section><h2>Aukció és licit</h2><p>A licitlépcsőt, a villámárat és az ötpereces szabályt a <Link to="/how-it-works">Hogyan működik?</Link> oldal foglalja össze.</p></section>
      <section><h2>Visszaélés vagy vitás tartalom</h2><p>Használd az érintett aukción vagy profilon a Jelentés gombot. A moderáció a bejelentést az előzményekkel együtt vizsgálja.</p></section>
      <section><h2>Közvetlen segítség</h2><p>Technikai vagy fiókproblémánál a <Link to="/contact">Kapcsolat</Link> oldalon találod az aktuális támogatási elérhetőséget.</p></section>
    </InformationPage>
  );
}
