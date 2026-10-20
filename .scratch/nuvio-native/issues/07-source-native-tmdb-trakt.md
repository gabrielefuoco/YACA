Status: resolved
Type: research
Punto: P04, P16
Blocked by: —

# 07 — Source native TMDB/Trakt: cosa coprono davvero

## Domanda

Quanto dei preset YACA può diventare una source **nativa** Nuvio (TMDB/Trakt), senza addon, e quanto
resta necessariamente addon? Serve una tabella di copertura, non un’impressione: quali filtri nativi
esistono, quali mancano, quali preset sono multi-query o usano scoring YACA.

## Cosa deve uscire

Una nota in `ricerche/07-source-native-tmdb-trakt.md` con:

- **tipi nativi**: `LIST`, `COLLECTION`, `COMPANY`, `NETWORK`, `DISCOVER`, `PERSON`, `DIRECTOR`; per
  ognuno: input, filtri, sort, paginazione, ID.
- **filtri DISCOVER**: genres/withoutGenres, date, vote average/count, language, country, keywords,
  companies, networks, watch providers, year, sort. Cosa **non** c’è (runtime, status, seasons,
  certification, revenue/ROI, multi-query union, scoring bayesiano).
- **mappatura YACA**: per ogni categoria di preset (top, registi, attori, studio, network, franchise,
  genere, decade, mood, anime, watchlist, Trakt, custom) dire se è native-able, parziale o addon-only.
- **Trakt**: cosa serve per una source nativa (`traktListId`, `mediaType`, `sortBy`, `sortHow`); YACA
  ha/crea liste Trakt? Cosa manca.
- **fidelity**: cosa si perde in una source nativa (DNA, ITA, anime, ordinamento, dedup, rotazione).
- **regola**: “native se X, addon se Y”, con esempi.
- **percentuale stimata** di preset mappabili e lista dei non mappabili.

## Fonti primarie

- YACA: `src/catalog/presets.js`, `src/indice/filters.js`, `src/catalog/registry.js`,
  `src/stremio/manifest.js`.
- NuvioTV: `core/tmdb/TmdbCollectionSourceResolver.kt` (filtri e sort reali), resolver Trakt,
  `domain/model/Collection.kt`.
- Nuvio docs v1.3 + wiki Collections (source native).
- Kaptain collection pubblica, per esempi di pack 0-addon.

## Come si chiude

La nota è pronta quando:

1. la tabella dei tipi nativi è completa;
2. la mappatura copre tutte le categorie di preset YACA;
3. la percentuale è motivata, non arrotondata a caso;
4. la regola native/addon è chiara e ha esempi;
5. c’è una lista esplicita dei preset che non si possono native-izzare.

---

## Esito

**Risolto il 20/10/2026** — nota completa in
[`ricerche/07-source-native-tmdb-trakt.md`](../ricerche/07-source-native-tmdb-trakt.md).

- **Copertura**: 128/163 preset (78,5%) native-izzabili dall’editor; 133/163 (81,6%) accettando
  `sortBy=revenue.desc` via JSON; 26 parziali usabili; 4 addon-only come riga singola. Sul totale delle
  righe permanenti (190) la copertura scende a **67,4%**, perché hero, search e watchlist non hanno
  equivalente nativo.
- **Tipi nativi**: `LIST`, `COLLECTION`, `COMPANY`, `NETWORK`, `DISCOVER`, `PERSON`, `DIRECTOR`; solo
  `COMPANY`/`NETWORK`/`DISCOVER` leggono i `filters`; gli altri ordinano in memoria.
- **Buchi**: runtime, status libero, stagioni/episodi, certification, `without_tmdbIds`, collection
  multiple, cast/crew multipli, `permissive_recent`, `air_date` episodio, union multi-query, scoring
  bayesiano.
- **Trakt**: la source nativa legge solo liste **pubbliche**; YACA oggi legge dati personali ma **non
  crea liste**. Watchlist/history/ratings/favorites restano addon.
- **Scoperta**: la API v1.3 documenta solo `folders[].catalogSources` con `addonId`; `folders[].sources`
  con `provider`/`tmdbSourceType`/`filters` esiste nel client (`CollectionsDataStore.kt`) ma **non è
  contrattualizzato**. Il pack 0-addon dipende da uno schema non documentato: va verificato con il
  round-trip (ticket 02/11).
- **Regola**: native se è una singola query `discover` con filtri/sort nel set nativo e risultato
  impersonale; addon se serve DNA, ITA, anime, rotazione, dati personali, episodi o unione multi-query.

