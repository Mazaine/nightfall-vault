import { FormEvent, KeyboardEvent, useEffect, useId, useRef, useState } from "react";

type ReviewDialogProps = {
  auctionTitle: string;
  onSubmit: (rating: number, comment: string) => Promise<void>;
  onClose: () => void;
};

export function ReviewDialog({ auctionTitle, onSubmit, onClose }: ReviewDialogProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

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

  const keyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), select:not([disabled]), textarea:not([disabled])");
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback("");
    try {
      await onSubmit(rating, comment.trim());
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Az értékelés elküldése nem sikerült.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form ref={dialogRef} className="side-panel report-dialog review-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keyDown} onSubmit={submit}>
        <div className="section-heading">
          <div><p className="eyebrow">Tranzakció teljesítve</p><h2 id={titleId}>Értékeld a másik felet</h2><p className="section-note">{auctionTitle}</p></div>
          <button ref={closeRef} className="button button-ghost" type="button" onClick={onClose}>Később</button>
        </div>
        <label>Értékelés<select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5, 4, 3, 2, 1].map((value) => <option value={value} key={value}>{value} csillag</option>)}</select></label>
        <label>Megjegyzés<textarea rows={4} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Írd le röviden a tapasztalatodat." /></label>
        {feedback ? <p className="form-message" role="alert">{feedback}</p> : null}
        <button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Küldés…" : "Értékelés elküldése"}</button>
      </form>
    </div>
  );
}
