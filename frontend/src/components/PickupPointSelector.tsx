import { useEffect, useMemo, useState } from "react";
import { getPickupPoints } from "../api/pickupPoints";
import type { Carrier, PickupPoint } from "../types";
import "./PickupPointSelector.css";

type PickupPointSelectorProps = {
  selectedCarrier?: Carrier;
  selectedPickupPoint?: PickupPoint | null;
  onSelect: (pickupPoint: PickupPoint) => void;
};

const carrierOptions: { value: Carrier; label: string }[] = [
  { value: "foxpost", label: "Foxpost" },
  { value: "mpl", label: "MPL / Postapont" },
];

function formatOpeningHours(openingHours: unknown): string | null {
  if (!openingHours) {
    return null;
  }

  if (typeof openingHours === "string") {
    return openingHours;
  }

  if (typeof openingHours === "object" && openingHours !== null) {
    const dayLabels: Record<string, string> = {
      "1": "H",
      "2": "K",
      "3": "Sze",
      "4": "Cs",
      "5": "P",
      "6": "Szo",
      "7": "V",
    };

    return Object.entries(openingHours as Record<string, unknown>)
      .map(([day, value]) => `${dayLabels[day] ?? day}: ${String(value)}`)
      .join(", ");
  }

  return String(openingHours);
}

function shorten(value: string | null, maxLength = 130): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trim()}...`;
}

export function PickupPointSelector({
  selectedCarrier = "foxpost",
  selectedPickupPoint = null,
  onSelect,
}: PickupPointSelectorProps) {
  const [carrier, setCarrier] = useState<Carrier>(selectedCarrier);
  const [search, setSearch] = useState("");
  const [points, setPoints] = useState<PickupPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalSelectedPoint, setInternalSelectedPoint] = useState<PickupPoint | null>(
    selectedPickupPoint,
  );

  const activeSelectedPoint = selectedPickupPoint ?? internalSelectedPoint;

  const searchDescription = useMemo(
    () => (carrier === "foxpost" ? "Foxpost automaták" : "MPL / Postapont automaták"),
    [carrier],
  );

  useEffect(() => {
    setCarrier(selectedCarrier);
  }, [selectedCarrier]);

  useEffect(() => {
    setInternalSelectedPoint(selectedPickupPoint);
  }, [selectedPickupPoint]);

  useEffect(() => {
    let isCancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);

      getPickupPoints({
        carrier,
        search: search.trim() || undefined,
        limit: 30,
      })
        .then((response) => {
          if (!isCancelled) {
            setPoints(response);
          }
        })
        .catch(() => {
          if (!isCancelled) {
            setError("Az automaták betöltése nem sikerült. Próbáld újra később.");
            setPoints([]);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoading(false);
          }
        });
    }, 250);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [carrier, search]);

  function selectPickupPoint(point: PickupPoint) {
    setInternalSelectedPoint(point);
    onSelect(point);
  }

  return (
    <section className="pickup-selector" aria-label="Átvételi pont választó">
      <div className="pickup-selector__header">
        <div>
          <p className="eyebrow">Átvételi pont</p>
          <h2>Automata keresése</h2>
          <p>{searchDescription} keresése város, irányítószám, név vagy cím alapján.</p>
        </div>
      </div>

      <div className="pickup-selector__controls">
        <fieldset>
          <legend>Szolgáltató</legend>
          <div className="pickup-selector__carrier-options">
            {carrierOptions.map((option) => (
              <label key={option.value}>
                <input
                  type="radio"
                  checked={carrier === option.value}
                  onChange={() => setCarrier(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="pickup-selector__search">
          <span>Keresés</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Város, irányítószám, automata neve vagy cím"
          />
        </label>
      </div>

      {activeSelectedPoint ? (
        <article className="pickup-selector__selected">
          <span>Kiválasztott automata</span>
          <strong>{activeSelectedPoint.name}</strong>
          <p>
            {[activeSelectedPoint.zip, activeSelectedPoint.city, activeSelectedPoint.address]
              .filter(Boolean)
              .join(" ")}
          </p>
        </article>
      ) : null}

      <div className="pickup-selector__results">
        {isLoading ? <div className="pickup-selector__state">Automaták betöltése...</div> : null}
        {error ? <div className="pickup-selector__error">{error}</div> : null}
        {!isLoading && !error && points.length === 0 ? (
          <div className="pickup-selector__state">Nincs találat.</div>
        ) : null}

        {!isLoading && !error ?
          points.map((point) => {
            const openingHours = formatOpeningHours(point.opening_hours);
            return (
              <article className="pickup-point-card" key={`${point.carrier}-${point.id}`}>
                <div>
                  <h3>{point.name}</h3>
                  <p>
                    {[point.zip, point.city, point.address].filter(Boolean).join(" ")}
                  </p>
                  {openingHours ? <small>Nyitvatartás: {openingHours}</small> : null}
                  {point.comment ? <small>{shorten(point.comment)}</small> : null}
                </div>
                <button type="button" onClick={() => selectPickupPoint(point)}>
                  Kiválasztom
                </button>
              </article>
            );
          })
        : null}
      </div>
    </section>
  );
}
