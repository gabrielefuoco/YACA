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

## Le domande che restano (per il prossimo grilling)

1. **`passwordHash`**: è del modulo configurazione (è un dato dell'account) o dell'autenticazione (è il segreto
   che *prova* l'identità)? *(La raccomandazione da discutere: la configurazione tiene l'identità, auth il
   segreto che la prova — quindi `passwordHash` resta di auth, che è l'unico che lo legge.)*
2. **`selectedPresets`**: è una preferenza **del profilo** (i cataloghi che quel profilo ha scelto) o
   dell'utente? Se è del profilo, esce da `AddonConfig` come è uscito `libraryOrder` — e va con la sua
   migrazione e il suo fallback.
3. **La porta**: `chiaveDi(userId, 'tmdb') → chiave | null`, `accountDi(userId)`, `preferenzeDi(userId)`. E la
   **catena di ripiego** delle chiavi (utente → ambiente globale) la decide il modulo, una volta: i sei file che
   oggi leggono `process.env` direttamente devono **passare da lui** — è l'accettazione di questo ticket, col
   `grep` che lo dimostra.
4. **Il BYOK**: quando un utente porta la sua chiave, cosa cambia? (La forma: una chiave per utente e per
   servizio, con l'ambiente come ripiego; e il degrado quando la chiave non c'è — cosa funziona e cosa no.)
5. **`traktStatus`**: è lo stato di una credenziale → configurazione, o lo stato di una connessione → auth?
   (Deciso che i token sono della configurazione, lo stato segue i token: ma va scritto.)
6. **`AddonConfig` e `UserAccount`**: dopo questo ticket restano due documenti con due proprietari
   (configurazione e profilo) — la regola di proprietà del 21 (*solo il profilo tocca `profiles[]`*) va estesa a
   questo modulo, e difesa.

## Come si verifica (da completare in grilling)

Minimo: **nessun file fuori dal modulo legge una chiave dall'ambiente** (col `grep` che lo dimostra), la catena
di ripiego utente → globale ha il suo test, e i consumatori (le sei rotte, la ricerca, il configuratore) chiedono
la chiave al modulo — con il degrado dichiarato quando non c'è.
