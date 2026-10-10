import { KeyboardEvent, useId, useMemo, useState } from "react";

export type FilterOption = { value: string; label?: string };

export function normalizeFilterText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("hu-HU").trim();
}

export function MultiValueFilter({ label, options, selected, onChange, placeholder = "Keresés…" }: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const labels = useMemo(() => new Map(options.map((option) => [option.value, option.label || option.value])), [options]);
  const available = useMemo(() => {
    const needle = normalizeFilterText(query);
    return options.filter((option) => !selected.includes(option.value) && (!needle || normalizeFilterText(`${option.label || option.value} ${option.value}`).includes(needle)));
  }, [options, query, selected]);

  const choose = (value: string) => {
    if (!selected.includes(value)) onChange([...selected, value]);
    setQuery("");
    setActive(0);
    setOpen(true);
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, Math.max(available.length - 1, 0))); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter" && open && available[active]) { event.preventDefault(); choose(available[active].value); }
    else if (event.key === "Escape") setOpen(false);
    else if (event.key === "Backspace" && !query && selected.length) onChange(selected.slice(0, -1));
  };

  return <div className="vault-multi-filter">
    <label htmlFor={`${listboxId}-input`}>{label}</label>
    <div className="vault-multi-filter-field" onClick={() => document.getElementById(`${listboxId}-input`)?.focus()}>
      {selected.map((value) => <button type="button" className="vault-filter-chip" aria-label={`${label}: ${labels.get(value) || value} eltávolítása`} onClick={(event) => { event.stopPropagation(); onChange(selected.filter((item) => item !== value)); }} key={value}>{labels.get(value) || value}<span aria-hidden="true">×</span></button>)}
      <input id={`${listboxId}-input`} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={listboxId} aria-activedescendant={open && available[active] ? `${listboxId}-${active}` : undefined} value={query} placeholder={selected.length ? "További…" : placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 0)} onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }} onKeyDown={keyDown}/>
    </div>
    {open ? <div className="vault-multi-filter-options" id={listboxId} role="listbox" aria-label={`${label} lehetőségek`}>
      {available.length ? available.slice(0, 60).map((option, index) => <button id={`${listboxId}-${index}`} type="button" role="option" aria-selected="false" className={index === active ? "is-active" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option.value)} key={option.value}>{option.label || option.value}</button>) : <span>Nincs további találat.</span>}
    </div> : null}
  </div>;
}
