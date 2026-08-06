import { FormEvent, KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BidWithdrawalReason } from "../api/auctions";

function useDialogLifecycle(onClose: () => void) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])") ?? []);
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return { ref, onKeyDown };
}

function DialogShell({ title, onClose, onSubmit, children, busy }: { title: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode; busy: boolean }) {
  const titleId = useId();
  const { ref, onKeyDown } = useDialogLifecycle(onClose);
  return createPortal(
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form ref={ref} className="side-panel report-dialog bid-action-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} onSubmit={onSubmit}>
        <h2 id={titleId}>{title}</h2>{children}
      </form>
    </div>, document.body,
  );
}

export function BidConfirmationDialog({ amountLabel, isBuyNow, busy, onClose, onConfirm }: { amountLabel: string; isBuyNow: boolean; busy: boolean; onClose: () => void; onConfirm: (disableFuture: boolean) => void }) {
  const [disableFuture, setDisableFuture] = useState(false);
  return <DialogShell title={isBuyNow ? "Villámvásárlás megerősítése" : "Licit megerősítése"} onClose={onClose} busy={busy} onSubmit={(event) => { event.preventDefault(); onConfirm(disableFuture); }}>
    <p>Biztosan leadod a(z) <strong>{amountLabel}</strong> összegű {isBuyNow ? "villámvásárlást" : "licitet"}?</p>
    <p className="section-note">A licit kötelező érvényű, és csak szigorú feltételekkel vonható vissza.</p>
    {!isBuyNow ? <label className="toggle-row"><input type="checkbox" checked={disableFuture} onChange={(event) => setDisableFuture(event.target.checked)} />Ne kérjen több megerősítést ezen az eszközön</label> : null}
    <div className="form-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={onClose}>Mégse</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Rögzítés…" : isBuyNow ? "Villámvásárlás véglegesítése" : "Licit véglegesítése"}</button></div>
  </DialogShell>;
}

const withdrawalReasons: Array<[BidWithdrawalReason, string]> = [
  ["accidental", "Véletlen licit"], ["wrong_amount", "Rossz összeget adtam meg"],
  ["technical_issue", "Technikai probléma"], ["other", "Egyéb"],
];

export function BidWithdrawalDialog({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: (reason: BidWithdrawalReason, text: string | null) => void }) {
  const [reason, setReason] = useState<BidWithdrawalReason>("accidental");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  return <DialogShell title="Licit visszavonása" onClose={onClose} busy={busy} onSubmit={(event) => {
    event.preventDefault();
    const normalized = text.trim();
    if (reason === "other" && normalized.length < 10) { setError("Az Egyéb indoklás legalább 10 karakter hosszú legyen."); return; }
    onConfirm(reason, reason === "other" ? normalized : null);
  }}>
    <p>A visszavonás naplózott művelet. Csak a licitsor legfelső aktív eleme vonható vissza.</p>
    <label>Indok<select value={reason} onChange={(event) => { setReason(event.target.value as BidWithdrawalReason); setError(""); }}>{withdrawalReasons.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
    {reason === "other" ? <label>Részletes indok<textarea value={text} minLength={10} maxLength={500} required onChange={(event) => { setText(event.target.value); setError(""); }} /></label> : null}
    {error ? <p className="form-message" role="alert">{error}</p> : null}
    <div className="form-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={onClose}>Mégse</button><button className="button button-danger" type="submit" disabled={busy}>{busy ? "Visszavonás…" : "Licit visszavonása"}</button></div>
  </DialogShell>;
}
