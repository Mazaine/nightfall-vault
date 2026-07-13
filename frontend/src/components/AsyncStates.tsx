import type { ReactNode } from "react";

export function LoadingState({ label = "Betöltés folyamatban…", cards = 3 }: { label?: string; cards?: number }) {
  return (
    <div className="skeleton-grid compact-skeleton-grid" role="status" aria-label={label}>
      {Array.from({ length: cards }).map((_, index) => <div className="skeleton-card" aria-hidden="true" key={index} />)}
      <span className="visually-hidden">{label}</span>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="side-panel empty-state state-panel"><h2>{title}</h2>{children ? <p>{children}</p> : null}{action}</div>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="side-panel state-panel error-state" role="alert">
      <h2>Nem sikerült betölteni az adatokat</h2>
      <p>{message}</p>
      {onRetry ? <button className="button button-secondary" type="button" onClick={onRetry}>Újrapróbálás</button> : null}
    </div>
  );
}
