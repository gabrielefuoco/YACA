# 01 — L'API pubblica di Nuvio: auth, sync, limiti, notice

**Data**: 20/10/2026 · **Ticket**: `issues/01-api-pubblica-nuvio.md` · **Punti**: P01, P02, P13, P29
**Natura**: ricerca. Nessuna decisione di prodotto, nessuna modifica al codice.

## Come leggere questa nota

Ogni affermazione porta uno di questi marcatori:

- **[D]** documentato nella documentazione ufficiale — `https://nuvio.tv/docs/nuvio-public-api.md`,
  **v1.3, last updated 20/08/2026**, 2036 righe, letto integralmente il 20/10/2026. `r. N` = riga del
  markdown.
- **[C]** osservato nel codice di un client — NuvioTV (`NuvioMedia/NuvioTV`, branch `dev`, commit
  `f062601cc6b9561c4a50aa7ab7464d7ddc555c5e` del 20/10/2026) oppure Kaptain
  (`https://www.kaptain.stream/nuvio-push.js?v=106.9`). `path:riga` oppure `file:riga`.
- **[P]** verificato con una chiamata pubblica il 20/10/2026 (nessun account, nessuna scrittura).
- **[T]** **da testare** su un account usa-e-getta: né la docs né il codice bastano a chiudere la
  domanda. Non è un'ipotesi presentata come fatto.

La pagina resa `https://nuvio.tv/docs` è client-side rendering e carica un solo documento,
`/docs/nuvio-public-api.md`: non c'è testo aggiuntivo rispetto al markdown. La documentazione è
quindi la fonte, e il markdown è la sua forma leggibile.

Dove docs e codice divergono, la nota tiene le due cose separate: **la docs descrive il contratto
pubblico, il codice descrive ciò che le app fanno davvero**. Le divergenze non sono fuse in una
sintesi.

---

## Risposta in breve

Un'integrazione terza può leggere e scrivere **tutti i dati di sync di un profilo Nuvio** — addons,
library, watch progress, watch history, impostazioni, home layout, collections — usando l'account
dell'utente e il suo `access_token`. Non esiste una superficie amministrativa: la publishable key è
pubblica, il service role è esplicitamente vietato ai client, e ogni chiamata è confinata
all'utente autenticato.

Le strategie di scrittura sono quattro e non sono intercambiabili **[D r. 1785-1796]**:

| Strategia | Risorse | Cosa fa un payload parziale |
|---|---|---|
| **Full replace** | profili, addons, collections, library legacy | **cancella** tutto ciò che non è nel payload |
| **Mutazioni incrementali** | library (nuovo) | tocca solo le identità inviate |
| **Blob upsert atomico** | profile settings, home catalog settings | sostituisce il blob di `(utente, profilo, piattaforma)` |
| **Merge non distruttivo** | watch progress, watch history | upsert; non cancella nulla |

I tre punti che cambiano il progetto di YACA:

1. **Full replace senza rete di sicurezza.** Addons, collections e profili non hanno una modalità
   merge lato server: il merge va fatto dal client (pull → merge → push completo). Un payload
   parziale distrugge dati dell'utente, e le app Nuvio propagano la cancellazione anche in locale
   (`StartupSyncService.kt:593-607`, `removeMissingLocal = true`).
2. **`sync_push_profiles` senza `p_client_max_profiles` torna al comportamento a 4 profili** e
   cancella gli slot 5-6 **[D r. 279, 371]**. Kaptain lo omette **[C nuvio-push.js:472]**; NuvioTV lo
   manda a 6 **[C ProfileSyncService.kt:72]**. È la trappola più concreta della API.
3. **L'home layout documentato non è quello reale.** La docs mostra `{rows, hidden_catalogs}` con
   `p_platform: "tv"` **[D r. 1454-1463]**; entrambi i client usano
   `{hide_unreleased_content, items:[{addon_id,type,catalog_id,enabled,order,custom_title,is_collection,collection_id}]}`
   con `p_platform: "home_catalog_shared"` **[C HomeCatalogSettingsSyncService.kt:32-52, 206;
   nuvio-push.js:21-22, 1016-1025]**.

---

## 1. Superficie, versioning, base URL

- Base URL unica: `https://api.nuvio.tv` **[D r. 4]**, con tre prefissi: `rest/v1/` (PostgREST),
  `auth/v1/` (GoTrue), `functions/v1/` (Edge Functions) **[D r. 82-88]**.
- L'API è **Supabase-compatibile**: si può usare `@supabase/supabase-js`, `supabase-py`, ecc.
  **[D r. 1822-1833]**. Le chiamate RPC sono raccomandate per tutte le operazioni di sync; le query
  dirette alle tabelle sono per letture semplici **[D r. 116-139]**.
- **Versioning**: la docs ha un numero di versione (1.3) e un changelog, ma **non pubblica una
  policy di deprecazione** né una data di fine supporto **[D r. 2016-2036]**. Il notice dice che gli
  endpoint non elencati sono interni e possono cambiare senza preavviso **[D r. 12]**.
- La API **non è versionata nell'URL**: `/rest/v1/` è la versione di PostgREST, non di Nuvio. Una
  rottura del contratto non produce un 410, produce un comportamento diverso.

**Conseguenza**: YACA non può promettere stabilità a lungo termine su questa API. Può ridurre il
danno confinando le chiamate in un adapter e tenendo un test di contratto che gira contro un account
di prova.

---

## 2. Auth flow

### 2.1 Publishable key

```
apikey: sb_publishable_1Clq8rlTVACkdcZuqr6_AD__xUUC_EN
```

**[D r. 90-105]**. È pubblica per definizione; serve su quasi tutte le chiamate `auth/v1` e
`rest/v1`. La docs dice esplicitamente che la legacy anonymous key è pubblica ma che i nuovi client
devono usare la publishable key **[D r. 102]**, e che il **service role key non va mai** in app,
browser o docs **[D r. 103]**.

Kaptain usa ancora la vecchia anon JWT key **[C nuvio-push.js:15]**: prova che la legacy funziona
tuttora, non che sia la scelta giusta. YACA deve usare la publishable.

### 2.2 Sign-up, sign-in, refresh, logout, utente

| Operazione | Chiamata | Auth | Note |
|---|---|---|---|
| Sign-up | `POST /auth/v1/signup` `{email,password}` | solo `apikey` | risposta con `access_token` + `refresh_token`; Nuvio crea **due addon di default** (metadata/subtitle) **[D r. 175-208]** |
| Sign-in | `POST /auth/v1/token?grant_type=password` | solo `apikey` | stessa forma della sign-up **[D r. 210-227]** |
| Refresh | `POST /auth/v1/token?grant_type=refresh_token` `{refresh_token}` | solo `apikey` | restituisce **nuovo** `access_token` **e nuovo** `refresh_token` **[D r. 229-245]** |
| Logout | `POST /auth/v1/logout` | Bearer | nessuna risposta documentata; Kaptain aggiunge `?scope=local` (non documentato) **[C nuvio-push.js:338]** |
| Utente | `GET /auth/v1/user` | Bearer | `{id,email,created_at}` **[D r. 255-273]** |

La risposta di sign-in/sign-up include `expires_in: 3600` **[D r. 190]**. Questo è il dato
documentato; Kaptain scrive nei commenti che i token Nuvio "expire after about a week"
**[C nuvio-push.js:203-205]**. **Le due cose non coincidono**: la docs dichiara 1 ora, un client
esperto osserva circa 7 giorni. Non è una differenza innocua — decide la frequenza dei refresh.
Va misurato **[T]**.

### 2.3 Scadenza e refresh: comportamento raccomandato

Il codice NuvioTV è la fonte migliore per il comportamento da tenere:

- il refresh è **reattivo**, non preventivo: si tenta quando una chiamata fallisce con token
  scaduto; `refreshSessionIfJwtExpired()` rifà la chiamata una sola volta dopo il refresh
  **[C AuthManager.kt:424-439; AddonSyncService.kt:29-36]**;
- la classificazione degli errori distingue **sessione invalida** (refresh token revocato,
  `invalid_grant`, `refresh_token_not_found`, 4xx) da **fallimento transitorio** (timeout, 5xx,
  errori di rete, 502/503/504). Nel primo caso si esce, nel secondo si tiene la sessione
  **[C AuthManager.kt:908-973]**;
- c'è un retry separato per errori Cloudflare/origin (408, 500, 502-504, 520-526, 530)
  **[C AuthManager.kt:978-989]**;
- Kaptain rinnova **2 minuti prima** della scadenza, onora `expires_at`/`expires_in`/`exp` del JWT,
  e chiude la sessione su qualunque 4xx del refresh **[C nuvio-push.js:214, 251-260, 284-308]**;
- Kaptain impone inoltre un tetto di 21 giorni alla sessione salvata in `localStorage`, che i
  refresh non allungano **[C nuvio-push.js:211-213, 262-274]**.

**Raccomandato per YACA**: salvare `access_token`, `refresh_token`, `expires_at`; refresh a
T-120s; su 401 rifare **una** chiamata dopo refresh; su 4xx di refresh fare sign-out; su 5xx/timeout
non distruggere la sessione, riprovare con backoff. Non dedurre la durata dal solo `expires_in`
finché non è misurata **[T]**.

### 2.4 2FA, passkey, PIN: tre cose diverse

- **2FA non esiste nella documentazione**: nessun endpoint MFA, nessun campo `factors`, nessun
  flusso challenge/verify **[D, assenza verificata in tutto il documento]**.
- **Passkey**: `GET /auth/v1/settings` risponde con `"passkeys_enabled": true` **[P, 20/10/2026]**.
  È una capacità di GoTrue, **non** una funzione documentata di Nuvio e non è usata dai client
  letti. Non va assunta come supportata.
- **PIN**: esiste, ma è esplicitamente fuori dalla API pubblica. `sync_push_profiles` "never
  overwrites PIN fields"; la gestione PIN è "an app-specific Nuvio flow" **[D r. 384]**. Nel codice
  ci sono `sync_pull_profile_locks`, `set_profile_pin`, `clear_profile_pin`, `verify_profile_pin`
  **[C ProfileSyncService.kt:170-244]**, tutti **non documentati**.
- La stessa risposta `/auth/v1/settings` dichiara `mailer_autoconfirm: true`, `disable_signup:
  false`, `phone: false`, `anonymous_users: true` **[P]**. Quindi la sign-up restituisce subito una
  sessione (niente conferma email) e la registrazione è aperta. `anonymous_users` è una capacità
  GoTrue non documentata da Nuvio: non usarla.

**Raccomandato**: trattare 2FA/passkey come **non supportate**; se un account le attiva, il grant
`password` va verificato **[T]** prima di promettere il supporto. Non costruire un flusso di
challenge: non esiste nella API pubblica.

### 2.5 Cosa NON è pubblico

La docs lo dice in due righe: copre solo gli endpoint elencati; tutto il resto è interno e può
cambiare senza preavviso; non copre endpoint privati/operativi né i flussi distruttivi dell'account
**[D r. 12]**. Il codice conferma che "il resto" è molto:

| Superficie | Dove è osservata | Stato |
|---|---|---|
| PIN e lock di profilo (`sync_pull_profile_locks`, `set/clear/verify_profile_pin`) | `ProfileSyncService.kt:170-244` | interno |
| Credenziali provider (`sync_pull/push_provider_credentials`) | `nuvio-push.js:808-840` | interno |
| Scrittura settings con controllo di concorrenza (`sync_push_profile_settings_blob_guarded`, `p_expected_updated_at`, codice `40001`) | `nuvio-push.js:1209-1250` | interno |
| Patch di un solo profilo (`sync_patch_profile`) | `nuvio-push.js:1484-1509` | interno |
| Owner per device collegati (`get_sync_owner`) | `nuvio-push.js:584-588`; `AuthManager.kt:283` | interno |
| Plugin (`sync_push_plugins`, tabella `plugins`) | `PluginSyncService.kt:43-114` | interno |
| Login TV / device (`start_tv_login_session`, `poll_tv_login_session`, exchange) | `AuthManager.kt:63-64, 676-747` | interno |
| Copia setup profilo (`sync_copy_profile_setup`) | `ProfileSettingsSyncService.kt:317` | interno |
| Entitlement supporter (`get_my_member_access`) | `nuvio-push.js:784-798` | interno |
| Scritture puntuali su `/rest/v1/addons` (POST/PATCH/DELETE) | `nuvio-push.js:599-704` | tabella, non RPC |
| Cancellazione riga home (`DELETE /rest/v1/home_catalog_settings`) | `nuvio-push.js:1066-1077` | tabella |
| `sync_delete_profile_data` | `ProfileSyncService.kt:152-168`; docs r. 388-409 | **documentato ma distruttivo** |

Regola operativa: **YACA non usa nulla di questa tabella** senza un test dedicato e una ragione di
prodotto. In particolare non tocca PIN, credenziali e plugin — sono dati che l'utente non si aspetta
di vedere riscritti da un catalogo.

---

## 3. Rate limit e 429

**Documentato [D r. 167-170]**: "Nuvio may apply rate limits"; linea guida client-side **100
richieste/secondo per utente**; batchare via RPC. La tabella errori include `429 Rate limited`
**[D r. 165]**, senza body, senza header, senza politica di retry.

**Osservato [P, 20/10/2026]**: il gateway (Kong) davanti a `api.nuvio.tv` espone

```
ratelimit-limit: 900
x-ratelimit-limit-second: 900
ratelimit-remaining: 480 → 431 (decrescente tra chiamate)
ratelimit-reset: 1
```

su `POST /rest/v1/rpc/health_ping` e `POST /rest/v1/rpc/get_avatar_catalog`. Quindi il **tetto
reale di piattaforma è ~900 req/s**, mentre **100 req/s è la soglia di sicurezza consigliata**, non
il limite. Il contatore osservato decresce tra chiamate indipendenti: sembra per IP/client davanti
al gateway, non per utente autenticato. Non è conclusivo **[T]**.

**Comportamento 429 reale [C]**: Kaptain documenta nel codice 429 "plain HTTP" su
`sync_pull_profiles` e `sync_push_profiles` durante picchi di traffico e code di backlog dopo un
disagio, con `Retry-After` quando presente, altrimenti backoff esponenziale `500ms * 2^attempt` più
jitter, **massimo 3 retry** **[C nuvio-push.js:124-143]**. Le chiamate dati (RPC e tabelle) passano
da quel wrapper; il refresh del token usa `fetch` diretto **[C nuvio-push.js:186-197, 289-291]**.

**NuvioTV non gestisce il 429**: nei servizi di sync letti c'è solo il retry per JWT scaduto
**[C AddonSyncService.kt:29-36 e analoghi]**. Non c'è backoff, non c'è lettura di `Retry-After`.

**Raccomandato per YACA**:

- 1-5 req/s per utente durante un push completo; nessun parallelismo selvaggio sulle sei risorse;
- batch da 500 (vedi §4) invece di una chiamata per item;
- su 429: `Retry-After` se c'è, altrimenti `500ms * 2^n` con jitter, cap 3-5 tentativi, poi errore
  non silenzioso;
- idempotenza: i push di library/progress/history sono idempotenti per costruzione; collections e
  addons no, quindi il retry va fatto solo dopo un pull di verifica **[T]**.

---

## 4. Matrice endpoint

Legenda colonne: **Auth** = `apikey` + `Bearer` salvo diversa indicazione; **Sync** = strategia
**[D r. 1785-1796]**.

### 4.1 Auth e profili

| Endpoint | Metodo | Auth | Payload | Risposta | Errori tipici | Sync |
|---|---|---|---|---|---|---|
| `/auth/v1/signup` | POST | apikey | `{email,password}` | `200` sessione + user | 400 email/password, 422, 429 | — |
| `/auth/v1/token?grant_type=password` | POST | apikey | `{email,password}` | `200` sessione | 400 credenziali, 429 | — |
| `/auth/v1/token?grant_type=refresh_token` | POST | apikey | `{refresh_token}` | `200` nuova coppia token | 400 `invalid_grant`, 401 | — |
| `/auth/v1/logout` | POST | Bearer | — | `204` | 401 | — |
| `/auth/v1/user` | GET | Bearer | — | `200` user | 401 | — |
| `rpc/sync_pull_profiles` | POST | Bearer | nessun body | `200` array profili | 401/403 | lettura |
| `rpc/sync_push_profiles` | POST | Bearer | `{p_profiles[], p_client_max_profiles?}` | `204` | 400 indice fuori range, 401/403 | **full replace** su `1..max` |
| `rpc/sync_delete_profile_data` | POST | Bearer | `{p_profile_id}` | `204` | 401/403/404 | distruttivo |

Dettagli che la matrice non dice:

- `p_profiles` è la lista **completa**; i profili omessi vengono **cancellati** per gli slot
  `1..p_client_max_profiles` **[D r. 331]**. Con `p_client_max_profiles` omesso il default è **4**
  **[D r. 371]**: su un account a 6 profili, un push "ingenuo" cancella i profili 5 e 6 e i loro
  dati.
- Campi profilo documentati: `profile_index` (1..6), `name`, `avatar_color_hex`,
  `uses_primary_addons`, `avatar_id`, `avatar_url` **[D r. 373-382]**. `avatar_url` vince su
  `avatar_id`; `null`/`""` lo cancella.
- NuvioTV invia anche `uses_primary_plugins`, `profile_background_id`, `profile_background_url` e
  `p_origin_client_id` **[C ProfileSyncService.kt:80-88]**: accettati dal backend, **non
  documentati**.
- `profile_id` (addons/library/...) e `profile_index` (profiles) sono **lo stesso intero**, non un
  UUID. L'UUID è `profiles.id`, che il client non usa come chiave di scope.
- `sync_delete_profile_data` cancella addons, collections, progress, library, watched items e la
  riga profilo **[D r. 388-409]**. Non è reversibile.

### 4.2 Addons

| Endpoint | Metodo | Auth | Payload | Risposta | Errori tipici | Sync |
|---|---|---|---|---|---|---|
| `/rest/v1/addons?select=*&profile_id=eq.N&order=sort_order` | GET | Bearer | query PostgREST | `200` array addons | 401/403 | lettura |
| `rpc/sync_push_addons` | POST | Bearer | `{p_profile_id, p_addons[]}` | `204` | 400, 401/403 | **full replace** |

- Campi: `url` (obbligatorio), `name`, `enabled` (default `true`), `sort_order` (default `0`)
  **[D r. 490-497]**.
- **Dedup**: chiave `md5(url)` per utente e profilo; un push aggiorna una riga solo se cambiano
  `name`, `enabled` o `sort_order` **[D r. 499]**. `md5` è calcolato sulla **stringa URL**, non su
  una forma canonica: `.../manifest.json` e `...` sono due addon diversi **[T]**.
- NuvioTV canonicalizza l'URL solo per le mappe locali nome/enabled, ma **pusha l'URL grezzo**
  **[C AddonSyncService.kt:61-63, 134-145]**. Kaptain normalizza per confrontare ma pusha il grezzo
  **[C nuvio-push.js:47-53, 1000-1013]**. Nessuno dei due risolve il problema alla radice.
- NuvioTV invia `p_origin_client_id` **[C AddonSyncService.kt:74]**, assente dalla docs.
- Push e pull hanno semantica diversa: il push è replace, il pull è `select` + `order by
  sort_order` e riconcilia in locale con `removeMissingLocal = true`
  **[C StartupSyncService.kt:593-607]**. Una cancellazione remota diventa una cancellazione locale.

### 4.3 Library

| Endpoint | Metodo | Auth | Payload | Risposta | Errori | Sync |
|---|---|---|---|---|---|---|
| `rpc/sync_pull_library` | POST | Bearer | `{p_profile_id, p_limit=500, p_offset=0}` | `200` pagina, `added_at DESC` | 401/403 | snapshot |
| `rpc/sync_get_library_delta_cursor` | POST | Bearer | `{p_profile_id}` | `200` intero (0 se vuoto) | 401/403 | cursore |
| `rpc/sync_pull_library_delta` | POST | Bearer | `{p_profile_id, p_since_event_id, p_limit=1000}` | `200` eventi `event_id ASC` | 401/403 | delta |
| `rpc/sync_push_library_items` | POST | Bearer | `{p_profile_id, p_items[], p_origin_client_id?}` | `204` | 400, 401/403 | **upsert incrementale** |
| `rpc/sync_delete_library_items` | POST | Bearer | `{p_profile_id, p_keys[], p_origin_client_id?}` | `204` | 400, 401/403 | **delete incrementale** |
| `rpc/sync_push_library` | POST | Bearer | `{p_profile_id, p_items[]}` | `204` | 400 | **full replace legacy** |

- Bootstrap corretto, nell'ordine: cursore → tutte le pagine di snapshot → delta dal cursore
  catturato → salvare il massimo `event_id` **[D r. 511-518, 1798-1807]**. NuvioTV fa esattamente
  questo **[C LibrarySyncService.kt:65-100]**.
- Pagina snapshot consigliata 500; delta `p_limit` clamped `1..1000` **[D r. 546, 656]**.
- Batch di scrittura: **massimo 500 item** per `sync_push_library_items` e **500 chiavi** per
  `sync_delete_library_items` **[D r. 766, 804]**. NuvioTV usa 500 per entrambi
  **[C library/LibrarySyncPaging.kt:3-5]**.
- Identità di un item: `(content_id, content_type)` **[D r. 511-518]**.
- `added_at` è epoch **millisecondi** **[D r. 594]**.

### 4.4 Watch progress

| Endpoint | Metodo | Auth | Payload | Risposta | Errori | Sync |
|---|---|---|---|---|---|---|
| `rpc/sync_pull_watch_progress` | POST | Bearer | `{p_profile_id, p_since_last_watched?, p_limit?}` | `200` righe, `last_watched DESC` | 401/403 | snapshot |
| `rpc/sync_get_watch_progress_delta_cursor` | POST | Bearer | `{p_profile_id}` | `200` intero | 401/403 | cursore |
| `rpc/sync_pull_watch_progress_delta` | POST | Bearer | `{p_profile_id, p_since_event_id, p_limit=1000}` | `200` eventi upsert/delete | 401/403 | delta |
| `rpc/sync_push_watch_progress` | POST | Bearer | `{p_profile_id, p_entries[]}` | `204` | 400, 401/403 | **merge upsert** |
| `rpc/sync_delete_watch_progress` | POST | Bearer | `{p_keys[]}` **oppure** `{p_progress_key}` + `p_profile_id` | `204` | 400, 401/403 | delete esplicito |

- Senza `p_since_last_watched` il server restituisce al massimo **200** righe **[D r. 878-880]**.
- **Completion handling**: se `duration >= 60000` e `position >= 90%` di `duration`, il server
  crea/aggiorna anche un watched item; il server "may ignore tiny progress changes"
  **[D r. 1072-1074]**. Due effetti per YACA: scrivere progress **sporca la history**, e la soglia
  dei "tiny changes" non è documentata **[T]**.
- `progress_key` è calcolato dal server con un trigger a partire da `content_id`/`season`/`episode`
  **[D r. 1809-1820]**, ma NuvioTV lo invia comunque nel payload **[C WatchProgressSyncService.kt:187]**.
  Inviarlo è tollerato; inviarlo **sbagliato** è un rischio **[T]**.

### 4.5 Watch history

| Endpoint | Metodo | Auth | Payload | Risposta | Errori | Sync |
|---|---|---|---|---|---|---|
| `rpc/sync_pull_watched_items` | POST | Bearer | `{p_profile_id, p_page=1, p_page_size=100000}` | `200`, `watched_at DESC` | 401/403 | snapshot |
| `rpc/sync_get_watched_items_delta_cursor` | POST | Bearer | `{p_profile_id}` | `200` intero | 401/403 | cursore |
| `rpc/sync_pull_watched_items_delta` | POST | Bearer | `{p_profile_id, p_since_event_id, p_limit=1000}` | `200` eventi | 401/403 | delta |
| `rpc/sync_push_watched_items` | POST | Bearer | `{p_profile_id, p_items[]}` | `204` | 400, 401/403 | **merge upsert** |
| `rpc/sync_delete_watched_items` | POST | Bearer | `{p_profile_id, p_keys:[{content_id,season?,episode?}]}` | `204` | 400, 401/403 | delete esplicito |

- `p_page_size` default dichiarato **100000** **[D r. 1147]**: è un default pericoloso lato client
  (risposta enorme). NuvioTV usa 900 **[C WatchedItemsSyncService.kt:31]**.
- Per una serie la chiave include `season` ed `episode`; per un film bastano `content_id`
  **[D r. 1312-1343]**.
- La history distingue gli episodi quando `season`/`episode` ci sono (la chiave di delete per le
  serie li richiede), ma il payload ammette anche una riga di serie senza episodio
  **[D r. 1312-1343]**.

### 4.6 Profile settings

| Endpoint | Metodo | Auth | Payload | Risposta | Errori | Sync |
|---|---|---|---|---|---|---|
| `rpc/sync_pull_profile_settings_blob` | POST | Bearer | `{p_profile_id, p_platform="tv"}` | `200` `[{profile_id, settings_json, updated_at}]` | 401/403 | lettura |
| `rpc/sync_push_profile_settings_blob` | POST | Bearer | `{p_profile_id, p_platform="tv", p_settings_json}` | `204` | 400, 401/403 | **blob upsert atomico** |

- `settings_json` è un oggetto libero: **nessuno schema lato server** **[D r. 1391]**.
- `p_platform` è un namespace: `tv`, `mobile`, `desktop` sono righe **separate**. Scrivere solo
  `tv` non aggiorna il telefono. NuvioTV scrive sempre `"tv"` **[C ProfileSettingsSyncService.kt:67,
  397, 408]**; Kaptain legge e scrive `tv`, `mobile`, `desktop` separatamente
  **[C nuvio-push.js:1338-1343, 1401-1407]**.
- La forma reale del blob TV è `{version:1, features:{<feature>:{<key>:{type,value}}}}`
  **[C ProfileSettingsSyncService.kt:467-486]**. La TV **sostituisce l'intero gruppo** che riceve
  **[C nuvio-push.js:1207-1208]**: un merge parziale per chiave non è sicuro.
- Kaptain usa una variante **guarded** con `p_expected_updated_at` e conflitto `40001`
  ("changed on another device") **[C nuvio-push.js:1209-1250]**, non documentata.

### 4.7 Home catalog settings

| Endpoint | Metodo | Auth | Payload | Risposta | Errori | Sync |
|---|---|---|---|---|---|---|
| `rpc/sync_pull_home_catalog_settings` | POST | Bearer | `{p_profile_id, p_platform}` | `200` `[{settings_json, updated_at}]` | 401/403, **300** se ambiguo **[C]** | lettura |
| `rpc/sync_push_home_catalog_settings` | POST | Bearer | `{p_profile_id, p_platform, p_settings_json}` | `204` | 400, 401/403 | **blob upsert** |

- **Docs e realtà divergono**. La docs mostra `{rows:[], hidden_catalogs:[]}` e default
  `p_platform="tv"` **[D r. 1454-1463, 1493]**.
- Il payload reale, in due client indipendenti, è
  `{hide_unreleased_content: bool, items:[{addon_id, type, catalog_id, enabled, order,
  custom_title, is_collection, collection_id}]}` **[C HomeCatalogSettingsSyncService.kt:36-52;
  nuvio-push.js:1016-1055]**.
- La piattaforma reale è **`home_catalog_shared`**, una sola lista condivisa da TV e telefono
  **[C HomeCatalogSettingsSyncService.kt:32; nuvio-push.js:21-22]**. Kaptain annota che senza
  `p_platform` la RPC risponde **HTTP 300** perché è overloaded **[C nuvio-push.js:1020-1022]**.
- NuvioTV fa **merge per chiave** del JSON remoto con il locale prima del push, con il locale che
  vince sulle chiavi sovrapposte **[C HomeCatalogSettingsSyncService.kt:64-70, 241-250]**. Il pull
  non sovrascrive il locale se il remoto è assente o vuoto **[C ivi:152-167]**. È una strategia
  conservativa, non un replace.
- Kaptain invece ricostruisce l'array `items` e conserva i campi di primo livello sconosciuti
  **[C nuvio-push.js:1032-1061]**; per nascondere i cataloghi che non devono comparire in Home
  scrive righe `enabled:false` esplicite **[C nuvio-push.js:1168-1189]**. Il motivo è che un
  catalogo senza riga salvata **può comparire lo stesso** in Home **[C ivi:1126-1128]**.

Questa è la superficie con il rapporto rischio/beneficio peggiore della API: schema non
documentato, nessuna versione, una piattaforma condivisa e un default che può produrre 300.

### 4.8 Collections

| Endpoint | Metodo | Auth | Payload | Risposta | Errori | Sync |
|---|---|---|---|---|---|---|
| `rpc/sync_pull_collections` | POST | Bearer | `{p_profile_id}` | `200` `[{profile_id, collections_json, updated_at}]` | 401/403 | lettura |
| `rpc/sync_push_collections` | POST | Bearer | `{p_profile_id, p_collections_json}` | `204` | 400, 401/403 | **full replace del blob** |

- Replace totale: `[]` cancella tutto **[D r. 1590-1619]**.
- Lo schema `collection/folder/catalogSource` è nella docs **[D r. 1503-1589]** ma **non è validato
  dal server**: la docs non dichiara alcuna validazione e i client si scambiano campi che la docs non
  elenca (es. `focusGifUrl`, `titleLogoUrl`). Quanto ai campi unknown, il blob viene restituito
  com'è stato scritto, ma la conservazione va verificata **[T]**. Lo schema reale e i campi artwork
  sono materia del ticket 02.
- Il client mobile **rifiuta l'intera lista** se un `catalogSources` non è un puntatore ben formato
  `{type, addonId, catalogId}`; il TV lo tollera. Kaptain sanifica prima del push per questo
  **[C nuvio-push.js:343-382]**.
- `addonId` è il **manifest `id` dell'addon**, non l'URL: la risoluzione è
  `addons.firstOrNull { it.id == source.addonId }` **[C CatalogReference.kt:21-30]**. Per YACA
  significa che il manifest id (`org.stremio.yaca.catalog`, `src/stremio/manifest.js:59`) è parte
  del contratto pubblico delle collections.
- Kaptain fa pull → merge per `id` → push completo **[C nuvio-push.js:520-554;
  collection-merge.js:1-25]**, e tiene snapshot/rollback in IndexedDB
  **[C profile-snapshots.js:1-17]**. È l'unico modo corretto di usare questo endpoint.

### 4.9 Sync overview e health

| Endpoint | Metodo | Auth | Payload | Risposta | Errori | Sync |
|---|---|---|---|---|---|---|
| `rpc/get_sync_overview` | POST | Bearer | nessun body | `200` conteggi per profilo | 401/403 | lettura |
| `rpc/health_ping` | POST | apikey | `{}` | `200` `true` | 429, 5xx | diagnostica |
| `/functions/v1/health-check` | GET | nessuna | — | `200` `{status,database,latency_ms,timestamp}` | 5xx | diagnostica |

- `get_sync_overview` copre **solo** addons, library items, watch progress, watched items e profili:
  **non** collections, settings, home catalog **[D r. 1711-1738]**. Non è un modo per sapere se il
  push di collections è andato a buon fine: per quello serve un pull di verifica.
- `health-check` verificato: `200 {"status":"healthy","database":"connected","latency_ms":2,...}`
  **[P, 20/10/2026]**.
- `health_ping` verificato: `200 true` **[P]**.
- `get_avatar_catalog` non richiede auth **[D r. 1627]** ed è verificato `200` **[P]**. Fuori scope
  (P14), ma è utile come test di connettività senza token.

---

## 5. Full replace: elenco esplicito e conseguenze

**Endpoint che cancellano ciò che non ricevono**:

1. `sync_push_profiles` — cancella i profili omessi negli slot `1..p_client_max_profiles`
   **[D r. 331]**. Default 4 se il parametro manca **[D r. 371]**.
2. `sync_push_addons` — cancella gli addon omessi per quel profilo **[D r. 459]**.
3. `sync_push_collections` — sostituisce l'intero blob del profilo **[D r. 1592]**.
4. `sync_push_library` — replace legacy, sconsigliato ai nuovi client **[D r. 808-847]**.

**Cosa succede con un payload parziale** (la parte che la docs dice in una riga e che nella pratica
è il rischio principale):

- **Addons**: gli addon non inviati spariscono dal cloud. Al successivo avvio, NuvioTV riconcilia
  con `removeMissingLocal = true` **[C StartupSyncService.kt:593-607]**: la cancellazione arriva
  anche sui dispositivi, insieme a nome/enabled/sort_order. L'utente perde anche l'ordine.
- **Collections**: le collection non inviate spariscono. Non c'è tombstone né undo lato server;
  Kaptain lo compensa con snapshot locali **[C profile-snapshots.js:1-17]**. Se YACA non ha una
  copia, il dato è perso.
- **Profili**: i profili 5-6 vengono cancellati se il push non li include e
  `p_client_max_profiles` è omesso. `sync_delete_profile_data` cancella anche addons, collections,
  progress, library e watched items di quel profilo **[D r. 388-409]**. È l'operazione più
  distruttiva della API.
- **Library legacy**: stessa logica, ma i nuovi endpoint `sync_push_library_items` /
  `sync_delete_library_items` esistono proprio per evitarla **[D r. 705-806]**.
- **Settings e home**: il blob è atomico per `(profilo, piattaforma)`. Un blob costruito da zero
  cancella tutte le chiavi che l'app conosce ma che YACA non conosce. Per questo NuvioTV fa merge
  per chiave e Kaptain rilegge prima di scrivere.

**Regola**: YACA non chiama mai un full replace con uno stato che non ha appena riletto. Il ciclo è
sempre `pull → merge → push → pull di verifica`.

---

## 6. Identità: i campi che decidono la deduplica

| Campo | Dove | Formato / regola | Fonte |
|---|---|---|---|
| `profile_id` / `profile_index` | tutte le risorse | intero **1..6**, non UUID; `profile_index` nei profili, `profile_id` nelle altre tabelle | [D r. 275-279, 318; C SupabaseModels.kt:22,36,110] |
| `content_id` | library, progress, history | stringa con prefisso provider, es. `tmdb:550`; nessuna validazione lato server | [D r. 583, 921] |
| `content_type` | library, progress, history | `movie` o `series` | [D r. 581] |
| `progress_key` | watch progress | film: `{content_id}`; episodio: `{content_id}_s{season}e{episode}`; calcolato dal server con trigger | [D r. 1809-1820] |
| `event_id` | delta library/progress/history | intero monotono **per profilo**; salvare il massimo applicato; paginare finché la pagina è corta | [D r. 511-518, 629-660, 1798-1807] |
| `sort_order` | addons, plugins | intero **0-based**; l'ordine è la posizione nell'array al momento del push | [D r. 495-497; C AddonSyncService.kt:58-75] |
| `md5(url)` | addons | chiave di dedup per utente+profilo sulla **stringa URL**; update solo se cambiano `name`/`enabled`/`sort_order` | [D r. 499] |
| `(content_id, content_type)` | library | identità di un item; usata da upsert e delete | [D r. 705-806] |
| `(content_id, season, episode)` | watch history | identità di un episodio; `season`/`episode` richiesti per le serie | [D r. 1312-1343] |
| `p_origin_client_id` | library (documentato), altri RPC (osservato) | stringa stabile 16-96 char `[A-Za-z0-9_-]`, es. `nuvio-tv-<32>`; finisce negli eventi di sync | [D r. 747, 802; C SyncClientIdentity.kt:11-14, 51-52] |

Note:

- `content_id` non è validato: `tmdb:550`, `tt0137523`, `kitsu:123` sono tutti accettati. La
  coerenza con gli addon è responsabilità del client (ticket 04/09).
- `progress_key` è ridondante rispetto a `content_id+season+episode`, ma è la chiave di dedup. Se
  YACA lo invia, deve essere **identico** a quello che calcolerebbe il server **[T]**.
- `event_id` non è globale: è un cursore per profilo e per risorsa. Tre cursori separati (library,
  progress, history) vanno salvati separatamente.
- `md5(url)` premia URL canonicali. YACA deve decidere **una** forma (`https://host/base` senza
  `/manifest.json`, senza slash finale) e usarla sempre **[T]**.

---

## 7. Sync strategy per risorsa: cosa YACA può pushare

| Risorsa | Lettura | Scrittura | Strategia corretta per YACA | Rischio se sbagliata |
|---|---|---|---|---|
| **Profili** | `sync_pull_profiles` | `sync_push_profiles` | pull → modificare **solo** i campi del profilo target → push completo con `p_client_max_profiles: 6` | cancellazione profili 5-6 e dei loro dati |
| **Addons** | `GET /rest/v1/addons?profile_id=eq.N` | `sync_push_addons` | pull → merge per URL canonico → push **tutti** gli addon del profilo | perdita addon e ordine; propagazione locale |
| **Library** | snapshot + delta | `sync_push_library_items` / `sync_delete_library_items` | **solo mutazioni incrementali**, batch 500; snapshot/delta solo per bootstrap | con il legacy: cancellazione della library |
| **Watch progress** | snapshot + delta | `sync_push_watch_progress` | upsert dei soli cambi; niente full replace (non esiste); delete espliciti | history sporca per la regola 90% |
| **Watch history** | snapshot + delta | `sync_push_watched_items` | upsert per `(content_id, season, episode)` | duplicati se la chiave è sbagliata |
| **Profile settings** | `sync_pull_profile_settings_blob` per piattaforma | `sync_push_profile_settings_blob` | pull → modificare **un gruppo `features` completo** → push per ogni piattaforma | sovrascrittura di gruppi che la TV sostituisce in blocco |
| **Home catalog** | `sync_pull_home_catalog_settings` (`home_catalog_shared`) | `sync_push_home_catalog_settings` | pull → merge per chiave/`items` → push conservando i campi unknown | Home vuota o righe duplicate; 300 se manca `p_platform` |
| **Collections** | `sync_pull_collections` | `sync_push_collections` | pull → merge per `id` → push completo; sanitizzare `catalogSources` | perdita collection utente; lista rifiutata dal mobile |

**Cosa YACA può pushare in sicurezza, oggi**: library (incrementale), watch progress/history
(merge), profile settings (per gruppo, con pull), addons (con pull e merge completo), collections
(con pull e merge completo, dopo il ticket 02). **Cosa richiede un test prima**: home catalog
(ticket 03) e qualunque campo non documentato dei settings.

**Cosa YACA non deve fare**: scrivere watch progress/history come "segnale" — è fuori scope nella
mappa (**Out of scope**, `map.md:147-148`) e la regola del 90% trasforma il progress in history.
La lettura resta l'uso legittimo (ticket 08).

---

## 8. Notice, licenza, trademark, hosted service

Il testo è breve e va letto alla lettera **[D r. 7-12]**:

> "The Nuvio open-source project includes this documentation under the same project license unless
> stated otherwise. That license does not grant rights to Nuvio names, logos, branding, or access to
> the hosted Nuvio service. Separate terms, trademark rules, or service restrictions may apply."

> "This reference documents the officially supported public API. Endpoints and workflows not listed
> here are internal and may change without notice. It does not cover private or operational
> endpoints or destructive account flows."

Implicazioni:

1. **La licenza del codice non è una licenza sul servizio.** Usare l'API significa usare
   `api.nuvio.tv`, un servizio ospitato: la licenza del progetto non dà diritto di accesso, né
   quota, né SLA.
2. **Trademark**: YACA non può usare nome/logo Nuvio come se fosse endorsato. "Compatibile con
   Nuvio" è una descrizione; "Nuvio" nel nome del prodotto è un rischio (ticket 13).
3. **Endpoint interni**: tutto ciò che non è nella tabella finale **[D r. 1979-2012]** può cambiare
   senza preavviso. Questo include tutto ciò che YACA dovrebbe usare per PIN, plugin, credenziali e
   scritture puntuali.
4. **Nessun ToS pubblico linkato dalla docs**: non c'è un documento di termini allegato, né una
   quota, né una policy su rivendita/uso commerciale. Va chiesto o verificato sul sito **[T]**.
5. **Privacy**: i dati vanno a `api.nuvio.tv` (Supabase). YACA che fa da intermediario vede email,
   token e contenuti della library. È materia del ticket 13, ma la API non offre alcun modello di
   delega: non esistono token a scopo limitato, scope OAuth o service account.

---

## 9. Cosa manca: la lista dei test

Tutto ciò che segue è **[T]**. Ognuno va fatto su un **account usa-e-getta con 6 profili**, mai
sull'account di un utente.

**Auth**

1. Durata reale dell'access token: leggere `expires_at`/`exp` e confrontarlo con `expires_in: 3600`.
   Decide la frequenza di refresh e la durata di una sessione YACA.
2. Rotazione del refresh token: il vecchio refresh token resta valido dopo l'uso? Due refresh
   concorrenti cosa restituiscono?
3. Comportamento con 2FA/passkey attivi: il grant `password` funziona o richiede un secondo passo
   non documentato?
4. `logout?scope=local` vs `logout`: il refresh token viene revocato in entrambi i casi?

**Rate limit**

5. Soglia che produce 429: burst di 100, 500, 900 req/s. Body e header della risposta.
6. `Retry-After` è presente? In secondi o HTTP-date? Il contatore è per chiave o globale?

**Contratti non documentati**

7. `p_origin_client_id` è accettato da **tutti** gli RPC o solo da library? Cosa succede se manca?
8. `sync_push_profiles` **senza** `p_client_max_profiles` su un account a 6 profili: i profili 5-6
   vengono davvero cancellati? (Test da fare su account usa-e-getta, con backup.)
9. `sync_pull_home_catalog_settings` senza `p_platform`: 300? E `"tv"` vs `"home_catalog_shared"`
   sono righe diverse o la stessa?
10. Blob settings: scrivere una chiave sconosciuta e rileggerla. Viene conservata?
11. Collections: limite di dimensione del blob; campi unknown conservati? `sources` e
    `catalogSources` coesistono o uno vince?
12. Addons: push di `https://x/manifest.json` e poi `https://x` — una riga o due?
13. Library delta: cosa succede con più di 1000 eventi tra due pull? Il cursore avanza o si può
    perdere un evento?
14. `sync_pull_watched_items` con `p_page_size` default 100000: il server risponde davvero con
    tutto o cappa?
15. Progress: soglia dei "tiny changes"; la regola 90% scatta anche su un push parziale? Inviare
    un `progress_key` incoerente con `content_id`/`season`/`episode` cosa produce?
16. `sync_delete_watch_progress` con `p_keys: []`: no-op o errore?
17. Concorrenza: due client che pushano settings insieme. Il guarded RPC è l'unico modo per
    ottenere `40001`, o anche il push semplice ha un controllo?
18. CORS: la API accetta `Origin` arbitrari? Kaptain funziona da browser statico
    **[C, implicito]**, ma va confermato con un preflight **[T]**.
19. Sign-up: quota per IP/email, enumerazione email, comportamento con email già registrata.

---

## 10. Cosa significa per YACA

1. **YACA è un client di sync, non un servizio.** Non esiste una chiave server-to-server: ogni
   scrittura usa il token dell'utente. Il prodotto "Sync" è quindi un'app/CLI/browser che l'utente
   autorizza con le proprie credenziali Nuvio, non un job centrale di YACA Cloud. Questo vincola
   hosting, consenso e modello di fiducia (ticket 13) e il modo di prodotto (ticket 14).

2. **La lettura è la parte facile e sicura.** Library, progress e history hanno delta con cursore,
   snapshot paginato e merge non distruttivo: sono il modo giusto per costruire il segnale di gusto
   del DNA (ticket 08) senza scrivere nulla. Il bootstrap è deterministico: cursore → snapshot →
   delta, per profilo 1..6.

3. **La scrittura è un problema di merge, non di endpoint.** Collections, addons e profili sono
   full replace: YACA deve possedere un motore `pull → merge → push → verify` con ID stabili,
   backup e rollback (ticket 11). Senza, il primo push cancella le modifiche dell'utente e le app
   Nuvio propagano la cancellazione anche in locale.

4. **L'home layout non è pronto per il prodotto.** Schema non documentato, piattaforma
   `home_catalog_shared`, nessuna versione, default che può produrre 300, e righe `enabled:false`
   necessarie per evitare che i cataloghi "spillino" in Home. Va trattato come superficie
   sperimentale (ticket 03), non come MVP.

5. **Le collections sono la superficie naturale di YACA, ma il contratto è più stretto della
   docs.** `addonId` è il manifest id, il mobile rifiuta l'intera lista se un `catalogSources` è
   malformato, e il full replace non perdona. YACA ha già un manifest id stabile
   (`org.stremio.yaca.catalog`) e un modello di catalogs: il mapping va progettato insieme a
   ticket 02 e 09, non improvvisato.

---

## 11. Domande aperte

- YACA vuole essere **client di sync** (token utente) o solo **addon** (nessuna scrittura)? È la
  decisione che rende utili o inutili tutti gli endpoint di questa nota.
- Chi possiede lo stato di merge: YACA in locale, o Nuvio come fonte di verità? Se YACA tiene un
  DB, cosa succede se l'utente modifica da TV mentre YACA ha una copia vecchia?
- Possiamo chiedere all'utente la password Nuvio, o serve un flusso di delega che Nuvio non offre?
  (Oggi l'unica auth è email+password; non c'è OAuth.)
- Quanto è stabile `home_catalog_shared`? Esiste un Piano B (non toccare la Home e usare solo
  collections)?
- Il `p_origin_client_id` serve a YACA per audit/undo, o è solo un'etichetta?
- La licenza/trademark consente a YACA di dichiararsi "per Nuvio" in homepage e nel manifest?
- Nuvio pubblicherà una policy di deprecazione o un ToS? Senza, ogni integrazione è a rischio
  silenzioso.
- Il multi-profilo (ticket 05) si affronta con 6 profili nativi o con un solo profilo e collection
  per persona?

---

## Fonti primarie

**Documentazione**

- `https://nuvio.tv/docs/nuvio-public-api.md` — v1.3, 20/08/2026, 2036 righe, letto il 20/10/2026.
  La pagina `https://nuvio.tv/docs` è CSR e carica solo questo markdown.

**NuvioTV** — `https://github.com/NuvioMedia/NuvioTV`, branch `dev`, commit
`f062601cc6b9561c4a50aa7ab7464d7ddc555c5e` (20/10/2026):

- `app/src/main/java/com/nuvio/tv/core/sync/AddonSyncService.kt`
- `.../core/sync/ProfileSyncService.kt`
- `.../core/sync/CollectionSyncService.kt`
- `.../core/sync/HomeCatalogSettingsSyncService.kt`
- `.../core/sync/ProfileSettingsSyncService.kt`
- `.../core/sync/PluginSyncService.kt`
- `.../core/sync/LibrarySyncService.kt`
- `.../core/sync/WatchProgressSyncService.kt`
- `.../core/sync/WatchedItemsSyncService.kt`
- `.../core/sync/SyncClientIdentity.kt`
- `.../core/sync/StartupSyncService.kt`
- `.../core/sync/library/LibrarySyncPaging.kt`
- `.../core/auth/AuthManager.kt`
- `.../core/profile/ProfileManager.kt`
- `.../data/remote/supabase/SupabaseModels.kt`
- `.../data/remote/supabase/SupabaseLibrarySyncRemoteDataSource.kt`
- `.../data/local/LayoutPreferenceDataStore.kt`
- `.../data/mapper/AddonMapper.kt`
- `.../domain/model/CatalogReference.kt`
- `.../domain/model/CatalogDescriptorExtensions.kt`

**Kaptain** — `https://www.kaptain.stream/nuvio-push.js?v=106.9` (letto il 20/10/2026), più
`collection-merge.js` e `profile-snapshots.js` dallo stesso sito.

**YACA** (solo per le conseguenze):

- `src/stremio/manifest.js:57-75` — manifest id `org.stremio.yaca.catalog`.
- `src/stremio/collection.js:80` — l'addon Stremio è ritrovato per `manifest.id`.
- `.scratch/nuvio-native/map.md:147-148` — watch progress/history in scrittura è fuori scope.

**Probe pubblici del 20/10/2026** (read-only, nessun account):

- `GET https://api.nuvio.tv/functions/v1/health-check` → `200`, `{"status":"healthy",...}`.
- `POST https://api.nuvio.tv/rest/v1/rpc/health_ping` (apikey) → `200 true`;
  header `ratelimit-limit: 900`, `x-ratelimit-limit-second: 900`.
- `POST https://api.nuvio.tv/rest/v1/rpc/get_avatar_catalog` (apikey) → `200`, array;
  stessi header di rate limit.
- `GET https://api.nuvio.tv/auth/v1/settings` (apikey) → `200`,
  `mailer_autoconfirm: true`, `disable_signup: false`, `passkeys_enabled: true`,
  `anonymous_users: true`, `phone: false`.
