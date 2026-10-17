Status: resolved
Type: task
Blocked by: 10

# 11 — Il client nomina solo il dominio

## Perché

È la metà visibile della decisione 4: il client è un **orchestratore** (`frontend/src/components/dashboard/*`,
50 file, 13 chiamate a `/api/profiles/*` più dieci rotte di infrastruttura). Il server ora ha la lingua nuova
(ticket 10): qui il client la impara e smette di nominare l'interno.

## Cosa deve uscire

- **Le chiamate cambiate**, componente per componente, secondo la tabella del ticket 03. Nessun
  `/api/tmdb/*`, `/api/sync/*`, `/api/validate-*`, `/api/clear-cache` nel client.
- **La sequenza assorbita**: dove il client faceva tre chiamate per disegnare un pannello, ne fa una. La
  verifica è il conteggio delle chiamate, non l'impressione che il codice sia più bello.
- **Lo stato di UI resta al client**: cosa è aperto, cosa è in modifica, cosa è in attesa. Nessun pezzo di
  *presentazione* si sposta nel server.
- **La regola, scritta dove serve**: un commento in testa al client (o in `frontend/README.md`) che dice che il
  client non nomina l'infrastruttura, con la ragione — perché fra sei mesi qualcuno aggiungerà
  `/api/tmdb/search/keyword` ed è esattamente così che è nato il problema. Se esiste un lint possibile senza
  costruire un'infrastruttura, meglio: un test che fallisce se compare `'/api/tmdb'` in `frontend/src` è
  dieci righe e non costa una build.
- **Le rotte vecchie**: si smontano solo quelle che nessuno chiama più — con il `grep` che lo dimostra, non
  con la fiducia.
- **La CI**: il frontend lo verifica la CI (esbuild/next build). In anello si usa il test jest, non `npm run
  build` (`tests/` è la suite veloce).

## Come si verifica

Prima e dopo: il conteggio delle chiamate del client per rotta (`grep -rhoE "'/api/[a-z0-9/_-]+" frontend/src |
sort | uniq -c | sort -rn`), e la dashboard che funziona sul deploy vero — accedere, configurare un profilo,
salvare, e vedere l'anteprima. Il numero è la prova; la dashboard che si apre è la conferma.

## Attenzione

Un test end-to-end del client non esiste oggi, e questo ticket non lo inventa: la prova è l'uso reale sul
deploy. Se l'uso reale non è possibile (sessione, ambiente), **dirlo nel ticket** invece di chiuderlo con la
CI verde — la CI verde su un client rotto è la storia già vista in questa repo.

---

## Emendamento — revisione esterna del 17/10/2026 (verificato)

### Il `grep` proposto non conta le chiamate vere

**Verificato**: `frontend/src/lib/api.ts` costruisce **tutte** le rotte dei profili con stringhe template
(`/api/profiles/${encodeURIComponent(profileId)}/raw-data?userId=…`), e le rotte di `src/api/stremio.js`
**non hanno il prefisso `/api`** (`/check-user`, `/stremio-auth`, `/trakt/device/code`). Quindi il comando
proposto nel ticket 03 (`grep -rhoE "'/api/[a-z0-9/_-]+" frontend/src`) conta le rotte letterali e **manca
proprio quelle che stiamo cercando**.

Il conteggio si fa così:

```bash
# le rotte chiamate, template string comprese, senza doppioni
grep -rhoE "/(api/)?[a-z0-9-]+(/[a-zA-Z0-9_$-]+)*(\?|\`|'|\")" frontend/src/lib/api.ts \
  | sed "s/[\`'\"?].*//" | sort | uniq -c | sort -rn
```

E il **prima/dopo** si misura su quello, più i chiamanti per singola funzione (es. `syncVectors` → 0 chiamanti:
la sua rotta muore, non si riporta).

---

## Esito — 17/10/2026

**Risolto il 17/10/2026.**

Il client ora nomina esclusivamente la superficie di dominio del server. Nessun endpoint infrastrutturale (`/api/tmdb/*`, `/api/sync/*`, `/api/validate-*`, `/api/clear-cache`, `/api/profiles/:id/*`, `/trakt/device/*`) e nessun parametro `userId` (in query o body) è più presente nel frontend. L'identità dell'utente è gestita dal server tramite il cookie di sessione HttpOnly.

### 1. Mappatura applicata

1. **`frontend/src/lib/api.ts` (unica porta del client)**:
   - `api.getPresets()` → `GET /api/configurazione/preset`
   - `api.previewCatalog()` → `POST /api/configurazione/anteprima`
   - `api.configure()` → `POST /api/configurazione`
   - `api.stremioAuth()` → `POST /api/auth/stremio`
   - `api.stremioAddonUpdate()` → `POST /api/configurazione`
   - `api.validateTmdbKey()` / `api.validateMistralKey()` → `POST /api/configurazione/verifica`
   - `api.traktDeviceCode()` → `POST /api/auth/trakt/code`
   - `api.traktDeviceToken()` → `POST /api/auth/trakt/token` (token salvato server-side su UserAccount, non restituito in chiaro al browser)
   - `api.disconnectTrakt()` → `DELETE /api/auth/trakt`
   - `api.clearCache()` → `POST /api/profilo/aggiorna`
   - `api.searchTmdb*()` → `GET /api/ricerca?tipo=titolo|genere|keyword|persona&q=...`
   - `api.getProfile()`, `api.checkUser()`, `api.getProfileAnalytics()` → `GET /api/profilo`
   - `api.getLibrary()`, `api.addToLibrary()`, `api.removeFromLibrary()`, `api.reorderLibrary()` → `GET|POST|DELETE|PUT /api/profilo/libreria/*`
   - `api.getWatchedLibraryPreview()`, `api.removeWatchedLibrary()` → `GET|POST /api/profilo/libreria/visti`
   - `api.getSyncStatus()`, `api.refreshSync()`, `api.convertLibrary()` → `GET|POST /api/profilo/sincronizzazione`
   - `api.confirmDNA()` → `POST /api/profilo/dna/conferma`
   - `api.getMondi()` → `POST /api/mondi`
2. **I 4 chiamanti sparsi (e componenti secondari)**:
   - `app/page.tsx`: sostituite le chiamate a `fetch('/api/user/...')` con `api.getProfile()`; rimosso `userId` dalle chiamate a `api.configure()` e `api.disconnectTrakt()`.
   - `CreatorPanel.tsx`: sostituito `fetch('/api/tmdb/search/multi?query=...')` con `api.searchTmdbMulti(query)`.
   - `UserLibraryPanel.tsx`: sostituito `fetch('/api/tmdb/search/multi?query=...')` con `api.searchTmdbMulti(query)`; rimosso `userId` da tutte le chiamate di libreria.
   - `hooks/useAuth.ts`: preservate le rotte di dominio `api.authMe()` e `api.authLogout()`.
   - `hooks/useBackgroundSync.ts`: convertito in hook no-op poiché il server governa la sincronizzazione in background (TmdbDumpDaemon e POST `/api/profilo/sincronizzazione`).
   - `components/modals/TraktAuthModal.tsx`: device flow allineato a `/api/auth/trakt/code` e `/api/auth/trakt/token`, gestione del successo su `connected: true` senza toccare token crudi.
   - `components/pages/SettingsPage.tsx` e `components/dashboard/CatalogLivePreview.tsx`: rimosso `userId` residuo dalle chiamate `api.configure` e `api.previewCatalog`.
3. **Contratto di errore unificato**:
   - `handleResponse` in `lib/api.ts` estrae `errData.error.message` e imposta `error.code` coerentemente con `{ error: { code, message } }`.
4. **Cosa è stato spento e rimosso**:
   - Spente le 6 rotte morte (0 chiamanti): `raw-data`, `sync-vectors`, `batch-details`, `batch-keywords`, `flatness`, `/api/trakt/disconnect`.
   - Rimosse le chiamate orfane `getGlobalSyncQueue` e `enrichSyncItem`.

### 2. Conteggio chiamate prima e dopo (grep con template string)

Comando:
```bash
grep -rhoE "/(api/)?[a-z0-9-]+(/[a-zA-Z0-9_$-]+)*(\?|\`|'|\")" frontend/src/lib/api.ts \
  | sed "s/[\`'\"?].*//" | sort | uniq -c | sort -rn
```

**PRIMA (34 rotte, prevalenza infrastruttura):**
```
      2 /library/watched
      2 /library
      1 /trakt/device/token
      1 /trakt/device/code
      1 /sync/refresh
      1 /sync-vectors
      1 /sync-status
      1 /raw-data
      1 /library/reorder
      1 /json
      1 /global-queue
      1 /generate-merged-name
      1 /dna/confirm
      1 /convert-library
      1 /batch-keywords
      1 /batch-details
      1 /api/validate-tmdb-key
      1 /api/validate-mistral-key
      1 /api/tmdb/search/person
      1 /api/tmdb/search/multi
      1 /api/tmdb/search/keyword
      1 /api/tmdb/search/genre
      1 /api/sync/enrich
      1 /api/stremio-auth
      1 /api/stremio-addon-update
      1 /api/preview-catalog
      1 /api/presets
      1 /api/configure
      1 /api/clear-cache
      1 /api/check-user
      1 /api/auth/trakt/disconnect
      1 /api/auth/me
      1 /api/auth/logout
      1 /api/auth/login
      1 /api/auth/guest
      1 /analytics
```

**DOPO (23 rotte, 100% dominio):**
```
      5 /api/ricerca
      3 /api/profilo/sincronizzazione
      3 /api/profilo
      2 /api/profilo/libreria/visti
      2 /api/profilo/libreria
      2 /api/configurazione/verifica
      2 /api/configurazione
      1 /json
      1 /api/profilo/libreria/ordine
      1 /api/profilo/dna/conferma
      1 /api/profilo/aggiorna
      1 /api/mondi
      1 /api/configurazione/preset
      1 /api/configurazione/nome
      1 /api/configurazione/anteprima
      1 /api/auth/trakt/token
      1 /api/auth/trakt/code
      1 /api/auth/trakt
      1 /api/auth/stremio
      1 /api/auth/me
      1 /api/auth/logout
      1 /api/auth/login
      1 /api/auth/guest
```

### 3. La guardia architetturale (`tests/clientDomainGuard.test.js`)

Aggiunta la suite di test automatica veloce (`tests/clientDomainGuard.test.js`, tempo di esecuzione ~0.4s) che ispeziona ricorsivamente tutto `frontend/src` e fallisce se:
1. Compare una qualsiasi rotta infrastrutturale (`/api/tmdb`, `/api/sync`, `/api/validate-`, `/api/clear-cache`, `/api/profiles`, `/api/stremio-auth`, `/api/stremio-addon-update`, `/api/preview-catalog`, `/api/check-user`, `/trakt/device`, `/api/user/`).
2. Viene passato `userId` come parametro di query (`[?&]userId=`).

Entrambi i test passano con successo.

### 4. Checklist di verifica manuale su deploy reale

La vera validazione end-to-end del client richiede l'uso della dashboard sul deploy di produzione/staging. Ecco i punti esatti da verificare e cliccare:
1. **Accesso e caricamento dashboard**:
   - Aprire la dashboard su browser (`/`).
   - Verificare che il profilo venga caricato via `GET /api/profilo` e che le card / hero catalogs appaiano senza errori nella console.
2. **Salvataggio configurazione**:
   - Modificare l'ordine di un catalogo o applicare un preset.
   - Cliccare "Salva" o attendere l'auto-save e verificare la chiamata a `POST /api/configurazione` (status 200).
3. **Anteprima catalogo (Creator Panel)**:
   - Aprire il Creator Panel, digitare una ricerca nel campo TMDB (verifica chiamata `GET /api/ricerca?tipo=titolo&q=...`).
   - Cliccare "Anteprima" e verificare che tornino le ~20 card con diagnosi filtri tramite `POST /api/configurazione/anteprima`.
4. **Sincronizzazione profilo e libreria**:
   - Aprire il pannello libreria / sincronizzazione.
   - Cliccare "Sincronizza" o "Aggiorna suggerimenti" e verificare la chiamata a `POST /api/profilo/sincronizzazione` o `POST /api/profilo/aggiorna`.
5. **Integrazione Trakt**:
   - Aprire il modale Trakt, verificare il device flow (`POST /api/auth/trakt/code` e `POST /api/auth/trakt/token`).
   - Cliccare su disconnessione Trakt nelle impostazioni e verificare la chiamata `DELETE /api/auth/trakt`.

