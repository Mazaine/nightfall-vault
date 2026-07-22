import { Link } from "react-router-dom";

const values = [
  {
    sigil: "I",
    title: "A gyűjtőkért",
    text: "A Vault azoknak épül, akik egy lapban nem csupán tárgyat, hanem történetet, emléket és egy új gyűjtemény kezdetét látják.",
  },
  {
    sigil: "II",
    title: "Tiszta licitek",
    text: "Átlátható licittörténet, valós idejű frissítés és következetes szabályok őrzik, hogy minden ajánlatnak súlya legyen.",
  },
  {
    sigil: "III",
    title: "Bizalom a kapuk mögött",
    text: "Megerősített fiókok, privát egyeztetés, értékelések és moderáció segítik, hogy a felek biztonságosabban találjanak egymásra.",
  },
] as const;

export function AboutPage() {
  return (
    <section className="container page-shell about-page">
      <header className="about-hero side-panel">
        <div className="about-hero-copy">
          <p className="eyebrow">A boltozat története</p>
          <h1>Ahol a ritka lapok új történetre találnak</h1>
          <p className="hero-lead">
            Alkonyatkor megnyílnak a Nightfall Vault kapui. Odabent gyűjtők, játékosok és kincsvadászok találkoznak,
            hogy különleges kártyák cseréljenek gazdát — tiszta szabályok, valódi licitek és emberi megállapodások mentén.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/auctions">Belépek a Vaultba</Link>
            <Link className="button button-secondary" to="/how-it-works">Hogyan működik?</Link>
          </div>
        </div>
        <blockquote className="about-oath">
          <span aria-hidden="true">◇</span>
          <p>„Minden lap őriz egy történetet. Mi csak segítünk megtalálni a következő őrzőjét.”</p>
        </blockquote>
      </header>

      <section className="about-intro" aria-labelledby="about-mission-title">
        <p className="eyebrow">Küldetésünk</p>
        <h2 id="about-mission-title">Nem egyszerű piactér. Találkozóhely.</h2>
        <p>
          A Nightfall Vault egy közösségi aukciós ház gyűjtői kártyákhoz. Célunk egy olyan hely létrehozása,
          ahol az izgalmas licitálás mellett a követhetőség, a felelősség és a kölcsönös bizalom is természetes.
        </p>
      </section>

      <div className="about-values">
        {values.map((value) => (
          <article className="side-panel about-value-card" key={value.title}>
            <span>{value.sigil}</span>
            <h2>{value.title}</h2>
            <p>{value.text}</p>
          </article>
        ))}
      </div>

      <section className="side-panel about-boundary" aria-labelledby="about-boundary-title">
        <div>
          <p className="eyebrow">A kapukon túl</p>
          <h2 id="about-boundary-title">A megállapodás a feleké</h2>
        </div>
        <p>
          A Nightfall Vault az aukciót, a kapcsolatfelvételt és a bizalmi eszközöket biztosítja. Fizetést és szállítást nem kezelünk:
          az átadás részleteiről az eladó és a nyertes közvetlenül, a privát chatben állapodik meg.
        </p>
      </section>
    </section>
  );
}
