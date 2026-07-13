import { FormEvent, useState } from "react";

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

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    try {
      await onSubmit(reason, details.trim());
      setMessage("A jelentes rogzitve. A moderatorok atnezik az ugyet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A jelentes bekuldese nem sikerult.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <form className="side-panel report-dialog" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Trust & Safety</p>
            <h2>{title}</h2>
            <p className="section-note">Cel: {targetLabel}</p>
          </div>
          <button className="button button-ghost" type="button" onClick={onClose}>Bezaras</button>
        </div>
        <label>
          Jelentes oka
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {reasons.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>
          Reszletek
          <textarea rows={5} maxLength={1200} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Ird le roviden, mit kell ellenorizni." />
        </label>
        {message ? <p className="form-message">{message}</p> : null}
        <button className="button button-primary" type="submit" disabled={isSubmitting}>{isSubmitting ? "Kuldes..." : "Jelentes bekuldese"}</button>
      </form>
    </div>
  );
}
