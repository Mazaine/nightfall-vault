# 🎨 Nightfall Vault – Style Guide

## Cél

A Style Guide célja, hogy a Nightfall Vault teljes felülete egységes megjelenésű legyen.

Minden új oldal, komponens és funkció ennek a dokumentumnak megfelelően készül.

---

# Design filozófia

A Nightfall Vault megjelenése:

* Dark Fantasy
* Modern
* Letisztult
* Elegáns
* Professzionális
* Gyorsan átlátható

Nem cél a túlzsúfolt felület.

A dizájn mindig támogassa a használhatóságot.

---

# Színpaletta

## Elsődleges színek

| Név            | Hex     |
| -------------- | ------- |
| Primary        | #7C3AED |
| Primary Hover  | #8B5CF6 |
| Primary Active | #6D28D9 |

---

## Háttérszínek

| Név           | Hex     |
| ------------- | ------- |
| Background    | #0B0B0F |
| Surface       | #15151C |
| Surface Light | #1E1E28 |

---

## Szövegszínek

| Név            | Hex     |
| -------------- | ------- |
| Primary Text   | #FFFFFF |
| Secondary Text | #B3B3C2 |
| Muted          | #7A7A8A |

---

## Állapotszínek

| Állapot | Hex     |
| ------- | ------- |
| Success | #22C55E |
| Warning | #F59E0B |
| Error   | #EF4444 |
| Info    | #3B82F6 |

---

# Betűtípusok

## Címsorok

Cinzel

Használat:

* Logo
* Oldalcímek
* Hero szekció
* Aukció címek

---

## Szövegek

Inter

Használat:

* Leírások
* Űrlapok
* Menü
* Táblázatok

---

# Térközök

8 pontos rendszer.

| Méret | Pixel |
| ----- | ----- |
| XS    | 4 px  |
| SM    | 8 px  |
| MD    | 16 px |
| LG    | 24 px |
| XL    | 32 px |
| XXL   | 48 px |
| XXXL  | 64 px |

---

# Lekerekítések

| Elem   | Méret |
| ------ | ----- |
| Gomb   | 10 px |
| Kártya | 16 px |
| Input  | 10 px |
| Modal  | 20 px |

---

# Árnyékok

## Kártya

Finom árnyék.

## Modal

Erősebb árnyék.

## Hover

Enyhe lila fény.

---

# Gombok

## Primary

* Lila háttér
* Fehér szöveg

## Secondary

* Átlátszó
* Lila keret

## Danger

* Piros háttér

## Ghost

* Háttér nélkül

---

# Űrlapok

Minden input:

* egységes magasság
* jól látható fókusz állapot
* hibajelzés pirossal
* siker zölddel

---

# Kártyák

Minden kártya:

* lekerekített
* árnyékos
* hover animáció
* reszponzív

---

# Ikonok

Használt ikoncsomag:

* Lucide Icons

Ikonok mindig:

* egyszerűek
* egységes méretűek
* jól olvashatóak

---

# Animációk

Maximum 200–300 ms.

Kerülendő:

* villogás
* túl sok animáció
* hosszú átmenetek

---

# Reszponzív töréspontok

| Eszköz  | Méret        |
| ------- | ------------ |
| Mobil   | < 640 px     |
| Tablet  | 640–1023 px  |
| Laptop  | 1024–1439 px |
| Desktop | ≥ 1440 px    |

A fejlesztés Mobile First szemléletben történik.

---

# Képek

Minden kép:

* optimalizált
* lazy loading
* megfelelő képarány
* modern formátum (WebP vagy AVIF, ahol lehetséges)

---

# Akadálymentesség

A projekt célja megfelelni a WCAG ajánlásainak.

Alapelvek:

* megfelelő kontraszt
* billentyűzetes navigáció
* fókuszjelölés
* ARIA attribútumok használata
* képek alt szöveggel

---

# Komponens alapelvek

Minden komponens:

* egyetlen feladatot lásson el
* újrafelhasználható legyen
* jól dokumentált legyen
* könnyen tesztelhető legyen

---

# Kódolási szabály

A dizájnnal kapcsolatos értékek (színek, térközök, betűméretek, árnyékok) ne legyenek szétszórva a komponensekben.

Lehetőleg központi helyen (például CSS változók vagy design tokenek formájában) legyenek definiálva, hogy a teljes alkalmazás egységes maradjon.

---

# Vizuális cél

A Nightfall Vault hangulata olyan legyen, mintha egy ősi, mágikus ereklyéket őrző páncélterembe vagy kincstárba lépnénk be.

A felület legyen elegáns és modern, ugyanakkor könnyen használható és gyors, hogy a látvány soha ne menjen a felhasználói élmény rovására.
