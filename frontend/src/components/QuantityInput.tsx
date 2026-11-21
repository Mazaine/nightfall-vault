import { useEffect, useState } from "react";

/** Bounded numeric control without rendering thousands of option elements. */
export function QuantityInput({ value, max, disabled, label, onChange }: { value: number; max: number; disabled?: boolean; label: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const number = Number(draft);
    if (Number.isInteger(number) && number >= 1 && number <= max) {
      if (number !== value) onChange(number);
    } else setDraft(String(value));
  }
  return <input type="number" min={1} max={Math.max(1, max)} step={1} aria-label={label} value={draft} disabled={disabled} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />;
}
