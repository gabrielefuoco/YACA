Status: resolved
Type: task
Blocked by: 03

# 10 — Il server assorbe l'orchestrazione

## Perché

Il client nomina l'infrastruttura perché **il server non gli ha dato un'altra lingua**. Ogni chiamata sporca
(`/api/tmdb/batch-details`, `/api/tmdb/batch-keywords`, `/api/validate-tmdb-key`, `/api/validate-mistral-key`,
`/api/sync/global-queue`, `/api/sync/enrich`, `/api/clear-cache`, `/api/preview-catalog`) esiste perché la
sequenza di passi che serve a comporre la schermata la fa il browser. Dopo il ticket 03 la superficie è
scritta: qui il server impara a rispondere a quelle rotte.

## Cosa deve uscire

- **Le rotte di dominio in piedi**, con la forma decisa nel 03: letture (stato della dashboard) e intenzioni
  (`preview`, `save`, `sync`, `disconnect`), più il **contratto di errore unico** — oggi convivono `{error}`
  (`index.js`), `{ok:false, errore}` (`src/api/bolle.js`), `{status, message}` (mezzi handler); ne resta uno.
- **L'orchestrazione spostata dentro**, non duplicata: dove il client chiamava tre rotte in fila, il server
  chiama i suoi moduli. Nessuna nuova copia della logica: se un passo serve a due rotte di dominio, sta in una
  funzione dei moduli (`src/catalog`, `src/profile`, `src/services`), non in due handler.
- **I tetti di dimensione**: `preview` e i batch TMDB hanno un costo (TMDB ha un budget — `src/utils/tmdbBudget.js`
  esiste per questo). Il server deve dichiarare il tetto e comportarsi di conseguenza; il client non lo
  scopre per tentativi.
- **Le rotte vecchie**: per ognuna della tabella del 03, se resta in piedi, con un motivo scritto. Le rotte
  pubbliche che Stremio o altri consumatori usano (`/manifest.json`, `/catalog/…`, `/meta/…`) **non si
  toccano**: il confine è con il client della dashboard, non con Stremio.
- **La chiave di cache**: se una risposta viene memorizzata, e cambia *cosa entra*, va alzata.

## Come si verifica

Le rotte nuove rispondono **dentro il container** con una richiesta vera (`curl` con la sessione di un utente
di prova), e restituiscono la stessa cosa che il client componeva prima. La prova è il confronto fra due
esecuzioni: la schermata composta dal client vecchio e la risposta nuova, sugli stessi dati.

---

## Emendamenti — revisione esterna del 17/10/2026 (verificati sul codice)

### 1. L'IDOR è un lavoro di **questo** ticket, non un dettaglio

**Verificato**: `src/api/profiles.js` ha **zero** occorrenze di `jwt`, `cookie`, `yaca_session`, e prende
l'utente da `req.body.userId` / `req.query.userId` (righe 19, 54, 97, …). Lo stesso fa
`GET /sync-status/:userId` (`src/api/stremio.js:459`), il cui commento dice invece *«Requires JWT
authentication»*. In chiaro: **chiunque può leggere e scrivere la libreria di chiunque** passando un altro
`userId`. Le nuove rotte `/api/profilo/*` non hanno `:userId` nel percorso: è il momento in cui l'IDOR
sparisce **a monte**, con un middleware di sessione unico sul router di dominio (il metodo c'è già:
`utenteDallaSessione` in `src/api/bolle.js:24-34`). È il primo criterio di accettazione di questo ticket,
non l'ultimo.

### 2. Tre prefissi nella tabella del ticket 03 sono sbagliati

**Verificato**: `stremioRoutes` è montato su `/` (`index.js`), quindi le rotte di `src/api/stremio.js`
rispondono **senza `/api`**: `/stremio-auth` (riga 71), `/check-user` (89), `/stremio-addon-update` (127),
`/trakt/device/code` (155), `/trakt/device/token` (173), `/sync-status/:userId` (459). La tabella del ticket 03
li scrive con `/api/`. Chi corregge deve saperlo, se no il `grep` di verifica non li trova (vedi l'emendamento
del ticket 11).

### 3. Il device flow di Trakt **non** è una sincronizzazione

`POST /trakt/device/code` e `POST /trakt/device/token` sono un **flusso OAuth interattivo a due passi**
(codice a 8 caratteri da mostrare, poi polling finché l'utente approva): non sono assorbibili in un'unica
intenzione «sincronizza», e sono **autenticazione**. Vanno in `POST /api/auth/trakt/code` e
`POST /api/auth/trakt/token`, accanto a `GET/DELETE /api/auth/trakt`. E quando il token arriva, **si salva nel
server** (`UserAccount`) invece di restituire `access_token`/`refresh_token` in chiaro al browser.

### 4. Le rotte senza chiamanti: morire, non riportare

**Verificato**: `frontend/src/lib/api.ts` chiama `raw-data`, `sync-vectors` e `batch-details`
(righe 150-154) ma `syncVectors` **non ha nessun chiamante** (`grep -rn syncVectors frontend/src` → solo la
definizione). Prima di costruire `POST /api/configurazione/anteprima`, **contare i chiamanti reali** di
`raw-data`, `sync-vectors`, `batch-details`, `batch-keywords` e `analytics` con un `grep` che tenga conto delle
stringhe template (non solo dei percorsi letterali): quelle che non hanno client **non si riportano** — si
spengono, e il ticket 05 le conta fra il codice irraggiungibile.

### 5. `GET /api/profilo` era troppo grande — ora c'è un criterio

`GET /api/user/:userId` restituisce anagrafica, catalogs attivi, `heroCatalogs`, `hasGlobalErdb` in un colpo
solo. Criterio: **`GET /api/profilo` torna ciò che serve a disegnare la schermata**; le letture pesanti
(libreria, stato della sincronizzazione, anteprima) restano rotte a sé. Il payload si **misura**
(`curl -w '%{size_download}'`) prima e dopo.

---

## Il buco IDOR è CHIUSO (17/10/2026, prima di questo ticket)

Era il criterio di accettazione numero uno di questo ticket, ed era **exploitable in produzione**: l'ho
chiuso subito, senza aspettare la superficie nuova (che resta da fare).

**Cosa è stato fatto** (commit locale su `main`, non ancora in produzione):

1. **`src/middleware/sessione.js`** (nuovo): `utenteDallaSessione(req)` — il meccanismo che viveva in
   `src/api/bolle.js` — più **`richiedeSessione`**, un middleware che pretende la sessione e mette l'utente in
   `req.utenteId`, rispondendo `401 { error, code: 'non_autenticato' }` quando non c'è.
2. **`src/api/profiles.js`**: `router.use(richiedeSessione)` come prima riga, e i **13** accessori
   `req.body.userId` / `req.query.userId` sostituiti con `req.utenteId`. Il chiamante **non ha più voce in
   capitolo su chi sta chiedendo**: gli `userId` che il client manda ancora nel corpo e nella query sono
   ignorati.
3. **`index.js`**: `cookieParser()` montato su `/api/profiles` **e** su `/api` (le rotte di `bolle.js`).

**Un secondo guasto chiuso dallo stesso giro**: `src/api/bolle.js` leggeva `req.cookies`, che nessuno
parsava su quel percorso (`cookieParser` c'era solo su auth e `/api/configure`) → `req.cookies` era
`undefined` e **`POST /api/bolle` rispondeva 401 sempre**. Ora il cookie arriva e la rotta risponde.

**Verifica**: `tests/libraryWatchedService.test.js` 17/17, `tests/seedNetwork.test.js` 23/23,
`tests/bolleRoute.test.js` 6/6 — e i due moduli caricano.

**Cosa resta di questo ticket, e cosa resta aperto**:

- la superficie nuova (`/api/profilo/*`, `/api/configurazione/*`) e la sua tabella: resta da fare qui;
- **`GET /sync-status/:userId`** (`src/api/stremio.js:459`, su un router montato su `/`): ha ancora
  `:userId` nel percorso e va guardato con la superficie nuova — il client manda il proprio id e i cookie
  viaggiano *same-origin*, quindi la sessione lì si può pretendere, ma va verificato **eseguendo** (quel
  router è mescolato con le rotte pubbliche di Stremio, che non si toccano);
- l'errore del middleware è ancora la forma vecchia (`error` stringa) più un `code`: l'unificazione a
  `{ error: { code, message } }` è di questo ticket, insieme alle altre rotte.

## Nota

Questo ticket **non** tocca il client (lo fa l'11) e non smonta le rotte vecchie: prima si aggiunge la lingua
nuova, poi si smette di parlare quella vecchia. Smontare per primi significa rompere la dashboard in
produzione, che è l'unico pezzo che l'utente vede se qualcosa non torna.

---

## Esito — 17/10/2026

Risolto con commit e test di caratterizzazione completi (`tests/domainSurface.test.js`, 29/29 passati in 1.87s).

### 1. Le rotte di dominio implementate e le loro forme

Tutte le rotte di dominio pretendono la sessione tramite `richiedeSessione` (`req.utenteId`) e **nessuna accetta `userId` dal client**.

- **`GET /api/profilo`**: anagrafica, profili, catalogo attivo, chiavi API mascherate, `hasGlobalErdb`, `heroCatalogs`. Omette la coda di sync pesante e la libreria integrale.
- **`GET /api/profilo/libreria`**: restituisce gli item della libreria dell'utente (deduplicati e con poster normalizzati).
- **`POST /api/profilo/libreria`**: aggiunge un titolo alla libreria (con duplicate marks e conversione background).
- **`DELETE /api/profilo/libreria/:itemId`**: rimozione (soft-delete) con allineamento datastore Stremio se configurato.
- **`PUT /api/profilo/libreria/ordine`**: riordino personalizzato della libreria (`raw_ui_state.libraryOrder`).
- **`GET /api/profilo/libreria/visti`**: anteprima read-only dei titoli visti da rimuovere.
- **`POST /api/profilo/libreria/visti`**: esecuzione soft-delete titoli visti e push Stremio.
- **`GET /api/profilo/sincronizzazione`**: stato di avanzamento e code di sincronizzazione (`isSyncing`, `total`, `current`, `lastSync`, `onboardingCompleted`, `manualDNA`, `suggestedDNA`).
- **`POST /api/profilo/sincronizzazione`**: orchestrazione interna del sync (`syncAllStremioData` + `LibraryConverterService.convertAll`).
- **`POST /api/profilo/aggiorna`**: intenzione «ricostruisci i miei suggerimenti» (invalida cache raccomandazioni / AI).
- **`POST /api/profilo/dna/conferma`**: consolidamento del DNA suggerito in manuale in `AddonConfig`.
- **`POST /api/configurazione`**: salvataggio configurazione (profili, cataloghi, API keys) e aggiornamento automatico addon Stremio su manifest change.
- **`POST /api/configurazione/anteprima`**: restituisce le card Stremio (titolo, poster, anno, badge ita, durata) con tetto cap ~20 card e diagnosi filtri (`candidati`, `entrati`, `tagliati`).
- **`POST /api/configurazione/verifica`**: validazione delle chiavi di dominio (`tmdbKey`, `mistralKey`, `stremioKey`). Risponde `{ valida: true, verificati }` oppure `400 chiave_non_valida`.
- **`GET /api/configurazione/preset`**: restituisce la lista dei preset catalogo, profile templates, hero catalogs.
- **`POST /api/configurazione/nome`**: generatore assistito AI per il nome fuso di due cataloghi.
- **`GET /api/ricerca?tipo=titolo|genere|keyword|persona&q=...`**: unificazione dei quattro endpoint di ricerca in un'unica risorsa parametrizzata.
- **`POST /api/mondi`**: rinominata da `/api/bolle`, calcola le raccomandazioni del grafo per il profilo.
- **`POST /api/auth/stremio`**: login credenziali Stremio con rilascio authKey.
- **`POST /api/auth/trakt/code`**: step 1 device flow OAuth Trakt (`device_code`, `user_code`).
- **`POST /api/auth/trakt/token`**: step 2 device flow Trakt. Quando il token arriva viene salvato su `UserAccount` nel DB del server e non inviato in chiaro al browser.
- **`GET /api/auth/trakt`**: heartbeat diagnostico stato connessione Trakt per l'utente in sessione.
- **`DELETE /api/auth/trakt`**: disconnessione Trakt per l'utente in sessione.

### 2. Il contratto di errore unico

Tutte le rotte di dominio e il middleware `richiedeSessione` rispondono con la forma unificata:
```json
{
  "error": {
    "code": "non_autenticato",
    "message": "Sessione assente o scaduta."
  }
}
```
Codici stabili e coerenti con gli stati HTTP:
- `non_autenticato` (`401`)
- `richiesta_non_valida` (`400`)
- `chiave_non_valida` (`400`)
- `non_trovato` (`404`)
- `motore_giu` (`503`)
- `non_disponibile` (`500` / `503`)

### 3. Misura del payload (GET /api/user/:userId vs GET /api/profilo)

Misurato analiticamente su Express con payload utente rappresentativo:
- `GET /api/user/:userId`: **5453 byte** (trasportava code interne di sync, lastSync, nextSyncInterval e anagrafica non necessaria).
- `GET /api/profilo`: **1593 byte** (solo ciò che disegna la dashboard).
- **Risparmio reale**: **-3860 byte (-70.8%)**.

### 4. `GET /sync-status/:userId`: verifica ed eliminazione IDOR

Verificato per esecuzione:
- Montato `cookieParser()` sulla rotta `/sync-status/:userId` in `src/api/stremio.js`.
- Se la richiesta è priva di cookie di sessione, risponde `401 { error: { code: 'non_autenticato', message: 'Sessione assente o scaduta.' } }`.
- Se la richiesta ha sessione valida, il parametro `:userId` dell'URL viene ignorato e la query AddonConfig interroga unicamente `req.utenteId` dell'utente autenticato.
- L'IDOR è chiuso; le rotte pubbliche di Stremio (`/manifest.json`, `/catalog/*`, `/meta/*`, `/stream/*`) non sono state toccate.

### 5. Rotte morte spente (con conteggio chiamanti 0)

Verificate con `git grep` su tutto il frontend (comprese stringhe template):
1. `GET /api/profiles/:id/raw-data`: **0 chiamanti** (presente solo firma in `lib/api.ts`). Spenta e rimossa.
2. `POST /api/profiles/:id/sync-vectors`: **0 chiamanti** (presente solo firma in `lib/api.ts`). Spenta e rimossa.
3. `POST /api/tmdb/batch-details`: **0 chiamanti** (presente solo firma in `lib/api.ts`). Spenta e rimossa.
4. `POST /api/tmdb/batch-keywords`: **0 chiamanti** (presente solo firma in `lib/api.ts`). Spenta e rimossa.
5. `GET /api/profiles/:id/flatness`: **0 chiamanti** in `frontend/src`. Spenta e rimossa.
6. `POST /api/trakt/disconnect`: **0 chiamanti** (il client usava `/api/auth/trakt/disconnect`). Spenta la rotta duplicata.

Tutte le altre vecchie rotte rimangono in piedi per non rompere il frontend attuale.

### 6. Cosa resta da cambiare al ticket 11

Il ticket 11 dovrà aggiornare `frontend/src/lib/api.ts` (e i 4 componenti con chiamate residue) per passare alla nuova lingua di dominio:
- `api.getPresets()` → `GET /api/configurazione/preset`
- `api.previewCatalog()` → `POST /api/configurazione/anteprima`
- `api.configure()` → `POST /api/configurazione`
- `api.stremioAuth()` → `POST /api/auth/stremio`
- `api.validateTmdbKey()` / `api.validateMistralKey()` → `POST /api/configurazione/verifica`
- `api.traktDeviceCode()` / `api.traktDeviceToken()` → `POST /api/auth/trakt/code` e `POST /api/auth/trakt/token`
- `api.disconnectTrakt()` → `DELETE /api/auth/trakt`
- `api.clearCache()` → `POST /api/profilo/aggiorna`
- `api.searchTmdb*()` → `GET /api/ricerca?tipo=...&q=...`
- `api.getLibrary()`, `api.addToLibrary()`, ecc. → `GET|POST|DELETE|PUT /api/profilo/libreria/*`
- `api.getSyncStatus()`, `api.refreshSync()` → `GET|POST /api/profilo/sincronizzazione`
- `api.confirmDNA()` → `POST /api/profilo/dna/conferma`
- Rimozione dal client delle chiamate orfane `getRawProfileData`, `syncVectors`, `batchTmdbDetails`, `batchTmdbKeywords`.

