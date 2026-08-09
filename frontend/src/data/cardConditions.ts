export const CARD_CONDITIONS = [
  { value: "M", nameHu: "Tökéletes", nameEn: "Mint", description: "Kiemelkedően hibátlan példány: kopás, karc, él- vagy sarokhiba szabad szemmel nem látható." },
  { value: "NM", nameHu: "Újszerű", nameEn: "Near Mint", description: "Nagyon szép állapot, legfeljebb egészen enyhe, kezelésből eredő apró nyommal." },
  { value: "EX", nameHu: "Kiváló", nameEn: "Excellent", description: "Kisebb felületi vagy élsérülés előfordulhat, de a kártya összhatása tiszta és megkímélt." },
  { value: "GD", nameHu: "Jó", nameEn: "Good", description: "Jól látható használati nyomok lehetnek rajta, de nincs súlyos sérülése és rendeltetésszerűen használható." },
  { value: "LP", nameHu: "Enyhén játszott", nameEn: "Light Played", description: "Több kisebb kopás, karc vagy élhiba látható, hajtás és komoly szerkezeti sérülés nélkül." },
  { value: "PL", nameHu: "Játszott", nameEn: "Played", description: "Erősebb kopás, karc, elszíneződés vagy kisebb hajlás is jelen lehet; gyűjtői állapota már gyengébb." },
  { value: "PO", nameHu: "Rossz", nameEn: "Poor", description: "Súlyosan viselt példány, jelentős kopással, hajlással, gyűrődéssel vagy más komoly sérüléssel." },
] as const;

export type CardCondition = typeof CARD_CONDITIONS[number]["value"];
export type LegacyCardCondition = "fresh" | "like_new" | "played" | "damaged" | "worn" | "misprint";
export type ReadableCardCondition = CardCondition | LegacyCardCondition;

const LEGACY_CONDITION_MAP: Record<LegacyCardCondition, CardCondition> = {
  fresh: "NM",
  like_new: "NM",
  played: "PL",
  damaged: "PO",
  worn: "PO",
  misprint: "PO",
};

export function getCardCondition(value: ReadableCardCondition) {
  const normalized = value in LEGACY_CONDITION_MAP ? LEGACY_CONDITION_MAP[value as LegacyCardCondition] : value;
  return CARD_CONDITIONS.find((item) => item.value === normalized) ?? CARD_CONDITIONS[CARD_CONDITIONS.length - 1];
}

export function formatCardCondition(value: ReadableCardCondition) {
  const item = getCardCondition(value);
  return `${item.nameHu} (${item.value})`;
}
