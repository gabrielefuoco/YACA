Status: needs-triage
Type: task

# 41 — Il sostituto della catena ibrida (l'ultimo modulo da costruire)

## Perché

Il ticket 39 ha misurato che i provider **nuovi** del catalogo (`HybridProvider`, `AiDiscoveryProvider`)
dipendono dal **vecchio motore** per 2.670 righe:

```
catalog/providers/HybridProvider ─→ engines/hybridRecommendations (459)
                                  ─→ pool (655)
                                  ─→ engines/hybrid/dataFetchers (417)
                                  +  engines/hybrid/catalogStrategies (1.599)
```

Finché quella catena esiste, il vecchio stack (5.879 righe) **non si può cancellare** — non perché serva le rotte
vecchie, ma perché serve **i provider nuovi**. L'inventario di cosa fa ognuno dei cinque file è nella sezione
`## Inventario della catena ibrida` del ticket 39: le quattro strategie hero di gusto (`true_blend`,
`seed_network`, `hidden_gems`, `trakt_filtered`), cosa coprono già i moduli nuovi (il servizio del grafo,
`src/indice/`, `src/profile/`, `src/ricerca/`) e cosa manca.

## Cosa deve uscire

1. **Il fornitore dei candidati** nel motore nuovo: liste spiegate per gusto/mondo, dal servizio del grafo o da
   query parametrizzate su `src/indice/` — senza passare dallo scoring monolitico.
2. **La sincronizzazione Trakt/Stremio** dentro `src/library/` (che possiede i fatti e la cronologia).
3. **`src/pool/index.js` semplificato**: le strategie esclusive ricevono le liste direttamente; restano
   l'invariante di assegnazione disgiunta (`claimedIds`) e la formattazione Stremio.
4. **La prova**: i conteggi delle righe hero **prima e dopo** (le stesse sonde del ticket 38 di `suggerimenti`),
   e i 21 file di test del vecchio stack ripuntati o cancellati con lui.

## Ordine e dipendenze

È **lavoro di prodotto**, non pulizia: è il motore che produce i cataloghi che l'utente vede. Va dopo il deploy
del ticket 30 (così si misura su dati veri) e prima della cancellazione del vecchio stack.

## Handoff e stato (18/10/2026)

Il piano operativo completo è in **`C:\Users\gabri\AppData\Local\Temp\handoff-catena-ibrida.md`**: numeri verificati,
le cinque cose che mancano, i sei passi con la loro prova, gli invarianti da non rompere e le **11 trappole** pagate
in un giorno.

Le cifre da usare sono misurate, non stimate: la catena sono **3.169 righe** (`hybridRecommendations` 462 +
`pool` 693 + `dataFetchers` 416 + `catalogStrategies` 1.598), il serving è **1.717** (`catalogHandler` 1.037 +
`metaHandler` 680), il vecchio stack intero **5.098**.

## Stato aggiornato (18/10/2026, dopo il ticket 42)

`src/` = **157 file, 37.193 righe**. Il vecchio stack è **5.098** (invariato: il 42 ha distribuito, non tolto
motore), la catena ibrida è **3.169**. `src/data/` non ha più file `.js` (solo asset), `src/utils/` è sceso a
**6 file** (solo il cluster `tmdb*`, vivo), e la casa nuova è `src/infra/` (10 file, 854 righe).

Due note di integrazione che il prossimo deve conoscere: la porta di `src/infra` **spalma** gli export (per un
costruttore serve `const { LRUCache } = require('../infra')`), e la porta del **catalogo** non riesporta
`filters`/`presets`/`kidsModeFilters`/`contentId` — debito aperto.

## Esito (prima fetta: fornitore + hidden_gems)

### 1. La forma della porta dei candidati
- **Collocazione**: nel modulo che possiede i dati, `src/indice/candidati.js`, esposto attraverso la porta pubblica `src/indice/index.js` tramite `indice.candidati(contesto, opzioni)` e l'alias semantico `indice.candidatiPerGusto(contesto, opzioni)`.
- **Firma del verbo**:
  ```javascript
  async candidati(contesto, { mediaType = 'movie', strategia = 'hidden_gems', limit = 100 } = {})
  ```
- **Contratto di ritorno**: **non solleva mai eccezioni** (degrado morbido in `motivi[]`), restituendo candidati spiegati:
  ```javascript
  {
      candidati: [
          {
              id: string,          // ID TMDB normalizzato
              motivo: string,      // Spiegazione (es. 'gemma_nascosta:vsm_alta_affinita', 'seme_cronologia', ...)
              punteggio: number,   // Score normalizzato (0.0 - 10.0)
              genres: string[],    // Generi per diversità
              genre_ids: number[]
          }
      ],
      items: [ ... ],            // Alias per i consumatori
      motivi: string[]           // Tracciamento diagnosi o degrado
  }
  ```
- **Moduli nuovi utilizzati esclusivamente**:
  - `src/indice/` (`compiler.js` per filtri dichiarativi preparati e `duckDbStore.js` per le query analitiche)
  - `src/profile/ProfileScorer` per lo scoring VSM e `applyDiversityCaps`
  - `src/library/` (`semiDi` per i semi pesati reali da cronologia/watchlist)
  - `src/anime/` (`isItemAnime`, `ANIME_POLICY_MODES`, `isAnimeContent` per politica e marcatori)
- **Contesto risolto rispettato**: riceve `contestoDi` (`selettoriEffettivi`, `kidsMode`, `sliders`). Non re-risolve nulla e non esegue fallback su selettori grezzi (Decisione 21).

### 2. La strategia `hidden_gems` dietro switch
- In `src/pool/index.js`: la voce `hidden_gems` dell'array `HERO_STRATEGIES` valuta `isNewHiddenGemsActive()`:
  - **OFF** (`FLAG_NUOVA_CATENA_HIDDEN_GEMS !== 'true'`): esegue il codice originale invariato (`runPoolBuilder(buildHiddenGemsCatalog, ...)`).
  - **ON** (`FLAG_NUOVA_CATENA_HIDDEN_GEMS === 'true'` o `setFlagNewHiddenGems(true)`): esegue `buildHiddenGemsOnNewProvider(ctx)` interrogando `indice.candidati`.
- Stessa forma in uscita per il compositore del pool: array di `{ id, matchScore, motivo, punteggio, genres }` con proprietà compatibili sia per accesso array che per destrutturazione `{ ids, meta }`.

### 3. I numeri della misura (dati reali DuckDB Parquet)
Misurazione eseguita sui dati parquet reali (`movies.parquet` e `tv.parquet`):

| Media | OFF Count | ON Count | Intersezione | Unione | Indice Jaccard |
|---|---|---|---|---|---|
| **Film (`movie`)** | **98** | **77** | 14 | 161 | **0.0870** (~8.7%) |
| **Serie (`series`)** | **100** | **55** | 4 | 151 | **0.0265** (~2.65%) |

- **Verifica Invariante del Pool (`claimedIds`)**: Con switch ON, `assignHeroPools` ha completato l'assegnazione disgiunta dell'intero feed hero (369 titoli totali assegnati). `duplicateFound` è risultato **`false`** (zero duplicati tra le righe hero), e il catalogo `yaca_hidden_gems_movies` ha ricevuto **69 titoli** assegnati disgiunti (la riga è pienamente popolata, mai vuota).
- **Perché la differenza è spiegabile**:
  1. Il vecchio motore (`buildHiddenGemsCatalog` in `catalogStrategies.js`) usava `fetchSmartAndPool` basato su partizionamento L2 e keyword del vecchio `scoringEngine`. Quando il profilo non ha cluster specifici, ripiega su `fetchHiddenGemsFallbackIds` ordinato per popolarità decrescente pura (`popularity.desc`).
  2. Il nuovo motore (`candidati` in `src/indice/candidati.js`) compila filtri dichiarativi con ordinamento per qualità bayesiana (`S.QUALITY`: media bayesiana ponderata + popolarità secondaria), valuta l'affinità VSM e filtra tramite `isHiddenGemAlignedWithProfile` e `applyDiversityCaps` (massimo 10 per genere, 3 per regista, 3 per filone narrativo).
  3. I 14 titoli in comune rappresentano i titoli ad alta popolarità (vicini al cap di 20.0) condivisi; i restanti titoli del nuovo percorso sono titoli a maggiore merito qualitativo/VSM e maggiore diversità tematica.

### 4. Le suite di test eseguite (tutte verdi, eseguite singolarmente)
- `npx jest tests/candidateProvider.test.js --forceExit`: **7 passed**, 7 total (5.1s)
- `npx jest tests/poolHiddenGemsSwitch.test.js --forceExit`: **4 passed**, 4 total (4.7s)
- `npx jest tests/heroPoolAnimeExcludeCap.test.js --forceExit`: **1 passed**, 1 total (6.4s)
- `npx jest tests/graphClientPoolIntegration.test.js --forceExit`: **6 passed**, 6 total (1.2s)
- `npx jest tests/sliderWiringAndModulation.test.js --forceExit`: **10 passed**, 10 total (2.5s)
- `npx jest tests/domainSurface.test.js --forceExit`: **29 passed**, 29 total (4.1s)

Totale: 6 suite eseguite, **57 test passati**, zero fallimenti.

### 5. Cosa abbiamo deliberatamente non fatto
- Non abbiamo toccato `src/engines/hybrid/catalogStrategies.js` (rispettato il vincolo: sola lettura).
- Non abbiamo modificato le altre 3 strategie hero (`true_blend`, `seed_network`, `trakt_filtered`).
- Non abbiamo toccato gli handler HTTP (`src/handlers/**`) né le rotte API (`src/api/**`).
- Non abbiamo rimosso il vecchio percorso: convive dietro lo switch `FLAG_NUOVA_CATENA_HIDDEN_GEMS`.

### 6. Cosa serve alla prossima fetta
- Sostituzione della seconda strategia: `trakt_filtered` (o `seed_network`).
- Per `trakt_filtered`: isolare il client Trakt in `src/library/` (che possiede la cronologia) o `src/clients/trakt`, e alimentare la strategia attraverso `indice.candidati`.
