import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import "./ui.css";

export function Button({ className = "", variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return <button className={`ui-button ui-button-${variant} ${className}`.trim()} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <article className={`ui-card ${className}`.trim()}>{children}</article>;
}

export function Badge({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "violet" | "muted" | "danger" }) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="ui-input" {...props} />;
}

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return <div className="ui-state"><strong>{title}</strong>{text ? <p>{text}</p> : null}</div>;
}

export function LoadingState({ text }: { text: string }) {
  return <div className="ui-state ui-state-loading"><span className="ui-spinner" />{text}</div>;
}

export function ErrorState({ title, text }: { title: string; text?: string }) {
  return <div className="ui-state ui-state-error"><strong>{title}</strong>{text ? <p>{text}</p> : null}</div>;
}

export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow?: string; title: string; lead?: string; actions?: ReactNode }) {
  return <header className="page-header">{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<div><h1>{title}</h1>{lead ? <p className="lead">{lead}</p> : null}</div>{actions ? <div className="page-header-actions">{actions}</div> : null}</header>;
}
