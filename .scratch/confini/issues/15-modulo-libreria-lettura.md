Status: ready-for-agent
Type: task
Blocked by: 14

# 15 — Il modulo libreria: modelli e porta di lettura

> **Primo dei due passi** decisi dal ticket 14 (il modulo possiede tutto, ingestione compresa): qui nascono il
> dominio e **la porta di lettura**, che è ciò che sblocca il pool (ticket 12). L'ingestione entra nel **16**.

## Perché

La storia pesata dell'utente — `collectRealSeeds` (`src/engines/hybrid/catalogStrategies.js:902`) — ha due
consumatori (`:1143` dentro una strategia, `hybridRecommendations.js:330` per le righe del grafo) e una suite
che la copre (`tests/seedNetwork.test.js`, area A). Abita però dentro il pezzo che si ritira. E i due modelli
della libreria hanno **11 lettori diretti**: finché resta così, «libreria» non è un dominio, è una convenzione.

## Cosa deve uscire

- **I modelli nel modulo**: `WatchHistory` (`src/models/`) e `UserLibraryItem` (`src/db/models/`). Il percorso
  lo decide il ticket 06; qui si decide che **stanno nel modulo** e che nessuno li importa da fuori.
- **La porta di lettura**, con i nomi e le firme decise in 14. Almeno:
  - i **semi pesati** — con il contratto **esatto** di `collectRealSeeds` (`{ seeds: Map, counts }`), pesi
    `loved`/`liked`/`library` da `SEED_SIGNAL_WEIGHTS`, il **decadimento** del `watched`
    (`max(0.20, 0.5^(giorni/60))`) e i limiti per segnale (`SEED_SIGNAL_LIMITS`). Il codice **si muove, non si
    riscrive**: la suite è il collaudo;
  - la **libreria per titolo** (stato, voto, quando, `duplicateOf`, `parked*`) e la **watchlist** — quello che
    oggi `api/profiles.js` legge e restituisce con 13 rotte;
  - **la regola «un profilo mai sincronizzato resta freddo»** dichiarata come regola della porta (oggi è un
    `if` dentro `collectRealSeeds`, gated su `historyDocs.length > 0`).
- **`libraryIdentity` dentro il modulo** (`src/utils/libraryIdentity.js`): è una regola di **dominio** — lo
  stesso titolo con id diversi — letta e scritta da entrambi i mestieri, quindi sta con i fatti, non fra le
  utilità.
- **I test si spostano col codice**: `tests/seedNetwork.test.js` area A e i test di libreria
  (`libraryWatchedService`, `libraryReorder`, `userLibraryDedup`, `utilityPagination`,
  `libraryIdentityDuplicatesTicket19`) devono passare **senza cambiare una asserzione**. Se un'asserzione va
  cambiata, il contratto della porta non è quello di prima: va detto nel ticket, non aggiustato in silenzio.
- **I lettori passano dalla porta**: i motori, i provider (`WatchlistProvider`), le rotte di `api/profiles.js`,
  `profileProcessor`, `ProfileBuilder`, `studioProfile`. Obiettivo: **11 lettori diretti → 0** (più i due
  dell'ingestione, che è il 16).

## Come si verifica

- `npx jest tests/seedNetwork.test.js` (e gli altri test di libreria) **prima** e **dopo**, senza toccare le
  asserzioni.
- Il `grep` che dimostra che nessun file fuori dal modulo importa `WatchHistory` o `UserLibraryItem`.
- Un `node -e` che chiama la porta nuova e stampa i conteggi dei semi per una storia vera: lo stesso numero
  che stampa oggi il log del deploy (`[Mondi] … seed da archivio N, da Trakt M`).

## Attenzione

`collectRealSeeds` legge `UserAccount` per risolvere l'`addonUuid` quando l'utente non ce l'ha in mano: è
un'entrata nel dominio **account**, non libreria. Va dichiarata (chi la fornisce, e con che degrado quando non
c'è), non copiata.
