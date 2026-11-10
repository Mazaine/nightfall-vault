import { formatMoney } from "../utils/format";
import { createPortal } from "react-dom";

export function FixedPurchaseDialog({
  title,
  unitPrice,
  quantity,
  maxQuantity,
  busy,
  onQuantityChange,
  onClose,
  onConfirm,
}: {
  title: string;
  unitPrice: string | number;
  quantity: number;
  maxQuantity: number;
  busy: boolean;
  onQuantityChange: (quantity: number) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const normalizedMax = Math.max(1, maxQuantity);
  const total = Number(unitPrice) * quantity;
  return createPortal(<div className="vault-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="vault-confirm-dialog fixed-purchase-dialog" role="dialog" aria-modal="true" aria-labelledby="fixed-purchase-title">
      <h2 id="fixed-purchase-title">Vásárlás megerősítése</h2>
      <p><strong>{title}</strong></p>
      <label>Mennyiség
        <select aria-label="Vásárlási mennyiség" value={quantity} disabled={busy} onChange={(event) => onQuantityChange(Number(event.target.value))}>
          {Array.from({ length: normalizedMax }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}
        </select>
      </label>
      <dl className="fixed-purchase-summary">
        <div><dt>Egységár</dt><dd>{formatMoney(unitPrice)}</dd></div>
        <div><dt>Végösszeg</dt><dd>{formatMoney(String(total))}</dd></div>
      </dl>
      <footer>
        <button className="button button-ghost" type="button" disabled={busy} onClick={onClose}>Mégse</button>
        <button className="button button-primary" type="button" disabled={busy} onClick={onConfirm}>{busy ? "Vásárlás…" : "Megveszem"}</button>
      </footer>
    </section>
  </div>, document.body);
}
