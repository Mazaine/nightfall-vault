export type FeaturedAuction = {
  id: string;
  title: string;
  type: string;
  price: string;
  step: string;
  time: string;
  sellerName: string;
  sellerRating: string;
  buyNowPrice?: string;
  isClosed?: boolean;
  userIsOutbid?: boolean;
};

export const categories = [
  "Hatalom Kártyái Kártyajáték",
  "Pokemon",
  "One Piece",
  "Star Wars TCG",
  "Yu-gi-oh",
  "Magic the Gathering",
  "Egyéb",
];

export const conditionOptions = [
  "Frissen Bontott",
  "Újszerű",
  "Játszott",
  "Sérült",
  "Kopott",
  "Nyomdahibás",
];

export const featuredAuctions: FeaturedAuction[] = [
  {
    id: "arnyekhasito-kard",
    title: "Árnyékhasító Kard",
    type: "Hatalom Kártyái Kártyajáték",
    price: "125.000 Ft",
    step: "2.500 Ft",
    time: "02:15:42",
    sellerName: "Mira",
    sellerRating: "4,9 / 5",
    buyNowPrice: "180.000 Ft",
  },
  {
    id: "ejfeli-lovag-pancel",
    title: "Éjféli Lovag Páncél",
    type: "Magic the Gathering",
    price: "92.500 Ft",
    step: "2.000 Ft",
    time: "01:45:18",
    sellerName: "CardVault",
    sellerRating: "4,8 / 5",
  },
  {
    id: "lelekfogo-amulett",
    title: "Lélekfogó Amulett",
    type: "Pokemon",
    price: "48.750 Ft",
    step: "1.500 Ft",
    time: "03:22:09",
    sellerName: "Eszter",
    sellerRating: "5,0 / 5",
    buyNowPrice: "66.000 Ft",
  },
  {
    id: "elfeledett-grimoar",
    title: "Az Elfeledett Grimoár",
    type: "Yu-gi-oh",
    price: "36.000 Ft",
    step: "1.000 Ft",
    time: "05:10:33",
    sellerName: "NightDealer",
    sellerRating: "4,7 / 5",
  },
];

export const watchedAuctions: FeaturedAuction[] = [
  { ...featuredAuctions[0], userIsOutbid: true },
  { ...featuredAuctions[2], userIsOutbid: false },
  {
    id: "lezart-licit-pelda",
    title: "Lezárt licit példa",
    type: "Star Wars TCG",
    price: "27.250 Ft",
    step: "750 Ft",
    time: "Lezárva",
    sellerName: "ArchiveCards",
    sellerRating: "4,6 / 5",
    isClosed: true,
  },
];

export const ownAuctions: FeaturedAuction[] = [
  {
    id: "sajat-hkk-lap",
    title: "Saját HKK ritkaság",
    type: "Hatalom Kártyái Kártyajáték",
    price: "18.500 Ft",
    step: "500 Ft",
    time: "18:42:10",
    sellerName: "Te",
    sellerRating: "Nincs még értékelés",
    buyNowPrice: "30.000 Ft",
  },
  {
    id: "sajat-lezart-pelda",
    title: "Saját lezárt aukció",
    type: "One Piece",
    price: "75.000 Ft",
    step: "2.500 Ft",
    time: "Lezárva",
    sellerName: "Te",
    sellerRating: "Nincs még értékelés",
    isClosed: true,
  },
];
