# Nightfall Vault - Desktop mappaegységesítés

Dátum: 2026-07-11

## Cél

A Desktopon több korábbi Nightfall Vault munkamappa, backup és részleges helyreállítási mappa maradt. A cél az volt, hogy a napi fejlesztéshez csak egyértelmű aktív projektmappa maradjon láthatóan használatban, a szükséges mentések pedig egy közös archive mappába kerüljenek.

## Aktív projektmappa

Az egyetlen szerkesztendő aktív projektmappa:

```text
C:\Users\Eszti\Desktop\nightfall-vault
```

Ellenőrzött HEAD a rendezéskor:

```text
1479d9d40c8074f1558239ea4ead70b835902883
```

A Git munkafa tiszta volt a rendezés után.

## Megtartott archive mappa

A korábbi mentések ide kerültek:

```text
C:\Users\Eszti\Desktop\nightfall-vault-archives
```

Megőrzött tartalom:

- `nightfall-vault-backup-20260710-1326`: teljes régi backup, `.git` könyvtárral együtt.
- `nightfall-vault-local-changes-20260710-1326`: redaktált patch és untracked helyi módosításmentés.

Ezeket nem szabad Gitbe, felhőbe vagy megosztott tárhelyre feltölteni, mert a teljes backup régi lokális állapotot őrizhet.

## Törölt felesleges mappák

Az alábbi redundáns vagy elavult Desktop mappák törölve lettek:

- `nightfall-vault-history-clean-20260710`: a history-clean munka már beépült és pusholva lett.
- `nightfall-vault-old-20260710-1814`: duplikált régi konfliktusos mappa, amelyből teljes backup már megmaradt.
- `nightfall-vault-partial-20260710-181711`: üres részleges mappacsere-maradék.

## Jelenlegi Desktop állapot

A rendezés után Nightfall névvel ezek maradtak a Desktopon:

- `nightfall-vault`
- `nightfall-vault-archives`
- `NIGHTFALL_VAULT_CURRENT_STATE.md`

## Követendő szabály

Fejlesztéskor kizárólag ezt kell szerkeszteni:

```text
C:\Users\Eszti\Desktop\nightfall-vault
```

Az archive mappa csak visszakeresésre szolgál, aktív fejlesztésre nem.
