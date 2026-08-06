import { Link } from "react-router";

const journeySteps = [
  ["Hozd létre a fiókodat", "Regisztrálj, erősítsd meg az e-mail-címedet, majd jelentkezz be. Licitálni és aukciót indítani csak aktív, e-mailben megerősített fiókkal lehet."],
  ["Találd meg a tételt", "Keress cím, leírás, eladó, kategória, állapot, ár, licitszám, villámár vagy lejárat szerint. Menthetsz keresést, követhetsz eladót és figyelőlistára tehetsz aukciót."],
  ["Licitálj szabályosan", "A gyorslicit egy teljes licitlépcsővel emel. A részletes oldalon nagyobb összeget is megadhatsz, de csak a meghatározott licitlépcsők szerint."],
  ["Nyerd meg az aukciót", "A legmagasabb érvényes licit nyer a lejáratkor. A villámár pontos elérése azonnal lezárja az aukciót, és a licitáló lesz a nyertes."],
  ["Egyeztessetek közvetlenül", "Az eladó és a nyertes a privát aukciós chatben beszéli meg a fizetést, az átadást vagy a szállítást. Ezeket a Nightfall Vault nem kezeli."],
  ["Zárjátok le és értékeljetek", "Mindkét fél külön megerősíti a teljesítést. Ezután egyszer, 1–5 csillaggal értékelhetik egymást az értékelési határidőn belül."],
] as const;

const accountRules = [
  "Egy személy saját, valós adatokkal létrehozott fiókot használjon; a belépési adatokat nem szabad másnak átadni.",
  "A normál tag korlátlan számú aukciót böngészhet és licitálhat, de egyszerre legfeljebb 3 saját aktív vagy időzített aukciója lehet.",
  "A VIP-tagság 12 karakteres, egyszer használható alfanumerikus kóddal aktiválható 1 vagy 3 hónapra. A még aktív VIP-időszakhoz az új időtartam hozzáadódik.",
  "A VIP-tag korlátlan számú saját aktív vagy időzített aukciót tarthat fenn, aukciói VIP-kiemelést kapnak, és a listák elején jelennek meg.",
  "Lejárt VIP-tagságnál a már futó aukciók nem tűnnek el, de új aukció csak akkor aktiválható, ha a normál háromaukciós korlát ismét teljesül.",
] as const;

const creationRules = [
  "Csak saját tulajdonú, jogszerűen értékesíthető tétel tölthető fel valós címmel, részletes leírással, megfelelő kategóriával és tényleges állapottal.",
  "Az aktiváláshoz 1–5 kép szükséges, és pontosan egy képet borítóképként kell kijelölni. Az eladónak el kell fogadnia a tulajdonjogi és képhasználati nyilatkozatot.",
  "A kezdőár 0 Ft is lehet, negatív azonban nem. A licitlépcsőnek pozitívnak kell lennie. Bekapcsolt villámárnál kötelező összeget megadni, amelynek magasabbnak kell lennie a kezdőárnál.",
  "A lejáratnak későbbinek kell lennie a kezdésnél. Jövőbeli kezdés esetén az aukció Időzített, már elérkezett kezdésnél Aktív állapotba kerül.",
  "Piszkozatban minden adat javítható. Aktiválás után a kezdőár, a licitlépcső, a villámár összege és a kezdési idő már nem módosítható.",
  "Az eladó a saját aktív aukciójára nem licitálhat. A lezárt, eladott, eladatlan vagy megszakított aukció adatai utólag nem írhatók át normál szerkesztéssel.",
] as const;

const biddingRules = [
  "Licit kizárólag Aktív aukcióra, aktív és licitálástól el nem tiltott fiókkal adható le. Saját aukcióra nem lehet licitálni.",
  "A következő legkisebb licit mindig az aktuális ár és egy teljes licitlépcső összege. A kártya Licitálok gombja ezt az összeget küldi be oldalváltás nélkül.",
  "A részletes oldalon üresen hagyott összegmező szintén a következő teljes licitlépcsőt használja. Egyedi, magasabb összeg csak egész licitlépcsőkkel adható meg.",
  "Példa: 35 000 Ft aktuális ár és 1000 Ft licitlépcső mellett 36 000, 37 000 vagy 38 000 Ft érvényes; 36 500 Ft nem érvényes.",
  "Minden beküldéskor a szerver az éppen aktuális árból számol. Ha közben más licitált, magyar hibaüzenet jelzi az új minimumot; az elavult ajánlat nem írhatja felül a magasabbat.",
  "A licitek és az aktuális ár valós időben frissülnek. A túllicitált felhasználó értesítést kap, a licittörténetben pedig a licitálók anonimizált azonosítóval szerepelnek.",
  "Normál licit előtt megerősítő kérdés jelenik meg. Ez eszközönként kikapcsolható, majd a Profilbeállítások oldalon visszakapcsolható. A Villámvásárlás mindig külön megerősítést kér.",
] as const;

const withdrawalRules = [
  "A licitek alapvetően kötelező érvényűek. Téves licit esetén kizárólag az aukció legutolsó és legmagasabb aktív licitje vonható vissza, a leadásától számított legfeljebb 1 percen belül.",
  "A visszavonás csak akkor engedélyezett, ha az aukció végéig legalább 5 perc van hátra. Pontosan 60 másodpercnél és pontosan 5 perc hátralévő időnél a művelet még engedélyezett.",
  "A működés veremelvű: 1000, 2000, 3000 és 4000 Ft aktív licit esetén először csak a 4000 Ft-os vonható vissza. Ezután a 3000 Ft-os válik legfelsővé, és külön műveletben visszavonható, ha a többi feltétel még teljesül.",
  "A visszavont licit nem törlődik. Visszavont állapottal megmarad a licittörténetben és az auditnaplóban, de nem számít bele az aktuális árba, a következő minimumba, a vezetőbe, a nyertesbe vagy a tranzakcióba.",
  "A visszavonáshoz indokot kell választani. Az Egyéb indokhoz rövid szöveges magyarázat is szükséges. A backend a kattintás pillanatában újra ellenőrzi a tulajdonost, az időablakot, az aukcióállapotot és a licitsor tetejét.",
  "Minden sikeres visszavonást naplózunk. Az 5. sikeres visszavonás után egyszeri automatikus figyelmeztetés érkezik; visszaélésszerű használat esetén az admin ideiglenesen vagy végleg korlátozhatja ezt a lehetőséget.",
  "A projekt jelenlegi licitmotorja közvetlen, licitlépcső-alapú ajánlatokat kezel; külön rejtett proxy/max-bid keret nincs. A visszavonás után a következő legmagasabb aktív licit lesz a vezető.",
] as const;

const buyNowRules = [
  "A villámár opcionális, és csak akkor használható, ha az eladó az aukció létrehozásakor megadta az összegét.",
  "A Lecsapom gomb pontosan a feltüntetett villámárat küldi be. A villámárnál magasabb összeg nem adható meg.",
  "Ha egy szabályos licit eléri a villámár összegét, az aukció azonnal Eladott állapotba kerül, a licitáló lesz a nyertes, és további licit nem tehető.",
  "A villámáras lezárás nem indít ötperces hosszabbítást: a nyerés azonnali és végleges az adott aukción belül.",
] as const;

const extensionRules = [
  "Az 5 perces szabály csak akkor működik, ha az eladó bekapcsolta az aukción.",
  "Ha a lejárat előtti utolsó öt percben érvényes licit érkezik, az új lejárat a licit időpontjától számított öt perc lesz.",
  "Minden további, az új lejárat előtti utolsó öt percben érkező érvényes licit ismét öt percre állítja a hátralévő időt.",
  "Az aukció akkor zárul le, amikor öt teljes perc telik el új érvényes licit nélkül. Sikertelen licit és villámáras azonnali nyerés nem indít újabb öt percet.",
] as const;

const closingRules = [
  "A kezdési idő elérésekor az Időzített aukció automatikusan Aktív lesz.",
  "A lejáratkor a legmagasabb érvényes licit licitálója nyer, az aukció Eladott állapotba kerül. Licit nélkül Eladatlan állapottal zárul.",
  "Eladott aukcióhoz pontosan egy tranzakció nyílik. Ezt kizárólag az eladó és a nyertes láthatja; külső felhasználó nem fér hozzá.",
  "Az eladott aukció a nyilvános Aukciók oldalon az egyeztetés ideje alatt, a futó tételek mögött marad. A két fél kölcsönös teljesítési megerősítése után lekerül a nyilvános listáról; a saját tranzakciós előzményben továbbra is elérhető.",
  "A Nightfall Vault nem szed be vételárat, nem tart pénzt letétben, és nem szervez csomagküldést. A fizetés, átadás és szállítás a két fél saját megállapodása és felelőssége.",
] as const;

const transactionRules = [
  "Az eladó és a nyertes a lezárt aukció privát chatjében egyeztethet. A chathez más felhasználó nem fér hozzá.",
  "Enter elküldi az üzenetet, Shift+Enter új sort készít. Az új üzenet valós időben megjelenik és értesítést küldhet a másik félnek.",
  "Tiltott vagy blokkolt kapcsolatban, illetve chattiltás alatt az üzenetküldés szerveroldalon sem hajtható végre. Archivált chat csak olvasható.",
  "A teljesítést mindkét fél külön erősíti meg. Az első megerősítés után a tranzakció nyitva marad, és a másik fél értesítést kap.",
  "A második megerősítés a tranzakciót Teljesített állapotba helyezi. Az ismételt megerősítés nem hoz létre második tranzakciót és nem duplikálja az állapotot.",
  "A teljesítés után az eladó és a vevő egyszer-egyszer, 1–5 csillaggal értékelheti egymást. Az értékelési időszak alapértelmezetten 30 nap; lejárat vagy mindkét értékelés után a tranzakció archiválható.",
] as const;

const discoveryRules = [
  "A figyelőlista a kiválasztott aukciókat gyűjti össze, és a közelgő lejáratról emlékeztető érkezhet.",
  "A mentett keresés az új, feltételeknek megfelelő aukciókról jelezhet. Az eladó követése az eladó új aukcióiról küldhet értesítést.",
  "Az értesítések kategóriái: licitek, chat, követések, tranzakciók, értékelések, moderáció és rendszer. Kategóriánként külön állítható az alkalmazáson belüli, böngészős és e-mailes csatorna.",
  "A kikapcsolt csatornára nem érkezik értesítés; a mentett beállítások oldalfrissítés után is megmaradnak.",
] as const;

const safetyRules = [
  "Aukció vagy felhasználói profil jelenthető előre megadott indokkal és részletes leírással. Saját aukció vagy saját profil nem jelenthető.",
  "Ugyanaz a felhasználó ugyanazt az aukciót vagy profilt csak egyszer jelentheti. Egy jelentés vagy strike önmagában nem okoz automatikus végleges tiltást.",
  "Az admin figyelmeztetést, strike-ot, aukcióindítási, licitálási vagy chatkorlátozást, ideiglenes vagy végleges fióktiltást adhat ki. Az intézkedések naplózottak és indokolt esetben visszavonhatók.",
  "Felhasználót blokkolva megszűnik az új követés és a tiltott aukciós üzenetküldés. A már lezárt tranzakció jogszerű rendezését a feleknek továbbra is felelősen kell kezelniük.",
  "Gyanús fizetési kérés, hamis termék, zaklatás vagy fiókfeltörés gyanúja esetén ne folytasd az ügyletet: őrizd meg a bizonyítékokat, jelentsd az esetet, és szükség esetén fordulj az illetékes hatósághoz.",
] as const;

function RuleSection({ eyebrow, title, rules, ariaLabel }: { eyebrow: string; title: string; rules: readonly string[]; ariaLabel?: string }) {
  return (
    <section className="side-panel rules-panel" aria-label={ariaLabel}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <ul>{rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
    </section>
  );
}

export function HowItWorksPage() {
  return (
    <section className="container page-shell">
      <p className="eyebrow">A Nightfall Vault szabályai</p>
      <h1>Hogyan működik?</h1>
      <p className="page-intro">Az aukció teljes útja a fiók létrehozásától a licitáláson át a kölcsönös lezárásig. Az alábbi szabályok minden felhasználóra és minden aukcióra érvényesek.</p>

      <div className="info-grid">
        {journeySteps.map(([title, text], index) => (
          <article className="side-panel info-card" key={title}>
            <span>{index + 1}</span><h2>{title}</h2><p>{text}</p>
          </article>
        ))}
      </div>

      <div className="rules-grid how-it-works-rules">
        <RuleSection eyebrow="Fiók és tagság" title="Normál és VIP-tagság" rules={accountRules} />
        <RuleSection eyebrow="Eladóknak" title="Aukció létrehozása és módosítása" rules={creationRules} />
        <RuleSection eyebrow="Licitálóknak" title="Licit és licitlépcső" rules={biddingRules} ariaLabel="Licitálási szabályok" />
        <div id="bid-withdrawal"><RuleSection eyebrow="Kivételes lehetőség" title="Licit visszavonása" rules={withdrawalRules} ariaLabel="Licit-visszavonási szabályok" /></div>
        <RuleSection eyebrow="Azonnali nyerés" title="Villámár" rules={buyNowRules} />
        <RuleSection eyebrow="Igazságos hajrá" title="Az 5 perces szabály" rules={extensionRules} />
        <RuleSection eyebrow="Automatikus folyamat" title="Kezdés és aukciózárás" rules={closingRules} />
        <RuleSection eyebrow="Eladó és nyertes" title="Chat, tranzakció és értékelés" rules={transactionRules} />
        <RuleSection eyebrow="Ne maradj le" title="Figyelések és értesítések" rules={discoveryRules} />
        <RuleSection eyebrow="Biztonság" title="Jelentés, blokkolás és moderáció" rules={safetyRules} />
      </div>

      <section className="side-panel rules-panel">
        <p className="eyebrow">Fontos felelősségi határ</p>
        <h2>A Nightfall Vault aukciós piactér, nem webshop</h2>
        <p>A platform az aukciót, a liciteket, az értesítéseket, a privát egyeztetést, a kölcsönös teljesítési visszaigazolást és az értékelést biztosítja. Nem kezel bankkártyás fizetést, pénzletétet, rendelést, kosarat, futárt vagy szállítási garanciát.</p>
        <p>Mindig ellenőrizd a másik fél profilját és értékeléseit, nagyobb értéknél válassz nyomon követhető fizetési és átadási módot, és ne oszd meg a jelszavadat vagy aktiváló kódodat.</p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/auctions">Aukciók böngészése</Link>
          <Link className="button button-secondary" to="/auctions/create">Saját aukció indítása</Link>
        </div>
      </section>
    </section>
  );
}
