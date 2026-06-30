import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import "./PageContainer.css";

type PageContainerProps = {
  cartCount: number;
  eyebrow?: string;
  title: string;
  lead?: string;
  className?: string;
  children: ReactNode;
};

export function PageContainer({
  cartCount,
  eyebrow,
  title,
  lead,
  className,
  children,
}: PageContainerProps) {
  return (
    <main className="app-shell">
      <SiteHeader cartCount={cartCount} />
      <section className={`page-container page-content ${className ?? ""}`.trim()}>
        <div className="page-container__header">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {lead ? <p className="lead">{lead}</p> : null}
        </div>
        {children}
      </section>
    </main>
  );
}
