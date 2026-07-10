# Nightfall Vault Style Guide

## Cel

Ez a dokumentum a Nightfall Vault frontend vizualis es CSS-architekturajanak alapja. Sprint 1-ben a cel nem aukcios uzleti logika, hanem egy tartos, konzisztens, premium dark fantasy feluleti rendszer.

## Design filozofia

A Nightfall Vault legyen:

- dark fantasy
- modern
- elegans
- letisztult
- professzionalis
- gyorsan attekintheto

Nem cel a gamer vagy neon hatas. A referencia inkabb premium aukcios haz, mint jatekfelulet.

## CSS architektura

Az aktiv CSS belepesi pont:

```text
frontend/src/styles/index.css
```

Struktura:

- `tokens/`: nyers design tokenek.
- `themes/`: szemantikus tema aliasok.
- `base/`: reset, globalis szabalyok, animaciok.
- `utilities/`: ujrahasznalhato segedosztalyok.
- `components/`: komponenshez kotott CSS importok az `index.css` vegen.

## Szinek

Fo szemantikus tokenek:

- `--color-background`
- `--color-background-soft`
- `--color-surface`
- `--color-surface-elevated`
- `--color-surface-strong`
- `--color-border`
- `--color-divider`
- `--color-text-primary`
- `--color-text-secondary`
- `--color-text-muted`
- `--color-primary`
- `--color-primary-hover`
- `--color-primary-active`
- `--color-accent`
- `--color-success`
- `--color-warning`
- `--color-danger`
- `--color-info`
- `--color-overlay`
- `--color-backdrop`
- `--color-focus`

## Tipografia

Display es hero szovegek:

- `--font-family-display`
- `--font-size-display`
- `--font-size-h1`
- `--font-size-h2`
- `--font-size-h3`

Altalanos UI szovegek:

- `--font-family-body`
- `--font-size-body-lg`
- `--font-size-body`
- `--font-size-body-sm`
- `--font-size-caption`
- `--font-size-button`
- `--font-size-label`

## Spacing

A rendszer 8 pontos logikat kovet:

- `--space-1`: 4 px
- `--space-2`: 8 px
- `--space-4`: 16 px
- `--space-6`: 24 px
- `--space-8`: 32 px
- `--space-12`: 48 px
- `--space-16`: 64 px

## Lekerekitesek

Kartyak, gombok es panelek alapertelmezetten visszafogott, 8 px koruli radiusokat hasznalnak. A cel a premium, nem a jatekos megjelenes.

## Arnyekok

Tokenek:

- `--shadow-xs`
- `--shadow-sm`
- `--shadow-md`
- `--shadow-lg`
- `--shadow-xl`
- `--shadow-2xl`
- `--shadow-focus`

## Animaciok

Az animaciok finomak, 150-250 ms kozotti idotartammal. A `prefers-reduced-motion` tiszteletben tartasa kotelezo.

## Akadalymentesseg

Kovetelmenyek:

- lathato `:focus-visible`
- megfelelo kontraszt
- billentyuzettel elerheto interakciok
- ertelmes `aria-label` ikon gombokon
- dekorativ elemek `aria-hidden="true"` jelolessel

## Sprint 1 szabaly

Aktiv frontendben nem lehet:

- kosar logika
- checkout logika
- valos licitalasi logika
- admin uzleti workflow
- backend modositas

Ezek a webshop-sablonbol szarmazo reszek `frontend/src/_legacy/` alatt maradnak kesobbi referencia celra.
