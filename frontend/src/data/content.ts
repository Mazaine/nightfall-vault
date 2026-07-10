export type FeaturedAuction = {
  id: string;
  title: string;
  type: string;
  price: string;
  step: string;
  time: string;
};

export const categories = [
  "Fegyverek",
  "Páncélok",
  "Varázstárgyak",
  "Gyűjtemények",
  "Egyéb",
];

export const featuredAuctions: FeaturedAuction[] = [
  {
    id: "arnyekhasito-kard",
    title: "Árnyékhasító Kard",
    type: "Legendás fegyver",
    price: "125.000 Ft",
    step: "2.500 Ft",
    time: "02:15:42",
  },
  {
    id: "ejfeli-lovag-pancel",
    title: "Éjféli Lovag Páncél",
    type: "Legendás páncél",
    price: "92.500 Ft",
    step: "2.000 Ft",
    time: "01:45:18",
  },
  {
    id: "lelekfogo-amulett",
    title: "Lélekfogó Amulett",
    type: "Ritka varázstárgy",
    price: "48.750 Ft",
    step: "1.500 Ft",
    time: "03:22:09",
  },
  {
    id: "elfeledett-grimoar",
    title: "Az Elfeledett Grimoár",
    type: "Ritka gyűjtemény",
    price: "36.000 Ft",
    step: "1.000 Ft",
    time: "05:10:33",
  },
];

export const activeAuctions = [
  ["Démonbőr Kesztyű", "18.500 Ft", "01:12:45"],
  ["Halhatatlanok Sisakja", "75.000 Ft", "02:05:12"],
  ["Vérhold Gyűrű", "27.250 Ft", "00:42:31"],
];
