import { FormEvent, useState } from "react";

import { KeyboardEvent, useEffect, useId, useRef } from "react";

type ReasonOption = { value: string; label: string };

type ReportDialogProps = {
  title: string;
  targetLabel: string;
  reasons: ReasonOption[];
  onSubmit: (reason: string, details: string) => Promise<void>;
  onClose: () => void;
};

export function ReportDialog({ title, targetLabel, reasons, onSubmit, onClose }: ReportDialogProps) {
  const [reason, setReason] = useState(reasons[0]?.value ?? "other");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href]",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    try {
      await onSubmit(reason, details.trim());
      setMessage("A jelentés rögzítve. A moderátorok átnézik az ügyet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A jelentés beküldése nem sikerült.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef} className="side-panel report-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handleKeyDown} onSubmit={submit}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Trust & Safety</p>
            <h2 id={titleId}>{title}</h2>
            <p className="section-note" id={descriptionId}>Cél: {targetLabel}</p>
          </div>
          <button ref={closeButtonRef} className="button button-ghost" type="button" onClick={onClose}>Bezárás</button>
        </div>
        <label>
          Jelentés oka
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {reasons.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          Részletek
          <textarea rows={5} maxLength={1200} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Írd le röviden, mit kell ellenőrizni." />
        </label>
        {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
        <button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Küldés…" : "Jelentés beküldése"}</button>
      </form>
    </div>
  );
}
