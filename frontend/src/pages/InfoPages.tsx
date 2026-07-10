type InfoPageProps = {
  title: string;
  eyebrow: string;
};

export function InfoPage({ title, eyebrow }: InfoPageProps) {
  return (
    <section className="container page-shell narrow-page">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="hero-lead">
        Ez egy sablon oldal. A végleges jogi, adatvédelmi vagy támogatási tartalmat az éles projekt indításakor kell
        feltölteni.
      </p>
    </section>
  );
}
