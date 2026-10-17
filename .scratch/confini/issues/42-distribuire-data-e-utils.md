Status: needs-triage
Type: task

# 42 — Distribuire `data/` e nominare `utils/` (parti 2–3 del ticket 37)

## Perché

Il ticket 37 ha fatto la **parte 1** (la superficie vecchia ritirata). Le parti 2 e 3 erano state rimandate perché
spostavano file dentro `src/catalog/**` e `src/indice/**`, che erano il territorio di altri ticket in corso.
Adesso quei territori sono liberi.

## Cosa deve uscire

1. **`src/data/`**: dopo il ticket 32 restano `presets.js` (544), `filters.js` (269), `keywordIds.js` (140) e
   `itaAnnotations.js` (226) oltre agli asset. I **preset sono del catalogo** (decisione 23: le righe hero sono
   preset di sistema), i **filtri** del catalogo/profilo. In `data/` devono restare **solo gli asset**.
2. **`src/utils/`** (25 file): i pezzi poster (`libraryPosterRefresh`, `posterResolver` ≈ 340) vanno nel **modulo
   poster**; l'impianto condiviso — `retry`, `resultMerger`, `LRUCache`, `axiosClient`, `mongoConnect`,
   `rateLimiter`, `logger` ≈ 580 righe — va **nominato** (`src/infra/`); il resto (`helpers`, `kidsModeFilters`,
   `requestHash`, `contentId`, `dnaRarity`, `dnaExtractor`) va **assegnato a chi lo usa o cancellato**.
   **Nota**: `src/utils/tmdb*` è vivo e usato dal prodotto — non è roba da spostare a cuor leggero (il ticket 34
   l'ha dichiarato).
3. **La prova**: `grep` a zero per i percorsi vecchi, e **il conteggio in righe di `data/` e `utils/` prima e
   dopo**, scritto nell'Esito.

## Attenzione

`src/data/presets.js` è importato da mezza applicazione (catalogo, configuratore, stremio): è un **trasloco**, e
va fatto con lo stesso metro del ticket 28 — ripuntare i consumatori **e dimostrarlo con il `grep`**, non
spostare e sperare.
