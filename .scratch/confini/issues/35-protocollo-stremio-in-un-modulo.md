Status: ready-for-agent
Type: task

# 35 — Il protocollo Stremio in un modulo solo

## Perché

Il protocollo Stremio (il manifest, la collection dell'addon, la riconciliazione, il client) è **1.327 righe
sparse in tre cartelle**:

| file | righe | cosa fa |
|---|---|---|
| `src/api/stremio.js` | 611 | le rotte dell'addon (manifest, catalog, meta, stream) |
| `src/utils/stremioAddon.js` | 377 | la collection dell'addon e il push a Stremio |
| `src/utils/manifestFingerprint.js` | 204 | l'impronta del manifest |
| `src/utils/manifestReconciler.js` | 126 | la riconciliazione all'avvio |
| `src/clients/stremio.js` | 9 | il client HTTP |

E la logica dell'addon è montata su `/` (`app.use('/', stremioRoutes)`): **è il prodotto**. Oggi chi tocca il
manifest deve sapere che metà vive in `utils/`, e `utils/` è il cassetto che la decisione 21 vuole smontare.

## Cosa deve uscire

1. **Un modulo** (`src/stremio/`) che possiede il protocollo: il manifest (e la sua impronta), la collection, la
   riconciliazione, il client. **Una porta** con i verbi che i consumatori usano davvero.
2. **Le rotte restano in `src/api/stremio.js`** (è il bordo HTTP, non il protocollo) e chiamano il modulo.
3. **`manifestReconciler`** è avviato da `index.js` all'avvio: resta lì (è una scelta di ciclo di vita già
   dichiarata), ma chiama il modulo.
4. **Nessuna logica Stremio fuori dal modulo**: `utils/stremioAddon.js`, `utils/manifest*.js`,
   `clients/stremio.js` non esistono più.

## Come si verifica

- `grep` a zero: nessun `require` di `utils/stremioAddon` / `utils/manifestFingerprint` / `utils/manifestReconciler`
  / `clients/stremio` fuori da `src/stremio/`.
- Le suite che toccano il manifest e l'addon verdi **una alla volta** (`tests/stremio*`, `tests/manifest*`,
  `tests/domainSurface*`).
- La prova che conta: **il manifest servito è identico** a prima. L'impronta è il modo per dirlo — prendere
  l'impronta prima e dopo, e confrontarle. Se cambia, il modulo ha cambiato il prodotto.

## Attenzione

`api/stremio.js` (611 righe) **non va spostato**: è il bordo, e il ticket 10 ha già deciso che il server assorbe
l'orchestrazione. Qui si sposta il **protocollo**, non le rotte.
