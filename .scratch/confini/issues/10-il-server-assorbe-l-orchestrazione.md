Status: ready-for-agent
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

## Nota

Questo ticket **non** tocca il client (lo fa l'11) e non smonta le rotte vecchie: prima si aggiunge la lingua
nuova, poi si smette di parlare quella vecchia. Smontare per primi significa rompere la dashboard in
produzione, che è l'unico pezzo che l'utente vede se qualcosa non torna.
