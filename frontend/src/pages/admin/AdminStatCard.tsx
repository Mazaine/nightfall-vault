type AdminStatCardProps = {
  value: string;
  title: string;
  text: string;
};

export function AdminStatCard({ value, title, text }: AdminStatCardProps) {
  return (
    <article className="side-panel info-card">
      <span>{value}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}
