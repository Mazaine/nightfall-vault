type AdminListPageProps = {
  title: string;
  description: string;
};

export function AdminListPage({ title, description }: AdminListPageProps) {
  return (
    <div>
      <h1>{title}</h1>
      <div className="side-panel list-panel">
        <h2>Sablon lista nézet</h2>
        <p>{description}</p>
        <button className="button button-primary" type="button">
          Új elem
        </button>
      </div>
    </div>
  );
}
