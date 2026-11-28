# Audit 2 — snellire e accelerare il perimetro vivo

**Data**: 28 novembre 2026 · **Base**: `ef4fdcc5` · Cinque audit agy in parallelo: ricerca, serving Stremio, API/Mongo, infra/cache/poster, frontend. Regola del giro: **nessuna feature persa** — se un taglio cambia il comportamento, non si applica, si annota.

Rapporti integrali in `.scratch/audit2/` (`1-ricerca.md` … `5-frontend.md`).

---

## Applicato subito (verificato, misurato, a rischio zero)

| cosa | prima | dopo |
|---|---|---|
| **`getPresets()` ricostruito a ogni richiesta** | 163 preset con quattro date calcolate, map + sort ricorsivi, chiamato da manifest, risoluzione id, definizione catalogo, `catalogKind` | costruito **una volta al giorno** (le date cambiano a mezzanotte): seconda chiamata **0 ms**, stesso oggetto |
| **`tier2_titles.parquet`** | 46 MB e 1,5 M righe riscritti a ogni ricostruzione, letti da nessuno (la ricerca usa `titles_fts5.db`) | non si scrive più: via `COPY`, `replaceFile`, i campi delle statistiche |
| **Due componenti frontend morti** | `ProfileManager.tsx` + `ProfileSettingsDialog.tsx`, 445 righe, **0 import** | rimossi; `tsc --noEmit` pulito |
| **Lock DuckDB** (dal giro precedente, verificato sul campo) | il daemon apriva il DB vivo all'avvio → `Conflicting lock`, tre tentativi, app senza indice nella finestra sbagliata | il daemon lavora **solo su staging**; sul riavvio: **0** conflitti nei log di entrambi i container |

---

## Backlog ordinato per (impatto × sicurezza)

### A. Vinci di velocità, primo blocco (basso rischio, da applicare con misura prima/dopo)

| # | cosa | guadagno atteso | area |
|---|---|---|---|
| A1 | **Fallback linguistico non in cache** in `getTmdbMetaDetails`: su una pagina calda si rifanno 20–40 chiamate TMDB vere invece di leggere la cache | è il costo dominante della ricerca testuale (200–800 ms, tetto 3,5 s) | `src/clients/tmdb.js`, `src/ricerca/tier2Enrich.js` |
| A2 | **`semiDaGrafo` chiede 100 id e ne serve 20**, e ogni riga viene `JSON.parse`-ata 5–7 volte per campi che non si usano | ~700 parse → 140 per pagina su `simili` | `src/ricerca/compilatore.js`, `src/indice/duckDbProvider.js` |
| A3 | **`idratazione.js`: `rateLimitedMap` con `delayMs: 150`** applicato a ricerche *locali* (nessuna rete) | ~900 ms per pagina | `src/stremio/providers/` |
| A4 | **`semiTitoli`**: 150–200k confronti lineari per risolvere un titolo | la risoluzione dei semi passa da ~9 ms a ~1 (indice per token) | `src/ricerca/semiTitoli.js` |
| A5 | **`sanitizeCatalogMeta` due volte per item** + 20–40 `statSync` sincroni per pagina (badge/ITA) | blocchi dell'event loop su ogni catalogo | `src/stremio/formatters/`, `src/catalog/badges.js` |

### B. Snellimento sicuro (cancellazioni verificate, zero chiamanti)

| # | cosa | righe |
|---|---|---|
| B1 | export morti in `src/stremio/**` (`shelfPresentation`, `catalogContentParams`, `buildCatalogCacheKey`, `getManifestHeroCatalogs`, `getHeroCatalogModes`, `getRegistryHash`, `validatePreviewResponse`, `getAllSourceCapabilities`…) | ~230 |
| B2 | `pushToStremioLibrary`, `scomponiPosterComposto`, `hydrateResultsFromLocalDetailsCache`, `TraktProvider.js`, `paginationHelper.js` | ~300 |
| B3 | stub `search`/`appliesToSearch` sulle 5 fonti non-testo di `registry.js`; 15 helper `F.*`/`G.*` morti + `entities.json` letto e mai usato | ~90 |
| B4 | wrapper `src/infra/` a un solo chiamante (`logger`, `paginationHelper`, `normalizedSchema`…), cache rotte (`movieMetaCache`, `seriesMetaCache`, `defaultCache`, `aiDiscoveryCache`, `erdbHeadCache`) | ~275 |
| B5 | `TmdbBudgetTracker` completo + interceptor axios (in produzione `TMDB_CAP_LIMIT` **non è impostata**: è un no-op di 310 righe) | ~310 |
| B6 | rami morti del frontend (`gusti`/`creator`/`library` in `DashboardPage`, export legacy in `useProfiles`) | ~390 |

### C. Dove serve una decisione tua (non li tocco da solo)

| # | cosa | perché serve una decisione |
|---|---|---|
| C1 | `POST /api/preview-catalog` (266 righe) superato da `/api/configurazione/anteprima` | è un'API pubblica: la usano le mie sonde (`.scratch/ricerca-senza-llm/giro-ricerche.js`) e forse tool tuoi |
| C2 | 7 rotte legacy in `api/stremio.js` (`/stremio-auth`, `/check-user`, `/trakt/device/*`, `/sync-status`, `/images/fallback`) | l'audit le dà per morte, ma `/images/fallback` ha un test dedicato nato da un guasto reale (poster neri in cache Stremio) e le rotte Trakt sono il flusso di autenticazione: da verificare col frontend e con Stremio |
| C3 | `src/api/tmdb.js` (5 rotte, 124 righe) + route legacy in `index.js` | una di queste è segnalata con un **IDOR** (`/api/configure` senza controllo di proprietà): va guardata come sicurezza, non come pulizia |
| C4 | `catalogRequestCache` con `ramMax: 0` (nessuna cache in RAM, tutto su Redis) | sembra una svista, ma Redis è locale e la differenza è ~1 ms: si cambia solo dopo una misura di hit rate |

---

## Numeri del giro

- Tagli individuati: **~4.100 righe** (A+B), di cui **445 già rimosse** oggi.
- Vinci di velocità individuate: 5 nel blocco A, tutte sulla ricerca/serving (la parte che l'utente aspetta).
- Feature a rischio: **solo** in C (rotte pubbliche), nessuna nel blocco B.

## Cosa ho verificato io, contro i rapporti

Tre proposte sono state respinte leggendo il codice:

- `catalogRequestCache ramMax: 0` → non è un bug: Redis locale, il guadagno non giustifica il rischio.
- `/images/fallback` → non è codice morto: ha un test nato da un guasto vero (Stremio mette in cache gli errori, 172 titoli su 117k restavano neri).
- `ProfileManager`/`ProfileSettingsDialog` → **confermati** morti (0 import, `tsc` pulito dopo la rimozione).
