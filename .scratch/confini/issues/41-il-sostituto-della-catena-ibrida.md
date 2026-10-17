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
