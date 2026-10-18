# HKK lapváltozatok hitelesítése

Az automatikus import a hivatalos HKK Lapkereső konkrét kiadás-listáját veti össze a `Foilos újrakiadás`, `Fullart verzió` és `Gold verzió` szűrt találataival. A normál státusz a kiadás alaplistájából származik. Az import alapértelmezetten csak előnézetet készít, `--apply` kapcsolóval ír adatbázist, és kézzel hitelesített sort nem ír felül.

```powershell
python -m app.scripts.import_hkk_variants 264 "Promóciós lapok (2026)"
python -m app.scripts.import_hkk_variants 264 "Promóciós lapok (2026)" --apply
```

Ha a hivatalos kereső nem képes egy kiadás vagy kép egyértelmű gépi igazolására, az adminfelület CSV-importját kell használni. Kötelező fejléc:

```text
external_card_id,card_name,edition_id,edition_name,variant,status,image_url,source_url
```

A `variant` értéke `normal`, `foil`, `fa` vagy `gfa`; a `status` értéke `exists`, `absent` vagy `unknown`. Az alkalmazás előtt mindig futtasd az előnézetet. Production import külön, jóváhagyott üzemeltetési lépés; a migráció és a kód önmagában nem módosít felhasználói készletet.
