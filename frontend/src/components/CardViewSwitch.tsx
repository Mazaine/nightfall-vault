type Mode = "grid" | "list";

type Props = {
  value: Mode;
  onChange: (mode: Mode) => void;
  label: string;
};

export function CardViewSwitch({ value, onChange, label }: Props) {
  return (
    <div className="vault-view-switch" role="group" aria-label={label}>
      <button type="button" className={value === "grid" ? "is-active" : ""} aria-pressed={value === "grid"} onClick={() => onChange("grid")}>Rács</button>
      <button type="button" className={value === "list" ? "is-active" : ""} aria-pressed={value === "list"} onClick={() => onChange("list")}>Lista</button>
    </div>
  );
}
