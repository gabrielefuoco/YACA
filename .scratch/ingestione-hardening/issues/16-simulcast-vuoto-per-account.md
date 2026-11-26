Status: resolved
Type: research
Priorità: P1 (il catalogo anime più visibile dell'addon è vuoto per l'account principale)
Blocked by: nessuno

# 16 — "Simulcast (Nuovi Episodi)" vuoto per l'account reale, ma non per un account di test

**Segnalato da**: il proprietario, 2026-11-25/26 — "il catalogo anime simulcast mi risulta vuoto".

## Cosa è accertato (misurato in produzione)

**I dati e il provider sono sani.**

- `anime_airing_state`: 1.016 documenti, **78 con `homeReleases` in finestra** (`getAiringEntries` → 78).
- `getAiringStateCatalog(0)` chiamato dentro l'app → **20 item** (es.
  `kitsu:49892 The All-Devouring Whale: Homecoming`, `kitsu:48834 Tougen Anki`, …); DuckDB ne idrata 36 su 78.
- `isItemAnime` su quegli item → **SI** per la maggior parte (8 su 10 nel campione), quindi il filtro
  anime non è la causa ovvia.

**L'endpoint però risponde diverso a seconda dell'account e dell'id.**

| richiesta | risultato |
|---|---|
| `/{sim_user_yaca}/catalog/series/preset_anime_simulcast.json` | **34 KB, item presenti** |
| `/{REOZrGNRr3}/catalog/series/preset_anime_simulcast/skip=0.json` | **12 byte → `{"metas":[]}`** |
| `/{REOZrGNRr3}/catalog/series/preset_anime_simulcast/skip=20.json` | **23.983 byte, 15 item** |
| `/{REOZrGNRr3}/catalog/series/yaca_preset_preset_anime_simulcast/skip=0.json` | **34.214 byte, 20 item** |
| `/{REOZrGNRr3}/catalog/series/yaca_preset_preset_anime_simulcast/skip=20.json` | 23.983 byte, 15 item |

Cioè: **lo stesso catalogo, con l'id lungo, funziona; con l'id corto (quello che il manifest dichiara)
no.** E il log dice che per l'id corto la build è di **35 ms con 0 titoli** (troppo veloce per aver
interrogato il provider), mentre per l'id lungo è 1.391 ms con 15-20 titoli.

**Escluso**:
- non è la cache Redis: nessuna chiave con `metas: []` per questo catalogo (le entry vuote che esistono
  hanno `ttl` 20 min e sono di altri cataloghi); un riavvio dell'app non cambia il risultato;
- non è il dispatch: `airingStateSourceEntry.appliesToCatalog` matcha `baseId === 'preset_anime_simulcast'`
  e `baseId` è identico per le due forme (`yaca_preset_` viene tolto in `CatalogRouter`);
- non è la pipeline anime (riparata oggi: health OK, 100 item per giro).

**Il profilo attivo** dell'account reale è `modo_anime` (`activeModo: anime`), con
`typeSelectors: {anime: null, film: false, serie: false}`, `catalogs: []` su **tutti** i profili (normale:
i cataloghi attivi stanno in `config.cataloghi` per modo). Il manifest dichiara
`preset_anime_simulcast` (id corto).

## Ipotesi da verificare (in ordine di probabilità)

1. **`catalogMeta`/`targetCatalog` risolti diversamente per le due forme di id**: per l'id corto la meta
   arriva dal config del profilo (o da `config.cataloghi`) senza `isAnime`/`_provider`, e il percorso
   `hasPostFetchFilter` finisce per scartare tutto, oppure `routeCatalogRequest` non trova la fonte e
   ritorna `[]` in 35 ms (la velocità depone per questa).
2. **`matchesFilters` e il tipo**: per `type: 'series'` accetta `tv|series`; se gli item arrivassero con
   `type: 'movie'` (anime-film in cima, ordinati per `lastAiredAt`) verrebbero scartati tutti. Da
   verificare sul lotto reale dei primi 20.
3. **Doppia normalizzazione dell'id** in un punto che non ho letto (`definition.js` risolve il provider da
   `queries[0].provider` o dall'id: `id === 'preset_anime_simulcast'` → `airing_state`), che per la forma
   lunga non scatta.

## Come chiuderlo in un colpo (strumentazione, non ipotesi)

Aggiungere **due righe di log** in `src/stremio/catalogHandler.js` dentro `fetchCatalog`, attive solo con
`process.env.CATALOG_DEBUG === '1'`:

```
[CatalogDebug] id=<id> baseId=<baseId> fonte=<source?.id ?? 'NESSUNA'> provider=<catalogMeta?._provider ?? effectiveMeta?._provider ?? '-'> isAnimeCatalog=<bool> selector=<animeSelector ?? '-'>
[CatalogDebug] id=<id> provider_out=<n> dopo_filtri=<m> dopo_dedup=<k> finali=<j>
```

Con quelle due righe si sa in un minuto se il vuoto nasce prima del provider (fonte non trovata) o dopo
(filtri). Il fix sarà di conseguenza: o il fallback su `effectiveMeta` nel registro, o un filtro che non
deve applicarsi ai cataloghi con `_provider === 'airing_state'` (la fonte *è* anime per costruzione).

## Nota sul perché è sfuggito

Nelle nove giornate di pipeline morta il catalogo era vuoto **per tutti**: nessuno poteva distinguere
"fonte vuota" da "percorso rotto". La riparazione della fonte ha reso visibile questo secondo difetto.


---
## Causa trovata e fix (2026-11-26)

Strumentando la produzione (patch del solo `catalogHandler` dentro il container, senza build) la risposta è
diventata chiara: **con l'id corto il percorso è identico a quello lungo** —
`catalogMeta._provider=airing_state`, `isAnimeCatalog=true`, provider 20 item, `isItemAnime` vero per 19,
`dopo_filtri=20`. Nessun bug di dispatch, nessun filtro che svuota.

Il problema era **la cache**: una risposta vuota (dei giorni in cui la fonte era morta) era stata memorizzata
e **riscritta a ogni richiesta**, quindi restava vuota per sempre anche dopo il ritorno dei dati. Il TTL di
20 minuti non aiutava, perché veniva continuamente rinfrescato dall'uso.

**Fix** (`6b22ae27`): `CacheManager.getOrFetch` accetta un `skipIf` opzionale; `catalogHandler` lo passa
**solo** per i cataloghi con provider `airing_state` e scarta il salvataggio quando `metas` è vuoto. Un
catalogo esterno vuoto è uno stato transitorio, non una verità da congelare. Gli altri cataloghi non
cambiano comportamento (un vuoto lì è una scelta dell'utente e va memorizzata).

Test: `tests/cacheManagerSkipIf.test.js` (3 casi: vuoto non memorizzato e ricostruito, pieno memorizzato,
senza `skipIf` comportamento invariato). Suite completa: **200 suite / 1988 test**.

Verifica in produzione (account reale `REOZrGNRr3`): `preset_anime_simulcast` → **34.214 byte, 20 item**;
`preset_pop_anime` 21.858 byte; `preset_anime_movies_top` 22.796 byte; `yaca_watchlist_anime` 13.512 byte.

## Lezione

Il ticket diceva "il catalogo è vuoto per colpa di un filtro o del dispatch". Era la terza ipotesi, quella
che nessuno guarda: **la cache che si rinfresca da sola su una risposta sbagliata**. Un degrado transitorio
della fonte non deve diventare uno stato persistente; il `ponytail:` qui è che la regola vale solo per il
catalogo airing, dove il vuoto è per definizione sospetto.
