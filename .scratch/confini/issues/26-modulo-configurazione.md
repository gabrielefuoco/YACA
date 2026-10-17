Status: ready-for-agent
Type: grilling
# 26 — Il modulo configurazione utente: le cose di un utente

## Perché

È l'ultimo pezzo dell'architettura a dieci moduli (decisione 16) e l'unico **senza né ticket né codice**. La sua
necessità è nata in grilling col ticket 21: quando il modulo profilo ha preso l'anagrafica dei profili, si è
deciso che **le chiavi API, l'account e la ui state non sono del profilo** — e vanno da qualche parte.

## I fatti (misurati il 17/10/2026)

`src/db/models/UserAccount.js` tiene, in un documento solo: `userId`, `email`, **`passwordHash`**, `addonUuid`,
`apiKeys: { stremio, tmdb, mistral, trakt, traktRefreshToken, traktExpiresAt }`, `traktStatus`.

`src/db/models/AddonConfig.js` tiene: `uuid`, `profiles[]` — e dentro il profilo, `catalogs` e `raw_ui_state`
(che conteneva `libraryOrder`, **già spostato alla libreria dal ticket 21**, e contiene ancora
**`selectedPresets`**). `raw_ui_state` è usato in `src/api/configure/profileProcessor.js:156-176` (i preset
scelti) e citato da un commento ormai stantio in `src/api/profiles.js:482`.

E le chiavi **globali** (`process.env.TMDB_API_KEY`, `process.env.MISTRAL_API_KEY`) sono lette **direttamente in
sei file**: `src/api/catalog.js`, `src/api/configurazione.js`, `src/api/configure/profileProcessor.js`,
`src/api/configure/validators.js`, `src/api/ricerca.js`, `src/api/tmdb.js`.

## Deciso in grilling (17/10/2026)

**Il modulo configurazione possiede tutto ciò che è di un utente**: l'identità (`userId`, `addonUuid`), le
**chiavi** (TMDB, Mistral, Stremio — oggi globali, domani BYOK), i **token di Trakt** (con la loro scadenza) e le
**preferenze** (ui state). **L'autenticazione possiede la sessione** (login, logout, il JWT) e i **flussi che
ottengono una credenziale** (device code di Trakt, il callback di Stremio): chi ottiene un token lo **consegna**
alla configurazione, chi usa una chiave la **chiede** a lei.

Il motivo in una riga: *una chiave che l'utente sceglie non è un'autorizzazione che l'utente ottiene* — e
«le cose di un utente» devono stare in un posto solo, se no auth diventa anche un magazzino.

## Le decisioni (grilling del 18/10/2026)

| # | decisione | perché |
|---|---|---|
| 1 | **`passwordHash` esce da `UserAccount`** e va in un documento di auth (`UserCredentials`: `userId` + `passwordHash`), collegato per `userId`. | Un documento, un padrone (regola del 21). E il precedente è `libraryOrder`: quando un dato è di un altro modulo **si sposta**, non si lascia con una regola di campo. Verificato: nessuno legge quel campo tranne il login. |
| 2 | **Tutto `raw_ui_state` è del profilo** (`selectedPresets`, `catalogOrder`, `newPrompts`, `heroPresetsInitialized`): diventa un modello del modulo profilo, con **UNA** migrazione e il **ripiego** sul vecchio posto. | È per-profilo per costruzione: sta dentro `profiles[]`, e lo legge il manifest (`src/api/stremio.js:251`). Il trattamento di `libraryOrder` (`src/library/models/UserLibraryOrder.js` + ripiego in `library/reader.js:321`) applicato una volta invece di quattro. |
| 3 | **La porta delle chiavi è pura + una porta grezza**: `chiaveEffettiva({ account, servizio, richiesta })` (pura: richiesta → utente → globale → `null`), `accountDi(userId)`, `chiaveGlobale(servizio)` per i lavori offline. | La catena è **già scritta a mano in 15 file**, in tre ordini diversi: non la introduciamo, la togliamo da 15 posti. Pura = testabile senza Mongo, e nessun `async` nuovo (tutti i 24 punti leggono dentro una funzione, nessuno al caricamento del modulo). |
| 4 | **Il degrado è DICHIARATO col motivo**: il modulo torna `null` e dichiara in un posto quali funzioni dipendono da quale servizio; chi chiama degrada col motivo nella risposta (`motivi: ['chiave_mistral_assente']`). | È la regola della mappa («vuoto + motivi, mai un errore») applicata alle chiavi, e la stessa scelta della decisione 7 del modulo anime. Oggi la ricerca AI «degrada in silenzio» (`src/ai/router.js:154`) — e un degrado che non si vede è un guasto che nessuno scopre. |
| 5 | **La credenziale Trakt è UN blocco** (`trakt: { accessToken, refreshToken, expiresAt, status: {...} }`) e **il client non scrive più il documento**: chiede al modulo (`segnaTraktInRinnovo(userId)`, `segnaTraktOk`, `segnaTraktDaRiautorizzare`). | Oggi il client fa un `$set` diretto (`src/clients/trakt.js:210`): **tre scrittori** su `UserAccount` (configurazione, auth, client). La credenziale e il suo stato di salute sono la stessa cosa vista da due lati. |
| 6 | **La proprietà si difende con un test** che legge il codice (`tests/proprietaDocumenti.test.js`): fallisce se un file fuori dal modulo proprietario importa `UserAccount`, o se qualcosa fuori dal profilo tocca `profiles[]`. Più la riga in `docs/INDEX.md`. | «Un confine dichiarato non è un confine imposto» — è il rilievo 2 del ticket 27 e la lezione del client ricresciuto in orchestratore. Il grep che i ticket usano per verificare, qui diventa un test che resta. |

## Conseguenze (derivate)

- **Tre migrazioni nello stesso giro** (la password, l'ui state, la forma di Trakt), ognuna col pattern di
  `libraryOrder`: si scrive il nuovo posto, si legge ancora il vecchio come ripiego, e il ripiego si toglie
  quando il dato è migrato.
- **L'accettazione resta quella scritta**: `grep` a zero di `process.env.*_API_KEY` fuori dal modulo (oggi sono
  **24 occorrenze in 15 file**), la catena di ripiego col suo test, e i consumatori che chiedono la chiave al
  modulo.
- **Le eccezioni del test di proprietà**: vanno enumerate nell'allowlist, non lasciate implicite. Se auth legge
  `UserAccount` per il login, quell'accesso va dichiarato lì — o, meglio, tolto facendo passare auth dal modulo.
- **L'ordine**: questo ticket tocca i consumatori che altri ticket stanno muovendo adesso (`src/ai/**`,
  `src/ricerca/**` e `src/utils/tmdbNameResolver.js` sono del ticket 27; i consumatori anime sono del 32; il
  cluster del daemon è del 34). Va fatto **dopo** che quelli sono atterrati, se no si litiga sugli stessi file.
- **La forma del modulo**: `src/configurazione/index.js` (la porta), `chiavi.js` (pura + grezza), e i modelli
  (`UserAccount` senza la password e senza l'ui state, con il blocco `trakt` unico).

## Come si verifica (da completare in grilling)

Minimo: **nessun file fuori dal modulo legge una chiave dall'ambiente** (col `grep` che lo dimostra), la catena
di ripiego utente → globale ha il suo test, e i consumatori (le sei rotte, la ricerca, il configuratore) chiedono
la chiave al modulo — con il degrado dichiarato quando non c'è.
