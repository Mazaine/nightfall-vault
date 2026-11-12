import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./CardImageZoom.css";

type Props = {
  src?: string | null;
  alt: string;
  foil?: boolean;
};

/** Small zoom control for trading-card images, with a readable full-screen viewer. */
export function CardImageZoom({ src, alt, foil = false }: Props) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
      if (event.key === "Tab") {
        const dialog = closeButton.current?.closest('[role="dialog"]');
        if (!dialog) return;
        const controls = Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        if (controls.length === 0) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger.current?.focus();
    };
  }, [open]);

  if (!src) return null;

  return <>
    <button
      ref={trigger}
      className="card-image-zoom-trigger"
      type="button"
      aria-label={`Lap nagyítása: ${alt}`}
      title="Lap nagyítása"
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); setZoom(1); setOpen(true); }}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5M8 10.5h5M10.5 8v5" />
      </svg>
    </button>
    {open && createPortal(
      <div
        className="card-image-zoom-backdrop"
        onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
      >
        <section className="card-image-zoom-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <header className="card-image-zoom-header">
            <h2 id={titleId}>{alt}</h2>
            <button ref={closeButton} type="button" className="card-image-zoom-close" aria-label="Nagyítás bezárása" onClick={() => setOpen(false)}>×</button>
          </header>
          <div className="card-image-zoom-viewport">
            <img
              className={foil ? "foil-zoom-image" : undefined}
              src={src}
              alt={`${alt} nagyított képe`}
              draggable={false}
              style={{ width: zoom === 1 ? "auto" : `${zoom * 100}%`, maxWidth: zoom === 1 ? "100%" : "none", maxHeight: zoom === 1 ? "100%" : "none" }}
            />
          </div>
          <footer className="card-image-zoom-controls">
            <button type="button" disabled={zoom <= 1} aria-label="Kicsinyítés" onClick={() => setZoom((value) => Math.max(1, value - .5))}>−</button>
            <output aria-live="polite">{Math.round(zoom * 100)}%</output>
            <button type="button" disabled={zoom >= 3} aria-label="Nagyítás" onClick={() => setZoom((value) => Math.min(3, value + .5))}>+</button>
            <button type="button" onClick={() => setZoom(1)}>Visszaállítás</button>
          </footer>
        </section>
      </div>,
      document.body,
    )}
  </>;
}
