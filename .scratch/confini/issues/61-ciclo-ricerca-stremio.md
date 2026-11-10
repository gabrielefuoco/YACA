Status: resolved
Type: decision

# 61 — Il ciclo fra `ricerca` e `stremio` resta, e si dichiara

## La domanda

«`AiDiscoveryProvider` non sta nella cartella sbagliata? C'è `src/ricerca/` per la ricerca.»

## Il fatto

Le due cartelle si importano a vicenda:

```
src/ricerca/registry.js        → stremio/providers/{Trakt,Watchlist,AiringState,AiDiscovery}
                                 stremio/hybridServing
src/stremio/CatalogRouter.js   → ricerca/registry.js
```

Quasi tutte queste `require` sono pigre (dentro le funzioni), quindi il ciclo non si vede al
caricamento — la stessa nota esiste già in `src/stremio/index.js` («require pigro, se no la
porta di stremio trascina … ciclo potenziale, segnalato dalla review»).

## Perché il file è dove sta

`AiDiscoveryProvider` non è un motore di ricerca: è un **provider di catalogo**, con la stessa
forma di `WatchlistProvider`, `TraktProvider`, `AiringStateProvider` — risponde a «dammi i titoli
di questo catalogo». Il catalogo che serve è `yaca_search_ai` (Deep AI Search), che il manifest
dichiara come catalogo come gli altri.

E `src/ricerca/index.js` lo scrive come decisione, non come caso:

> L'AI è fuori dal modulo (fornisce il meccanismo, la ricerca possiede i prompt).

Spostarlo dentro `src/ricerca/` contraddirebbe quella riga, scritta da chi ha progettato il
modulo. Quindi **non è un file fuori posto**: è un confine attraversato nei due versi.

## Decisione

Il ciclo **resta**, con il suo costo dichiarato qui. Il registro delle fonti rimane in
`src/ricerca/` perché è la ricerca a possedere il dispatch e la fusione; il serving lo interroga
(`findSourceForCatalog`).

Le due alternative sono state valutate e scartate per ora:

- **provider dentro `ricerca/`** — 6 file spostati (i 5 provider + il normalizer), e `ricerca`
  smetterebbe di importare da `stremio`. Resta comunque `CatalogRouter → registry`.
- **registro dentro `stremio/`** — 1 file (380 righe) spostato, ma `ricerca` perderebbe il
  registro e la sua porta pubblica cambierebbe: è una rifattorizzazione, non un riordino.

Nessuna delle due elimina il ciclo: lo sposta. Con il ciclo mascherato dalle require pigre e
nessun sintomo in produzione, il costo supera il beneficio.

## Quando riaprire

Se compare un sintomo — caricamento circolare all'avvio, un modulo che deve essere inizializzato
prima di un altro senza motivo dichiarato, o un test che passa solo in un certo ordine — allora il
ciclo è diventato un problema e si sceglie uno dei due spostamenti qui sopra.
