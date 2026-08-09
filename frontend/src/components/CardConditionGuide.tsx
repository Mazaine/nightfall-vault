import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { CARD_CONDITIONS } from "../data/cardConditions";

function CardConditionGuideDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="side-panel condition-guide-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handleKeyDown}>
        <div className="section-heading">
          <div><p className="eyebrow">Állapotbesorolás</p><h2 id={titleId}>Kártyaállapot útmutató</h2></div>
          <button ref={closeRef} className="button button-ghost" type="button" onClick={onClose}>Bezárás</button>
        </div>
        <p id={descriptionId}><strong>Az állapotot mindig a kártya tényleges fizikai állapota alapján válaszd ki. A frissen bontott kártya sem automatikusan Tökéletes (M) állapotú.</strong></p>
        <p>Ha két állapot között bizonytalan vagy, válaszd az alacsonyabb állapotot.</p>
        <div className="condition-guide-grid">
          {CARD_CONDITIONS.map((item) => <article className={`condition-guide-item condition-${item.value.toLowerCase()}`} key={item.value}>
            <strong className="condition-guide-code">{item.value}</strong>
            <div><h3>{item.nameHu}</h3><small>{item.nameEn}</small><p>{item.description}</p></div>
          </article>)}
        </div>
        <p className="condition-guide-note"><strong>Nyomdahibás / gyártási hibás:</strong> külön tulajdonság, amely nem írja felül automatikusan az M–PO állapotot.</p>
      </div>
    </div>
  );
}

export function CardConditionHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();
  return <>
    <span className="condition-help-wrap">
      <button className="condition-help-button" type="button" aria-label="Kártyaállapot útmutató megnyitása" aria-describedby={tooltipId} aria-haspopup="dialog" onClick={() => setIsOpen(true)}>?</button>
      <span className="condition-help-tooltip" id={tooltipId} role="tooltip">Az M–PO állapotskála részletes magyarázata</span>
    </span>
    {isOpen ? <CardConditionGuideDialog onClose={() => setIsOpen(false)} /> : null}
  </>;
}
