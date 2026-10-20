Status: open
Type: research
Punto: P17, P19, P16
Blocked by: 02

# 09 — Da YACA a Nuvio: mapping di preset, row e custom catalog

## Domanda

Come si traduce concretamente un profilo YACA in una o più collection Nuvio? Servono le regole di
mappatura — non solo “folder = catalogo” — per: preset editoriali, row dinamiche (DNA/grafo/AI/
watchlist/anime), custom catalog, watchlist e liste Trakt. Il risultato deve essere un esempio di pack
che il parser Nuvio accetterebbe.

## Cosa deve uscire

Una nota in `ricerche/09-yaca-collection-mapping.md` con:

- **modello di raggruppamento**: quando una collection per profilo, quando una per tema, quando una
  unica “YACA” con tante folder; cosa guadagna l’utente.
- **regole di mapping**:
  - preset editoriale → source native o folder addon (secondo 07);
  - `yaca_mondi_*`, `yaca_passo_fuori_*`, `yaca_uscite_nuove_*`, watchlist, anime → source addon;
  - custom catalog → source addon con `catalogId` stabile;
  - watchlist → folder addon o Trakt list (se disponibile);
  - liste Trakt → source native Trakt o folder addon.
- **ID e naming**: collection/folder ID deterministici (`yaca-<profile>-<catalog>`), catalog ID
  stabili, `addonId` unico, cosa succede se il profilo cambia.
- **un pack di esempio completo** (JSON) con almeno: una collection, 3–5 folder, una source native,
  una source addon, artwork segnaposto.
- **casi limite**: catalogs vuoti, anime Kitsu, multi-query, watchlist vuota, source nativa che richiede
  TMDB key.
- **cosa resta fuori**: row che non hanno senso in una collection (search-only, debug, admin).

## Fonti primarie

- YACA: `src/stremio/manifest.js`, `src/catalog/presets.js`, `src/catalog/registry.js`,
  `src/models/AddonConfig.js`, `src/models/UserConfig.js`, `frontend/src/types/index.ts`.
- Nuvio: docs Collections, `Collection.kt`, `CollectionsDataStore.kt`, `FolderDetailViewModel.kt`.
- Kaptain: collection pubblica e `collection-merge.js`, per vedere come sono raggruppate le folder.
- Xperience: “import catalogs” e “merged rows” per capire cosa la community si aspetta.

## Come si chiude

La nota è pronta quando:

1. c’è una regola per ogni tipo di catalogo YACA;
2. il pack di esempio è completo e coerente con lo schema Nuvio;
3. gli ID sono deterministici e documentati;
4. i casi limite hanno una risposta o sono marcati “da testare”;
5. c’è una lista di ciò che non va messo in una collection.
