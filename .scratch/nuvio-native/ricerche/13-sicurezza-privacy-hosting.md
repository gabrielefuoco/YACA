# 13 — Sicurezza, privacy, termini e hosting: account-level Nuvio e poster globale

**Data**: 20/10/2026 · **Ticket**: `issues/13-sicurezza-privacy-hosting.md` · **Punti**: P27, P29
**Natura**: ricerca. Nessuna modifica al prodotto, nessun cambio di status del ticket.

## Come leggere questa nota

Ogni affermazione porta uno di questi marcatori:

- **[D] documentato** — documentazione ufficiale Nuvio v1.3
  (`https://nuvio.tv/docs/nuvio-public-api.md`, 2036 righe, letto il 20/10/2026), Terms of Service
  (`https://nuvio.tv/terms`, last updated 8/08/2026), Privacy Policy
  (`https://nuvio.tv/privacy-policy`, last updated 8/08/2026), Account deletion
  (`https://nuvio.tv/account-deletion`), oppure documentazione ufficiale di un fornitore (Cloudflare,
  Bunny, DigitalOcean, MongoDB, Tailscale). `r. N` = riga del markdown Nuvio.
- **[C] osservato nel codice** — NuvioTV (branch `dev`, commit
  `f062601cc6b9561c4a50aa7ab7464d7ddc555c5e`, come nella nota 01), Kaptain
  (`https://www.kaptain.stream/nuvio-push.js?v=106.9`, 1572 righe), YACA, Pictorium
  (`github.com/Eful97/Pictorium`, branch `master`, letto il 20/10/2026). `path:riga`.
- **[P] verificato con una chiamata pubblica** il 20/10/2026, senza account e senza scritture.
- **[T] da testare** su un account Nuvio usa-e-getta con 6 profili. Non è un'ipotesi presentata
  come fatto.

La nota 01 (`ricerche/01-api-pubblica-nuvio.md`) copre il contratto dell'API nel dettaglio. Qui
l'attenzione è su ciò che decide se un push account e un poster endpoint globale sono **fattibili
senza creare un rischio che YACA non può sostenere**.

---

## Risposta in breve

1. **L'integrazione account-level è una delega di credenziali, non un'OAuth app.** La API pubblica
   Nuvio conosce solo email+password → `access_token` + `refresh_token`; non ci sono scope, client
   registration, token per-app, token per-profilo o flusso di delega **[D r. 107-114, 175-245,
   1979-2012]**. Il token vede e scrive **tutto l'account**, tutti i 6 profili.
2. **La password Nuvio non deve mai arrivare ai server YACA.** Il modo a rischio più basso è il
   modello Kaptain: browser → `api.nuvio.tv`, password in memoria, token nel browser, nessun backend
   che li riceve **[C nuvio-push.js:4-6, 198-214]**. YACA oggi fa l'opposto con Stremio: riceve la
   password sul server, la inoltra e conserva l'`authKey` in chiaro
   **[C src/api/auth/index.js:81-123; src/models/UserAccount.js:27-33]**.
3. **Il push account è fattibile in sicurezza solo come azione one-shot dal browser**, o come
   opt-in server-side con refresh token cifrato, dopo aver chiuso le falle che YACA ha già. Per
   l'MVP: **poster URL + collections**, non sync account.
4. **Il poster endpoint globale è un servizio pubblico senza token utente.** Non c'è autenticazione
   possibile lato Nuvio: il client fa una GET anonima. La sicurezza è quindi **abuso, costo, cache e
   privacy dei log**, non auth. Può stare in YACA Cloud anche se l'account sync resta self-hosted.
5. **Self-hosted vs YACA Cloud non è una scelta di hosting: è una scelta su chi possiede i token.**
   Self-hosted = i token restano dell'utente; YACA Cloud account-level = YACA diventa un deposito
   centrale di refresh token, con obblighi GDPR, incident response, cancellazione e backup.
6. **I termini Nuvio vietano ciò che sembra comodo**: usare endpoint interni (PIN, provider
   credentials, guarded settings), bypassare rate limit o profilare credenziali in modo rischioso
   **[D Terms §3, §6]**. La regola è: **solo gli endpoint della tabella pubblica v1.3**.
7. **"Nuvio-native" è un nome interno, non un marchio pubblico.** La licenza del progetto non
   concede nomi, loghi, branding né accesso al servizio hosted **[D r. 8-12]**; i Terms §9 lo
   ripetono. Pubblicamente: "compatibile con Nuvio", senza logo e senza implicare endorsement.
8. **Il poster endpoint globale non sta su Tailscale Funnel.** Funnel ha limiti di banda
   non configurabili e non pubblicati **[D Tailscale Funnel]**; per un endpoint immagini serve
   CDN + object storage. Il costo dominante è il traffico, non lo storage.
9. **Prima di qualsiasi push reale** vanno chiuse almeno: la fuga di token su `/api/user/:userId`,
   l'esposizione di `apiKeys` in `/api/auth/me` e `/api/configure`, l'assenza di cancellazione
   account, i backup non cifrati, l'assenza di revoca sessione e l'assenza di rate limit sul poster.
   Senza queste, aggiungere token Nuvio aumenta solo il danno di una compromissione già possibile.

---

## 1. Perimetro

La nota risponde a due domande che hanno rischi diversi e vanno tenute separate:

| Superficie | Cosa tocca | Credenziali | Rischio principale |
|---|---|---|---|
| **Account-level sync** | library, history, progress, collections, addons, profili, settings | token Nuvio con accesso totale | furto di credenziali, modifica distruttiva, privacy |
| **Poster endpoint globale** | solo ID titolo + stile + immagine | nessuna | abuso, costo, cache, log che rivelano interessi |

Non è un tema legale astratto: è la differenza tra un prodotto che l'utente può autorizzare e
revocare, e un servizio che conserva credenziali di terzi senza un modello di delega.

---

## 2. Threat model

### 2.1 Asset

| Asset | Dove vive oggi / dove vivrebbe | Sensibilità | Note |
|---|---|---|---|
| Password Nuvio | browser, solo durante il login (se si adotta il modello giusto) | **critica** | dà accesso completo all'account; non deve essere persistita |
| `access_token` Nuvio | browser o DB YACA cifrato | alta | scade; la docs dichiara 3600 s **[D r. 198]**, Kaptain osserva ~7 giorni **[C nuvio-push.js:203-205]** — **[T]** |
| `refresh_token` Nuvio | browser (localStorage/sessionStorage) o DB YACA cifrato | **critica** | long-lived, ruota al refresh **[D r. 245]**; se rubato, accesso duraturo |
| Publishable key Nuvio | frontend / documentazione | pubblica | non è un segreto **[D r. 90-105]** |
| Service role key Nuvio | **non deve esistere in YACA** | critica | la docs vieta di esporla **[D r. 103]** |
| Sessione YACA (`yaca_session`) | cookie HttpOnly | alta | JWT 7 giorni, nessuna revoca **[C src/api/auth/index.js:30, 36-45, 228-230]** |
| `stremio` authKey | Mongo `UserAccount.apiKeys.stremio` | **critica** | long-lived, in chiaro, restituita al client **[C src/models/UserAccount.js:27-33; src/api/auth/index.js:208-216]** |
| Trakt access/refresh token | Mongo `UserAccount.apiKeys.trakt*` | alta | in chiaro; disconnect fa solo `$unset` **[C src/configurazione/door.js:271-315]** |
| `ADMIN_PASS` | env / header `x-admin-pass` | alta | password condivisa, nessun 2FA **[C src/api/middleware/adminAuth.js:1-15]** |
| Library/watch history Nuvio | YACA DB, se letta | **alta** | può rivelare gusti, orientamenti, abitudini; trattare come dato ad alto rischio |
| Log richieste poster | stdout Docker / eventuale CDN | media-alta | IP + titolo = interesse per un contenuto |
| Backup MongoDB | Cloudflare R2 | **critica** | gzip non cifrato; contiene token ed email **[C ops/yaca-backup.sh:73-94, 129-137]** |
| Chiave master YACA Cloud | KMS / env | **critica** | se compromessa, decrypt di tutti i token |

### 2.2 Attori e superfici

- **Attaccante esterno**: internet, scanner, credential stuffing, sfruttamento di endpoint pubblici.
- **Utente malintenzionato**: account valido usato per abusare del proxy YACA verso Nuvio, o per
  far rendere poster arbitrari.
- **Dipendenza compromessa**: script frontend, pacchetto npm, immagine GHCR, Watchtower.
- **Insider / operatore**: chi ha accesso al server, a Mongo Atlas, a R2, a GHCR.
- **Nuvio stesso**: cambio API, rate limit, sospensione dell'integrazione **[D Terms §11]**.
- **Titolare di diritti**: poster/key art usati senza licenza.

Superfici: dashboard YACA, `/api/auth/*`, `/api/user/:userId`, `/api/configure`, `/api/profilo`,
`/erdb-poster/*`, `/images/poster/*`, Mongo Atlas, R2, Docker host, GHCR/Watchtower, API Nuvio in
uscita, CDN.

### 2.3 Minacce, mitigazioni, rischio residuo

| # | Minaccia | Come si realizza | Impatto | Mitigazione minima | Residuo |
|---|---|---|---|---|---|
| T1 | **Furto del DB/backup** | dump Mongo o bucket R2 letto da attaccante/insider | tutti i token Nuvio, Stremio, Trakt; email | non conservare refresh token server-side; se inevitabile, envelope encryption con DEK per utente e KEK in KMS; backup cifrati; accesso R2 least-privilege | se la KEK è sullo stesso server, un root compromise decrypta tutto |
| T2 | **XSS / supply chain nel browser** | script malevolo su pagina YACA che legge `localStorage` | token Nuvio della vittima | token in memoria o `sessionStorage`; CSP stretta; nessuno script terzo sulla pagina di auth; SRI; dipendenze pinned | XSS su una pagina che vede la password può rubarla comunque |
| T3 | **IDOR / esposizione token via API** | `GET /api/user/:userId` restituisce `apiKeys` senza sessione; `userId` è nell'URL del manifest | takeover immediato di Stremio/TMDB/Mistral/Trakt; con Nuvio, anche Nuvio | rimuovere `apiKeys` dalla risposta; richiedere sessione; usare `addonUuid` pubblico separato da `userId`; audit di tutte le rotte | endpoint legacy o log possono conservare copie |
| T4 | **Forgiatura sessione YACA** | `JWT_SECRET` leakato o debole; nessuna revoca | accesso a qualsiasi utente per 7 giorni | secret lungo e ruotabile con key ring; TTL breve; `jti` + deny-list; rotazione su logout; 2FA per account Cloud | un secret compromesso resta valido fino alla rotazione |
| T5 | **CSRF** | cookie `SameSite=None` + CORS wildcard; POST cross-site | azioni a nome dell'utente | `SameSite=Lax/Strict` dove possibile; CSRF token o controllo `Origin`; non usare CORS come difesa | embedding cross-origin può richiedere eccezioni |
| T6 | **Brute force / credential stuffing** | `/api/auth/stremio` non ha limiter; admin password condivisa | accesso account, password Nuvio se raccolta | limiter per IP+account; 2FA; password admin lunga e ruotata; lockout; alert | attacchi distribuiti |
| T7 | **Supply chain server** | Watchtower aggiorna l'immagine automaticamente; GHCR compromesso | esecuzione arbitraria con tutti i token | pin del digest, firma immagine (cosign), 2FA GitHub, review dipendenze, deploy staged, no auto-update su servizio che tiene token | un maintainer compromesso può firmare |
| T8 | **Abuso poster endpoint** | richieste massicce, badge arbitrari, on-miss render, disco pieno | DoS, costo CDN, cache poisoning | rate limit per IP; badge allowlist; concurrency cap; timeout; quota disco; LRU; CDN; 404 fail-open | botnet distribuite |
| T9 | **Privacy dei log poster** | log di IP + `tmdb_id` + `u` per ogni richiesta | inferenza degli interessi di un utente | non loggare la coppia IP+titolo; aggregati; retention 24-48h; hash con salt giornaliero; niente analytics terzi | CDN/provider possono loggare comunque |
| T10 | **Token troppo ampio** | un token Nuvio = tutti i profili, tutte le scritture | un bug YACA può cancellare library/collections di tutti i profili | chiedere all'utente quali profili; skip dei profili PIN/kids; push con anteprima e backup; `p_origin_client_id` per audit | non esiste least privilege lato Nuvio |
| T11 | **Bypass PIN** | YACA legge/scrive un profilo `pin_enabled` | violazione dell'aspettativa utente e dei Terms §3 | leggere `pin_enabled`/`pin_locked_until`; saltare i profili locked; non chiamare RPC PIN interne | il token può tecnicamente accedere; la garanzia è contrattuale, non tecnica |
| T12 | **Retry storm / 429 amplification** | retry cieco su scritture non idempotenti | dati duplicati/cancellati, blocco dell'account | retry solo su letture sicure; `Retry-After`; backoff con jitter; pull-verify dopo scrittura | Nuvio può cambiare soglia senza preavviso |
| T13 | **Retention dopo cancellazione** | backup 30 giorni contengono token di account cancellati | dati di persona che non è più utente | retention backup ≤7 giorni o crypto-shredding per utente; deletion job; documentare | backup immutabili/legali possono eccedere |
| T14 | **Violazione Terms / brand** | uso di endpoint interni, nome/logo Nuvio, servizio hosted | rimozione integrazione, richiesta legale | solo API pubbliche; naming descrittivo; no logo; disclaimer; contatto business | Nuvio può restringere l'integrazione a discrezione **[D Terms §4, §11]** |
| T15 | **Copyright artwork** | poster/key art TMDB o di terzi ridistribuiti | takedown, danno reputazionale | attribuzione TMDB; usare solo immagini consentite; niente logo di servizi; policy di rimozione | interpretazione dei termini TMDB |

### 2.4 Il caso peggiore, in una riga

**Un dump di Mongo o un backup R2 letto da un attaccante = tutti i refresh token Nuvio degli utenti
in un colpo solo, senza possibilità di revoca per-app: gli utenti devono cambiare password.** È il
motivo per cui il token server-side è un asset di livello "crown jewel" e il modello browser-only è
preferibile per l'MVP.

---

## 3. Credenziali: dove vivono, per quanto, chi le legge

### 3.1 Password Nuvio

- La API pubblica la accetta in `POST /auth/v1/signup` e `POST /auth/v1/token?grant_type=password`
  **[D r. 175-227]**. Non esiste un endpoint OAuth/device pubblico **[D r. 1979-2012]**. Nuvio
  dichiara che il proprio sistema di autenticazione tratta password e credenziali di recupero
  **[D Privacy §2]**.
- Kaptain la manda **direttamente a Nuvio dal browser** e dichiara di non inviarla al proprio sito
  **[C nuvio-push.js:4-6, 399-443]**. Non è una garanzia crittografica: la password passa comunque
  dal JavaScript di Kaptain, quindi un XSS la vede.
- **Regola YACA**: la password Nuvio non deve mai essere ricevuta da un handler YACA, né scritta in
  Mongo, log, Sentry, URL o cookie. Se YACA adotta il modello browser-direct, la password vive solo
  nella memoria della pagina di auth per il tempo della richiesta. Non si può garantire la
  zeroizzazione delle stringhe JS: è un residuo accettato. I Terms Nuvio chiedono di non
  condividere le credenziali "in a way that puts an account at risk" **[D Terms §3]**: un server
  terzo che le conserva è esattamente quel caso.

### 3.2 Token Nuvio

- `access_token`: documentato `expires_in: 3600` **[D r. 198]**; Kaptain commenta "about a week"
  **[C nuvio-push.js:203-205]** e rinnova 2 minuti prima **[C 213-214]**. Le due cose non coincidono:
  **va misurato** **[T]**. Per il dimensionamento usare 1 ora come caso conservativo.
- `refresh_token`: la risposta del refresh restituisce **una nuova coppia** **[D r. 245]**; il
  refresh vecchio potrebbe essere invalidato. Due refresh concorrenti vanno serializzati con un
  mutex/single-flight: Kaptain usa `refreshInFlight` **[C 283-307]**, NuvioTV usa `refreshMutex`
  **[C AuthManager.kt:93]**. Anche YACA deve farlo.
- Kaptain tiene `access_token`, `refresh_token`, `expiresAt`, `email`, `userId` in
  `localStorage['nuvio_auth']`, con un tetto di **21 giorni** che i refresh non allungano
  **[C nuvio-push.js:198-279]**. È una scelta di UX, non di sicurezza: `localStorage` è leggibile da
  qualsiasi XSS.
- **Regola YACA**: se il push è one-shot, tenere i token in memoria (o `sessionStorage`) e non
  offrire "ricordami" di default. Se serve persistenza, usare `sessionStorage` con TTL breve, non
  `localStorage` su una pagina con script terzi. Se serve background sync, il refresh token va
  cifrato server-side (vedi §4).

### 3.3 Publishable key e service role

- La publishable key è pubblica e va usata nei client **[D r. 90-105]**. Kaptain usa ancora la
  vecchia anon JWT key **[C nuvio-push.js:15]**: funziona, ma non è la scelta raccomandata.
- La **service role key non deve mai** comparire in app, browser, docs o repository **[D r. 103]**.
  YACA non ne ha bisogno: non esiste un modello server-to-server.

### 3.4 YACA oggi: dove sono i segreti (e cosa non va)

Questa è la parte scomoda. Prima di aggiungere token Nuvio, YACA deve riconoscere che il suo
modello attuale è già esposto:

1. **`/api/user/:userId` restituisce l'intero oggetto risolto, `apiKeys` comprese, senza sessione.**
   `UserConfig.resolveUserConfig` include `apiKeys` **[C src/models/UserConfig.js:342-357]** e la
   rotta non ha `richiedeSessione` **[C index.js:170-186]**. Il `userId` è nell'URL del manifest
   Stremio (`/:userHandle/manifest.json`, `src/api/stremio.js:181-195`) e nel manifest URL restituito
   dal configure **[C src/api/configure/index.js:154]**. Quindi chi vede un manifest URL può
   potenzialmente leggere `stremio`, `tmdb`, `mistral`, `trakt` di quell'utente. **Va verificato
   end-to-end [T], ma il percorso nel codice è chiaro.**
2. **`/api/auth/me` restituisce `stremio`, `tmdb`, `mistral`, `trakt` in chiaro**
   **[C src/api/auth/index.js:208-216]**. È protetto da cookie, ma il cookie è `SameSite=None` e il
   CORS è `*` **[C index.js:64-67]**: la difesa non è il CORS.
3. **`/api/configure` restituisce `apiKeys` nella risposta** **[C src/api/configure/index.js:166-177]**.
   Anche qui: sessione, ma il client non ha bisogno di vedere i segreti per funzionare.
4. **Lo `stremio` authKey è salvato in chiaro** **[C src/models/UserAccount.js:27-33;
   src/models/UserConfig.js:17-20]** e non viene revocato al logout: `logoutHandler` cancella solo il
   cookie **[C src/api/auth/index.js:228-230]**. L'`authKey` resta valido presso Stremio.
5. **I token Trakt sono in chiaro**; `disconnettiTrakt` fa `$unset` dei campi ma non cancella i dati
   derivati **[C src/configurazione/door.js:307-315]**.
6. **`ADMIN_PASS` è una password condivisa in header `x-admin-pass`**, senza 2FA e senza rate limit
   dedicato **[C src/api/middleware/adminAuth.js:1-15]**. Va bene per un server personale, non per
   YACA Cloud.
7. **I backup sono `mongodump --gzip` non cifrati** e restano 30 giorni su R2
   **[C ops/yaca-backup.sh:50-51, 73-94, 129-137]**. Contengono `UserAccount`, quindi authKey
   Stremio, token Trakt e — se aggiunti — refresh token Nuvio.
8. **`JWT_SECRET` è un unico segreto globale**, con fallback casuale se manca
   **[C src/api/auth/index.js:54-65]**. Un leak forgia qualsiasi sessione; non c'è key rotation.
9. **Non esiste una rotta di cancellazione account.** Le rotte auth sono login/me/logout/stremio/
   trakt **[C index.js:140-150; src/api/auth/index.js:486-498]**. Non c'è un equivalente di
   `DELETE /api/account`.
10. **Non c'è una privacy policy né un'informativa sul trattamento** nel repository. Per un servizio
    pubblico che tratta library/watch history è un requisito, non un nice-to-have.

**Conseguenza**: se YACA salvasse i refresh token Nuvio nello stesso `UserAccount`, la falla 1
diventerebbe una fuga di token Nuvio. **La falla 1 va chiusa prima, non dopo.**

### 3.5 Retention delle credenziali: proposta

| Credenziale | Dove | TTL | Chi la legge | Cancellazione |
|---|---|---|---|---|
| Password Nuvio | memoria browser | secondi | solo il browser | chiusura pagina |
| `access_token` Nuvio (browser) | memoria/`sessionStorage` | fino a scadenza (1h doc, ~7g osservato) | browser | chiusura tab / logout |
| `refresh_token` Nuvio (browser) | `sessionStorage` | max 21 giorni, come Kaptain **[C 203-213]** | browser | logout / scadenza |
| `refresh_token` Nuvio (server, opt-in) | DB cifrato AES-256-GCM, DEK per utente | fino a disconnect; max 30 giorni di inattività | job di sync, non l'UI | disconnect + crypto-shred |
| Sessione YACA | cookie HttpOnly | 7 giorni (oggi) **[C auth:30]** | server | logout + deny-list |
| `stremio` authKey | Mongo | finché l'utente non disconnette | sync Stremio | disconnect + revoca |
| Trakt token | Mongo | fino a disconnect | client Trakt | disconnect |
| Backup | R2 | 30 giorni (oggi) | operatore | retention/crypto-shred |

---

## 4. Client-side vs server-side

### 4.1 Cosa fa Kaptain (browser diretto)

Kaptain è una pagina statica senza backend **[C nuvio-push.js:4-6]**. Il flusso è:

```
browser (password) ──POST /auth/v1/token?grant_type=password──> api.nuvio.tv
       │                                                        │
       └── salva access+refresh in localStorage['nuvio_auth'] <─┘
       │
       └── RPC /rest/v1/rpc/... con Bearer + apikey ──────────> api.nuvio.tv
```

Vantaggi: nessun server che conserva credenziali; l'utente vede il flusso; il costo infrastrutturale
è zero. Svantaggi: XSS/supply chain sul sito; `localStorage` persistente; niente background sync;
niente multi-device; ogni push richiede il browser aperto.

Il flusso è tecnicamente possibile perché la API Nuvio risponde con
`Access-Control-Allow-Origin: *` sia su `auth/v1` sia su `rest/v1` **[P, 20/10/2026]**: il browser
può chiamare `api.nuvio.tv` da qualsiasi origine. È anche il motivo per cui un sito malevolo può
chiedere la password Nuvio e usarla: la CORS aperta non è una difesa, è una condizione del modello.

Kaptain fa anche cose che YACA **non deve** copiare:

- usa la legacy anon key **[C 15]**;
- fa retry 429 su **tutte** le chiamate, incluse scritture non idempotenti **[C 132-142, 186-196]**;
- chiama RPC PIN e provider credentials non documentate **[C 808-840, 1303-1321]**;
- usa `logout?scope=local`, non documentato **[C 338]**.

### 4.2 Cosa dovrebbe fare YACA

Tre modelli, non due:

| Modello | Password | Token | Background | Multi-device | Rischio | Giudizio |
|---|---|---|---|---|---|---|
| **A. Browser one-shot** | solo browser, mai server | memoria/`sessionStorage` | no | no | basso-medio (XSS) | **MVP account-level** |
| **B. Server-side con refresh token cifrato** | browser, poi solo refresh token al server | DB cifrato | sì | sì | alto (DB/backup/key) | **solo opt-in, dopo i fix** |
| **C. Nessun account sync** | nessuna | nessuno | no | no | basso | **MVP consigliato** |

**Raccomandazione**: partire da **C** (poster URL + collections statiche), poi **A** per chi vuole
leggere library/history o pushare collections una volta. **B** solo se il prodotto richiede
davvero un job notturno e dopo aver implementato encryption, deletion, audit e incident response.

### 4.3 Se si sceglie B: requisiti minimi

1. **La password non arriva mai al server.** Il browser fa il grant, riceve la coppia, manda al
   server **solo il refresh token** su TLS, con consenso esplicito.
2. **Envelope encryption**: DEK casuale per utente, AES-256-GCM; KEK in KMS/HSM o in un file con
   permessi 600 su un host separato. La DEK non sta nello stesso documento del token.
3. **Niente token in Redis, log, URL, header di debug, Sentry.** Redis è cache, non vault
   **[C docker-compose.yml:6]**.
4. **Un job per utente, serializzato.** Mutex per refresh; niente due sync concorrenti.
5. **Revoca**: disconnect cancella DEK + token; il ciphertext nei backup diventa inutile
   (crypto-shredding).
6. **Audit**: chi ha letto/scritto cosa, quando, con quale `p_origin_client_id`; retention 30 giorni.
7. **Kill switch**: un flag per utente e uno globale che ferma tutti i job verso Nuvio.

---

## 5. 2FA e PIN

### 5.1 2FA / passkey

- **La docs non documenta 2FA**: nessun endpoint MFA, nessun campo `factors`, nessun flusso
  challenge/verify **[D, assenza in tutto il documento]**.
- `GET /auth/v1/settings` risponde `passkeys_enabled: true`, `mailer_autoconfirm: true`,
  `disable_signup: false`, `anonymous_users: true`, `phone: false` **[P, 20/10/2026]**. Non espone
  un flag MFA.
- I client Nuvio letti non hanno un flusso MFA: la ricerca in NuvioTV/NuvioMobile non trova
  `mfa`/`totp`/`2fa` **[C, assenza nel codice letto]**.
- **Conseguenza**: se un account ha passkey o 2FA attivi, il grant `password` può funzionare
  (passkey è additive) oppure fallire con un errore non documentato. **Va testato [T]**. YACA non
  deve costruire un flusso di challenge: non esiste nella API pubblica.
- **Regola**: se il login restituisce un errore che parla di MFA/passkey, YACA mostra "questo
  account richiede un passaggio che la API pubblica non supporta" e non tenta bypass.

### 5.2 PIN Nuvio

- Il PIN è **fuori dalla API pubblica**: `sync_push_profiles` "never overwrites PIN fields"; la
  gestione PIN è "an app-specific Nuvio flow" **[D r. 384]**.
- La API pubblica espone solo `pin_enabled` e `pin_locked_until` in lettura
  **[D r. 304-325]**.
- Le RPC `sync_pull_profile_locks`, `set_profile_pin`, `clear_profile_pin`, `verify_profile_pin`
  esistono nel client **[C ProfileSyncService.kt:170-244]** e in Kaptain
  **[C nuvio-push.js:1303-1321]**, ma **non sono documentate**. Usarle viola la regola "solo API
  documentate" **[D Terms §6]**.
- **Regola YACA**: leggere `pin_enabled`; se true, **saltare il profilo** e chiedere all'utente di
  sbloccarlo in Nuvio. Non chiamare le RPC PIN, non conservare il PIN, non provare a indovinarlo.
  Kaptain stesso scrive "A PIN itself is never readable, and never copied"
  **[C nuvio-push.js:1303-1305]**.

### 5.3 PIN Pictorium vs PIN Nuvio

Sono due cose diverse e non vanno confuse:

| | PIN Pictorium | PIN profilo Nuvio |
|---|---|---|
| Cosa protegge | l'editor web di uno spazio | il profilo nell'app Nuvio |
| Chi lo gestisce | Pictorium | Nuvio |
| Endpoint pubblici | restano aperti: `/manifest.json`, `/api/poster/*`, `/catalog/*` **[D README:157-161]** | la API pubblica non lo gestisce **[D r. 384]** |
| Effetto sui poster | nessuno: le immagini restano pubbliche | YACA deve rispettarlo, ma il token può tecnicamente accedere |
| Cosa può fare YACA | niente, è un altro prodotto | leggere lo stato, saltare il profilo |

Il PIN non è encryption: è un controllo di UX. Non ferma una API con un token valido. Per questo la
garanzia di YACA è **contrattuale e di prodotto**, non tecnica.

### 5.4 Cosa fare se l'utente ha 2FA o PIN

1. **2FA/passkey**: mostrare un avviso prima del login; se il grant fallisce, non riprovare in loop;
   offrire il fallback "usa solo il poster URL" (nessun account).
2. **PIN**: nella selezione profili, mostrare il lucchetto; escludere i profili locked dal default;
   richiedere un'azione esplicita "sbloccalo in Nuvio e ricarica".
3. **Kids**: escludere i profili kids dal default, anche se non hanno PIN. La library di un minore
   non è un segnale di gusto da raccogliere senza consenso del genitore.

---

## 6. Consenso, retention, cancellazione

### 6.1 Cosa chiedere prima di leggere library/storia

Consenso **separato** per lettura e scrittura. Non un checkbox unico "accetto tutto".

**Lettura (library, watch history, progress)**
- quali profili (default: nessuno; l'utente seleziona);
- quali dati: `content_id`, `content_type`, `added_at`, `watched_at`, `position`, `duration`;
- scopo: costruire il profilo di gusto / le raccomandazioni, non advertising;
- dove finiscono: aggregati in YACA, non copia grezza;
- per quanto: raw 30 giorni, aggregati 180 giorni, poi cancellazione;
- opt-out: un click, senza perdere l'addon.

**Scrittura (collections, addons, profili, settings, poster URL)**
- cosa viene sostituito: i full-replace cancellano ciò che non è nel payload
  **[D r. 331, 459, 1592, 1791-1796]**;
- anteprima obbligatoria con diff "aggiungo / modifico / cancello";
- backup/rollback disponibile;
- conferma esplicita prima del push;
- `p_origin_client_id` per audit **[D r. 747, 802]**.

### 6.2 Copy proposta (italiano, da rivedere con legale)

> **Leggi la tua libreria Nuvio**
> YACA userà un token del tuo account Nuvio per leggere la libreria e la cronologia dei profili che
> selezioni. Serve a capire i tuoi gusti e a migliorare i cataloghi. Non leggiamo i profili che non
> selezioni, non vendiamo i dati e non li usiamo per pubblicità. Conserviamo i dati grezzi per 30
> giorni e solo il profilo aggregato per 180 giorni. Puoi disconnettere Nuvio in ogni momento: YACA
> cancella il token e i dati derivati.

> **Scrivi nelle tue collezioni Nuvio**
> YACA può aggiornare le collezioni del profilo che scegli. Il push **sostituisce** l'elenco: ciò che
> non è nell'anteprima viene rimosso. Ti mostriamo il diff e teniamo un backup prima di scrivere.
> Puoi annullare.

> **Perché non ti chiediamo la password Nuvio**
> La password viene digitata solo nella pagina di accesso e inviata direttamente a Nuvio. YACA non
> la riceve e non la conserva. Se il tuo account usa passkey/2FA, la API pubblica potrebbe non
> supportare il login: in quel caso puoi usare YACA senza account, solo con il poster URL.

### 6.3 Retention: proposta esplicita

| Dato | Dove | Retention | Base |
|---|---|---|---|
| Password Nuvio | browser | secondi | non conservata |
| Token Nuvio | browser o DB cifrato | fino a disconnect / 30 giorni inattività | consenso |
| Library/watch raw | YACA DB | **30 giorni** | consenso |
| Profilo di gusto aggregato | YACA DB | **180 giorni** | consenso |
| Log richieste poster | stdout/CDN | **24-48 ore** | legittimo interesse / sicurezza |
| Log applicativi | Docker/Mongo | 7 giorni (Mongo) **[C logger:28-35]** | sicurezza |
| Backup | R2 | **7 giorni** se contengono token; 30 giorni solo dati non sensibili | sicurezza |
| Email/account | Mongo | fino a cancellazione | contratto |
| Audit push | Mongo | 30 giorni | sicurezza |

Oggi i backup sono a **30 giorni** **[C ops/yaca-backup.sh:51]** e non cifrati. Se YACA introduce
token Nuvio, 30 giorni di backup non cifrati sono incompatibili con la promessa di cancellazione:
**ridurre a 7 giorni o cifrare con crypto-shredding**.

### 6.4 Cancellazione end-to-end

Non basta cancellare il token. La sequenza corretta:

1. **Disconnect Nuvio (YACA)**:
   - cancellare `refresh_token`, `access_token`, `expires_at` da DB/browser;
   - cancellare la DEK per-utente (crypto-shredding);
   - fermare i job e cancellare la coda;
   - cancellare library/watch raw e aggregati derivati (o mantenere solo aggregati anonimi se il
     consenso lo prevede);
   - cancellare gli audit che contengono l'ID utente, se non più necessari.
2. **Revoca lato Nuvio**:
   - `POST /auth/v1/logout` con il token corrente **[D r. 247-253]**; Kaptain usa
     `?scope=local` **[C 338]**, che non è documentato. **Testare** se il logout revoca il refresh
     token o solo la sessione locale **[T]**.
   - Se serve una revoca certa: l'utente cambia password Nuvio o usa "logout tutte le sessioni" se
     Nuvio lo offre. Non c'è una API di session management pubblica.
3. **Cancellazione account YACA**:
   - oggi **non esiste** **[C index.js:140-150; auth:486-498]**;
   - deve cancellare `UserAccount`, `UserCredentials`, `AddonConfig`, library, watch history,
     `TasteProfile`, `ProfileUiState`, `RecommendationImpression`, `SystemLog` e le voci di audit;
   - deve essere idempotente e produrre una ricevuta.
4. **Backup**:
   - i backup notturni continuano a contenere il dump precedente alla cancellazione;
   - con crypto-shredding il ciphertext resta ma non è decifrabile;
   - senza encryption, l'unica promessa onesta è "sparisce entro 30 giorni", non "subito".
5. **Nuvio-side**:
   - se l'utente cancella l'account Nuvio, YACA non riceve alcuna notifica **[D Privacy §8;
     Account deletion]**; il token diventa invalido, ma la copia YACA resta. YACA deve fare un job
     periodico di validazione (401 → purge) e documentare che la cancellazione Nuvio non cancella
     YACA.

### 6.5 Opt-out

- Un pulsante "Disconnetti Nuvio" sempre visibile, non nascosto nelle impostazioni avanzate.
- Effetto immediato: stop job, token cancellati, dati derivati cancellati.
- Se l'utente vuole mantenere le collezioni ma non la lettura: consentire opt-out separato per
  lettura e scrittura.
- Se l'utente vuole cancellare tutto: link a "Elimina account YACA" con conferma forte (digita il
  nome utente, non solo "sei sicuro?").

---

## 7. Rate limit e abuso

### 7.1 Cosa dice Nuvio

- Linea guida client: **≤100 req/s per utente**, batch via RPC **[D r. 167-169]**.
- `429 Rate limited` è nella tabella errori, senza body/header/policy di retry **[D r. 165]**.
- Il gateway osservato espone `Ratelimit-Limit: 900`, `X-Ratelimit-Limit-Second: 900`,
  `Ratelimit-Remaining` decrescente **[P, 20/10/2026]**. Quindi 100 req/s è una soglia di sicurezza,
  non il limite reale; il contatore sembra per IP/client, non per utente **[T]**.
- Kaptain osserva 429 "plain HTTP" su `sync_pull_profiles` e `sync_push_profiles`, onora
  `Retry-After` se c'è, altrimenti backoff `500ms * 2^n` + jitter, max 3 retry
  **[C nuvio-push.js:124-143]**.
- NuvioTV ha un plugin `BackendRateLimit`: cooldown globale su 429 (e 503 con `Retry-After`),
  parsing di secondi e HTTP-date, fallback 1s, exponenziale fino a 30s, jitter ≤1s; retry automatico
  **solo** per GET/HEAD e RPC `sync_pull_*`/`sync_get_*`/read-safe; `verify_profile_pin` è escluso
  **[C BackendRateLimit.kt:14-113; BackendRateLimitTest.kt:31-38]**.

### 7.2 Piano YACA

| Livello | Regola | Perché |
|---|---|---|
| Per utente | 1-5 req/s, burst 10; 1 sync completo per 10 min; 1 job concorrente | restare sotto la soglia di sicurezza, evitare di sembrare un bot |
| Per endpoint | library/collections batch 500; delta 1000; progress 200; history page 900 | limiti docs e NuvioTV **[D r. 766, 804; C WatchedItemsSyncService.kt:31]** |
| Retry | `Retry-After` se c'è; altrimenti 500ms·2^n + jitter, cap 30s, max 4 | Kaptain/NuvioTV convergono su questo |
| Scritture | retry automatico **no**; solo dopo pull di verifica | collections/addons/profiles sono full replace non idempotenti |
| 429 | backoff + circuit breaker globale; alert | evitare retry storm |
| Quota giornaliera | 10k richieste/utente/giorno; kill switch | proteggere Nuvio e YACA |
| Audit | contare 429 per endpoint, p95 latenza, queue depth | diagnosi |

**Regola d'oro**: non usare 100 req/s come obiettivo. È il tetto di sicurezza dichiarato, non un
budget da consumare.

### 7.3 Abuso del poster endpoint

Il poster endpoint è pubblico per costruzione. I rischi non sono i token, sono:

1. **DoS per richieste volume**: nessun rate limit sulla rotta `/erdb-poster/:file`
   **[C index.js:109-110; staticPosters.js:252-303]**. Aggiungere un limiter per IP (Pictorium usa
   un default 200, unità da verificare **[C .env.example:43]**) e un limite globale.
2. **Disk fill**: ogni `badge` nuovo produce un nome file nuovo e un render on-miss
   **[C staticPosters.js:99-111, 138-142, 186-229]**. Un attaccante può generare migliaia di file
   con badge arbitrari. **Allowlist** dei badge (`ITA`, `EP n`, `S/E`, `4K`, …), non testo libero.
3. **Cache poisoning / content injection**: il badge è testo libero fino a 32 caratteri
   **[C staticPosters.js:105-111]**. Un URL con `?badge=<testo offensivo>` può far rendere quel
   testo nel poster di un altro. Allowlist + normalizzazione.
4. **Cache key explosion**: `fallback`, `badge`, `tlBadge` in query sono parte della cache key.
   Normalizzare i parametri, scartare quelli sconosciuti, firmare i parametri per-utente se
   necessario.
5. **SSRF**: il `fallback` è già limitato a `image.tmdb.org`, `media.kitsu.io`, `media.kitsu.app`,
   `images.metahub.space` **[C staticPosters.js:78-97]**. Mantenere l'allowlist e non accettare URL
   arbitrari.
6. **Path traversal**: già mitigato da `isSafeFileName` + `resolveInsideCacheDir`
   **[C staticPosters.js:36-51]**. Mantenere.
7. **Concorrenza**: la rotta on-miss fa una fetch con timeout 5s **[C staticPosters.js:67]**; senza
   un semaforo, centinaia di richieste possono saturare socket/ERDB. Aggiungere un limite di
   concorrenza e una coda con tetto.
8. **Costo**: la voce dominante è il traffico, non il disco. Vedi §9.4.

**Fail-open**: se YACA non ha il poster, la rotta deve restituire un 302 verso il poster originale
(host allowlist) o un placeholder 1×1, mai un 500 che Nuvio può cachare
**[C staticPosters.js:294-296; src/api/stremio.js:372-394]**. Va testato in Nuvio TV/mobile **[T]**.

### 7.4 Quota per utente e per IP

- **Account-level**: quota per `userId` (token bucket), non per IP. Un utente dietro NAT non deve
  penalizzare gli altri.
- **Poster**: quota per IP + per `u` (spazio), con un burst per le raffiche di una home.
- **Admin**: rate limit dedicato e 2FA; oggi `ADMIN_PASS` è solo un header.
- **Global**: circuit breaker se i 429 Nuvio superano l'1% in 1 minuto; pausa 60s; alert.

---

## 8. Termini, licenza, trademark

### 8.1 La notice della docs

Il testo è breve e va letto alla lettera **[D r. 8-12]**:

> "The Nuvio open-source project includes this documentation under the same project license unless
> stated otherwise. That license does not grant rights to Nuvio names, logos, branding, or access to
> the hosted Nuvio service. Separate terms, trademark rules, or service restrictions may apply."

> "This reference documents the officially supported public API. Endpoints and workflows not listed
> here are internal and may change without notice. It does not cover private or operational
> endpoints or destructive account flows."

Implicazioni:

1. **La licenza del codice non è una licenza sul servizio.** Usare `api.nuvio.tv` significa usare un
   servizio ospitato: la licenza del progetto non dà quota, SLA o diritto di rivendita.
2. **La docs è sotto la licenza del progetto** (GPLv3 per NuvioTV, verificato nel `LICENSE` e nel
   README **[C NuvioTV LICENSE; README:30-32]**). Non vendorizzare la docs in YACA: linkala.
3. **Gli endpoint non elencati sono interni** e possono cambiare senza preavviso. Questo include
   PIN, provider credentials, guarded settings, plugin, device login.
4. **Non c'è un ToS allegato alla docs**; i Terms sono sul sito. Non c'è una quota pubblica, né una
   policy di deprecazione **[D r. 2016-2036]**.

### 8.2 I Terms che contano

| Sezione | Testo / effetto | Conseguenza per YACA |
|---|---|---|
| **§3 Accounts and sync** | "Keep your account credentials secure… Do not… share credentials in a way that puts an account at risk, or try to bypass profile locks" | chiedere la password Nuvio a un server terzo è rischioso; non bypassare i PIN |
| **§4 Third-party services** | "Compatibility with Nuvio does not mean that Nuvio endorses an integration" | disclaimer obbligatorio: "non affiliato" |
| **§5 Community addon developers** | chi pubblica addon/endpoint è responsabile del servizio e del materiale; deve avere i diritti | YACA è responsabile di poster, cataloghi, artwork |
| **§6 Lawful use** | "Do not… bypass authentication or rate limits… You may automate only the APIs documented for public use." | solo API pubbliche; niente RPC interne; niente retry che aggira i 429 |
| **§9 Ownership, open source, brand** | nessun diritto su nome, loghi, design, docs, hosted services, account system, database, trademark | "Nuvio-native" non è un marchio pubblico; no logo |
| **§10 Privacy** | rimanda alla Privacy Policy | YACA deve avere una propria informativa |
| **§11 Availability** | feature/API possono "change, stop working, pause, or end at any time" | nessuna promessa di continuità; piano B |
| **§12 Disclaimers** | "as is" / "as available" | nessun SLA da Nuvio |
| **§13 Limits on liability** | Nuvio non risponde di perdita dati/account | YACA deve avere backup propri |

### 8.3 Cosa si può chiamare "Nuvio-native"

| Uso | Giudizio | Perché |
|---|---|---|
| Nome interno della mappa `.scratch/nuvio-native` | **OK** | non è pubblico, è un'etichetta di lavoro |
| "YACA — Nuvio-native" nel nome del prodotto/dominio | **NO** | suggerisce endorsement ufficiale e usa il marchio **[D r. 10; Terms §9]** |
| "Compatibile con Nuvio" / "per Nuvio" descrittivo | **CONDIZIONALE** | descrizione lecita se non implica affiliazione; disclaimer "non affiliato a Nuvio" e nessun logo |
| Logo Nuvio nella cover del pack community | **NO** | logo/branding non concesso; la community vieta loghi di terzi |
| "Nuvio Sync" come nome di una feature YACA | **NO** | è un servizio Nuvio; confusione |
| "Nuvio-native" nel titolo di un pack community | **NO** | la pagina community non è un certificato di compatibilità |
| `org.stremio.yaca.catalog` come manifest id | **OK** | non usa Nuvio (`src/stremio/manifest.js:59`) |

**Regola**: il nome pubblico è **YACA**. "Nuvio" compare solo in una frase descrittiva e in un
disclaimer, mai nel nome, nel logo, nel dominio o nel titolo di un pack.

### 8.4 Licenze del codice

- **NuvioTV**: GPLv3 **[C LICENSE; README:30-32]**. Copiare codice NuvioTV in YACA (ISC,
  `package.json:27`) imporrebbe obblighi GPLv3. Non copiare: studia i pattern, riscrivi.
- **Docs Nuvio**: stessa licenza del progetto, salvo diversa indicazione **[D r. 10]**. Citare brevi
  estratti è una cosa; ridistribuire il markdown è un'altra. Non vendorizzare.
- **Pictorium**: AGPL-3.0 **[C LICENSE]**. Stesso discorso: pattern, non copia.
- **YACA**: ISC **[C package.json:27]**. Se un giorno si vuole un prodotto chiuso, evitare codice
  GPL/AGPL.

### 8.5 Poster e artwork

- Nuvio Terms §5: chi pubblica un addon/endpoint è responsabile del materiale e deve avere i diritti
  **[D Terms §5]**.
- TMDB richiede attribuzione a ogni applicazione che usa dati o immagini
  **[D TMDB Logos & Attribution]**.
- YACA già usa poster TMDB (`image.tmdb.org`); il poster endpoint globale non cambia la natura del
  diritto, ma aumenta la superficie di redistribuzione. Serve:
  - attribuzione TMDB visibile nel sito/README e, se possibile, nelle impostazioni;
  - nessun logo di servizi streaming;
  - una policy di rimozione per titolari di diritti;
  - non usare key art di terzi senza licenza.
- **Nota legale**: questa nota non è un parere legale. Per un servizio pubblico in UE servono
  revisione di un avvocato, DPIA se il trattamento è sistematico, e un DPA con i fornitori.

---

## 9. Hosting: self-hosted vs YACA Cloud

### 9.1 Self-hosted (quello che YACA fa oggi)

Architettura reale:

```
Internet ──HTTPS──> Tailscale Funnel (*.ts.net) ──> 127.0.0.1:7860
                                                   ├─ app Node/DuckDB (cap 1.5 GB)
                                                   ├─ redis (cap 300 MB, no persistence)
                                                   ├─ anime-source (cap 256 MB)
                                                   └─ watchtower (cap 50 MB)
MongoDB Atlas M0 (dati utente)  ◄── app, via WAN
GHCR ──Watchtower──> immagini
```

Fonti: `docs/DEPLOYMENT_HOME_SERVER.md:13-46`; `docker-compose.yml:29-63, 145-166`.

**Pro**:
- i token restano sulla macchina dell'utente (se il sync è locale);
- nessun costo di piattaforma;
- privacy massima: l'operatore è l'utente;
- Tailscale Funnel dà HTTPS senza dominio **[D docs:319-352]**.

**Contro**:
- disponibilità legata a corrente, ISP, laptop acceso; nessuno SLA;
- Tailscale Funnel ha **limiti di banda non configurabili e non pubblicati** **[D Tailscale
  Funnel]**; non è un CDN;
- Watchtower aggiorna l'immagine ogni ora e può rompere il deploy senza applicare il compose
  **[C docs:546-564]**;
- Atlas M0 è 512 MB / 100 ops/s **[D MongoDB pricing]**; nessun backup automatico
  **[C docs:423-425]**;
- backup R2 non cifrati **[C ops/yaca-backup.sh]**;
- un solo host = single point of failure.

**Giudizio**: **GO** per un addon personale/familiare e per l'account sync locale. **NO-GO** come
backend di un poster endpoint globale.

### 9.2 YACA Cloud (ipotesi)

Due versioni molto diverse:

| | **YACA Cloud — poster/catalog only** | **YACA Cloud — account sync** |
|---|---|---|
| Dati utente | nessuno (solo ID titolo/stile) | refresh token, library, history |
| Token Nuvio | nessuno | sì, cifrati |
| GDPR | log IP/titolo, informativa | dati personali, DPIA, deletion, breach |
| Costo | CDN + storage + piccolo DB | CDN + DB + KMS + on-call |
| Rischio | abuso/costo | breach catastrofico |
| Giudizio | **GO con limiti** | **NO-GO prima dei fix** |

**Raccomandazione**: YACA Cloud, se esiste, deve essere **poster/catalog only**. L'account sync
resta browser-side o sull'istanza dell'utente. Così YACA Cloud non diventa un token vault e non
trasforma un hobby in un processor GDPR.

### 9.3 Architettura del poster endpoint globale

```
Nuvio client ──GET──> CDN (Cloudflare/Bunny)
                         │ cache hit 95% → immagine
                         └ cache miss ──> R2 (immutabile) o origin YACA
                                             └ on-miss: coda render, 404/placeholder
```

Requisiti:

1. **Nessun token utente nell'URL.** Il poster URL è pubblico; usare solo ID titolo, shape e uno
   spazio pubblico opaco (`u=<uuid>`), mai `userId` o refresh token. Pictorium fa esattamente
   questo: `u=` è "public image namespace, not a password" **[D Pictorium guide:186-190]**.
2. **Filename versionato** (`<id>-<hash>_<badge>.jpg`) per cache immutabile
   **[C YACA docs/EPISODE_BADGES.md:113-129]**. `Cache-Control: public, max-age=31536000,
   immutable`; il cambio di badge produce un nome nuovo, non un purge.
3. **Precalcolo** delle varianti `poster`, `landscape`, `square`; niente render sincrono su ogni
   richiesta. Oggi YACA rende on-miss **[C staticPosters.js:186-229]**: va bene per un utente, non
   per un endpoint globale.
4. **R2 bucket privato + CDN davanti**; il bucket non deve avere listing pubblico né write pubblico.
5. **Rate limit e quota** per IP/`u`; badge allowlist; concurrency cap; disk quota; LRU.
6. **Fail-open**: 302 al poster originale o placeholder 1×1, mai 500 cachato.
7. **Log minimi**: niente IP+titolo in chiaro oltre 24-48h; aggregati per cache hit/miss.

### 9.4 Costi: dimensionamento

Assunzioni (da misurare **[T]**):
- cache precomposta: **~104k poster nudi** **[C docs/EPISODE_BADGES.md:129]**; con badge e 3 shape
  si arriva a 150k-312k file;
- peso medio: **80 KB** per JPEG/WebP (misurare 100 file reali; 60-150 KB è il range plausibile);
- 104k × 80 KB ≈ **8,3 GB**; 312k × 80 KB ≈ **25 GB**.

**Storage R2** (egress gratis, 10 GB-month free, $0.015/GB-month, Class A $4.50/M, Class B
$0.36/M) **[D Cloudflare R2 pricing]**:

| Cache | Storage | Costo/mese |
|---|---|---|
| 104k × 80 KB | 8,3 GB | **$0** (free tier) |
| 200k × 80 KB | 16 GB | ~**$0,09** |
| 312k × 80 KB | 25 GB | ~**$0,23** |
| 312k × 150 KB | 47 GB | ~**$0,56** |

**Traffico CDN** (Bunny EU/NA $0.01/GB **[D Bunny pricing]**; Cloudflare Images $1/100k delivered
**[D Cloudflare Images pricing]**):

| Views/giorno | GB/mese a 80 KB | Bunny/mese | Cloudflare Images/mese |
|---|---|---|---|
| 100k | 240 GB | **$2,40** | **$30** |
| 1M | 2,4 TB | **$24** | **$300** |
| 10M | 24 TB | **$240** | **$3.000** |

**Conclusione**: Cloudflare Images è ~12× più caro di R2+CDN a questo volume. Per un poster endpoint
globale, **precomporre e servire JPEG da R2 dietro CDN**, non usare un image-resizing per-request.

**Compute/DB**:

| Voce | Costo indicativo | Fonte |
|---|---|---|
| VPS 2 GB / 50 GB / 2 TB | **$12/mese** | DigitalOcean droplets **[D]** |
| VPS 4 GB / 80 GB / 4 TB | **$24/mese** | DigitalOcean droplets **[D]** |
| MongoDB Atlas M0 (512 MB) | **$0** | Atlas free tier **[D]** |
| MongoDB Atlas M2 (2 GB) | **$9/mese** | Atlas pricing **[D]** |
| MongoDB Atlas M10 (10 GB, dedicato) | ~**$56/mese** ($0.08/h) | Atlas pricing **[D]** |
| Tailscale Free (≤6 utenti, 50 tagged) | **$0** | Tailscale pricing **[D]** |
| Cloudflare R2 backup 10 GB | **$0** | R2 pricing **[D]** |

**Scenari totali** (ordine di grandezza, senza engineering/monitoring):

| Scenario | VPS | DB | CDN | Totale/mese |
|---|---|---|---|---|
| Self-hosted, 100k views/day | hardware esistente | M0 | $0 (Funnel, se regge) | ~**$0** + energia |
| Cloud poster, 100k/day | $12 | M0 | $2,40 | ~**$15** |
| Cloud poster, 1M/day | $12 | M2 $9 | $24 | ~**$45-55** |
| Cloud poster, 10M/day | $24 | M10 $56 | $240 | ~**$320-450** |

Non include: backup, monitoring, egress origin, image transforms, CDN premium, on-call. Per un
servizio pubblico serio, aggiungere almeno il 30-50%.

### 9.5 Uptime e fail-open

| Componente | Disponibilità | Se cade |
|---|---|---|
| Home server | best-effort; corrente/ISP | addon/poster non raggiungibili; Nuvio mostra originale o buco **[T]** |
| Tailscale Funnel | servizio Tailscale; limiti di banda | latenza/timeout; non adatto a immagini di massa |
| Nuvio API | nessuno SLA **[D Terms §11-12]** | sync fallisce; backoff; non perdere la sessione |
| YACA Cloud CDN | provider SLA | cache hit servono; origin miss 5xx |
| Mongo Atlas M0 | free tier; nessun backup automatico | ripristino dal dump R2 |

**Regola**: il poster endpoint non deve mai rompere la UI Nuvio. Se YACA non sa rispondere, 302 al
poster originale o placeholder; mai un 500 che il client cacha. Va testato su TV e mobile **[T]**.

### 9.6 Privacy del poster endpoint

Anche senza account, il poster endpoint vede:

- IP, user agent, timestamp;
- `tmdb_id`/`imdb_id` del titolo;
- `u` dello spazio (se per-utente);
- `shape`, `badge`, `fallback`.

La combinazione IP + titolo può rivelare interessi. Se YACA Cloud logga tutto, diventa un dataset
di comportamento. Misure:

- non loggare `IP + titolo` in chiaro oltre 24-48h;
- aggregare per cache hit/miss e per titolo, senza IP;
- se serve anti-abuso, hash dell'IP con salt giornaliero, non IP reversibile;
- niente analytics di terze parti sulla pagina/endpoint;
- informativa privacy che dica chiaramente cosa viene loggato;
- se l'utente ha `u`, non associarlo a email/userId nei log.

Pictorium ha la stessa esposizione e la tratta come "public image namespace"; YACA deve fare lo
stesso, ma con retention esplicita.

---

## 10. Checklist "prima di pushare davvero"

Questa è la lista minima. Ogni voce è **bloccante** per un push account-level su utenti reali.

### Credenziali e sessioni

- [ ] **Nessuna password Nuvio ai server YACA.** Il login avviene nel browser verso
      `api.nuvio.tv`; il server non vede la password.
- [ ] **Nessun token in chiaro nel DB.** Se server-side: AES-256-GCM, DEK per utente, KEK in
      KMS/HSM; la DEK non è nello stesso documento.
- [ ] **Nessun token in log, URL, Redis, Sentry, messaggi di errore.** Audit con grep su
      `access_token`, `refresh_token`, `Authorization`, `apikey`.
- [ ] **`/api/user/:userId` non restituisce `apiKeys`** e richiede sessione; `userId` non è
      l'identificatore pubblico del manifest (usare `addonUuid`).
- [ ] **`/api/auth/me` e `/api/configure` non restituiscono `apiKeys`** (o restituiscono solo
      booleani/maschere).
- [ ] **Logout revoca la sessione** (deny-list `jti`) e, se possibile, il refresh token Nuvio.
- [ ] **JWT_SECRET ruotabile** con key ring; TTL breve; cookie `SameSite=Lax/Strict` o CSRF token.
- [ ] **Admin con 2FA** e password per-persona, non `ADMIN_PASS` condivisa in header.
- [ ] **Backup cifrati** o retention ≤7 giorni; crypto-shredding per utente.
- [ ] **CSP** sulla pagina di auth; nessuno script terzo; SRI; dipendenze pinned.

### Consenso e dati

- [ ] **Consenso separato** lettura/scrittura, non pre-checked, con link all'informativa.
- [ ] **Selezione profili**: default nessuno; esclusi kids e `pin_enabled` salvo scelta esplicita.
- [ ] **Anteprima diff** per ogni full replace (collections, addons, profili, settings).
- [ ] **Backup/rollback** prima del push; `p_origin_client_id` inviato.
- [ ] **Retention**: raw 30 giorni, aggregati 180, log 7, backup 7/30; documentata.
- [ ] **Cancellazione account** implementata e testata; cancellazione Nuvio documentata come
      separata.
- [ ] **Opt-out** immediato, senza perdere l'addon.

### API Nuvio

- [ ] **Solo endpoint della tabella v1.3** **[D r. 1979-2012]**. Nessuna RPC PIN, provider
      credentials, guarded settings, plugin, device login.
- [ ] **`p_client_max_profiles: 6`** sempre, per non cancellare i profili 5-6 **[D r. 371]**.
- [ ] **Pull → merge → push → pull di verifica** per ogni full replace
      **[D r. 1791-1796]**.
- [ ] **Batch 500** per library; **900** per history; **200** per progress; niente payload giganti.
- [ ] **Rate limit**: 1-5 req/s per utente, 1 job, quota giornaliera, circuit breaker.
- [ ] **429**: `Retry-After` (secondi o HTTP-date), backoff con jitter, max 4; niente retry cieco
      sulle scritture.
- [ ] **Token refresh**: single-flight, 2 minuti prima, 4xx → sign-out, 5xx/timeout → non
      distruggere la sessione.
- [ ] **2FA/passkey**: testato; errore chiaro, nessun bypass.
- [ ] **PIN**: `pin_enabled` rispettato; nessuna RPC interna.

### Poster endpoint

- [ ] **Nessun token utente nell'URL**; solo ID titolo, shape, `u` opaco.
- [ ] **Rate limit** per IP/`u`; badge **allowlist**; concurrency cap; timeout.
- [ ] **Path traversal/SSRF** mantenuti; `fallback` allowlist.
- [ ] **Cache**: filename versionato, `immutable`, CDN; niente purge per ogni edit.
- [ ] **Fail-open**: 302 originale o placeholder, mai 500 cachato.
- [ ] **Log**: niente IP+titolo oltre 24-48h; aggregati; informativa.
- [ ] **Disk quota/GC**: la cache non cresce senza limite.
- [ ] **Costo**: cap CDN/egress, alert al 80% del budget.

### Termini e brand

- [ ] **Nessun logo/nome Nuvio** nel prodotto, dominio, pack, cover, screenshot.
- [ ] **Disclaimer** "YACA non è affiliato a Nuvio" visibile.
- [ ] **"Compatibile con Nuvio"** solo descrittivo; legal review.
- [ ] **Docs Nuvio linkate, non vendorizzate**; nessun codice GPL/AGPL copiato.
- [ ] **Attribuzione TMDB** visibile.
- [ ] **Contatto business Nuvio** (`business@nuvio.tv`) se YACA Cloud diventa commerciale.

### Hosting e operations

- [ ] **CDN + R2** per il poster globale; Funnel solo per self-hosted.
- [ ] **Uptime monitor** (5 min) e status page; alert su 5xx/latency.
- [ ] **Watchtower** pinnato a digest/firma, o disabilitato sul servizio che tiene token.
- [ ] **Incident response**: revoca token, notifica utenti, contatto Nuvio, GDPR 72h se applicabile.
- [ ] **Test su account usa-e-getta** con 6 profili, backup, rollback, 429 simulato, 2FA, PIN.

---

## 11. Cosa significa per YACA

1. **Il prodotto sicuro è "YACA per Nuvio", non "Nuvio dentro YACA".** YACA può essere un addon,
   un poster provider, un pack di collections. Non può diventare il custode delle credenziali Nuvio
   senza un modello di delega che Nuvio non offre.
2. **L'ordine giusto è: poster URL → collections → lettura library/history → push account.**
   Il poster non richiede token e porta valore subito; il push account è l'ultimo passo, non il
   primo.
3. **Se si fa account sync, browser-first.** Un one-shot dal browser è più sicuro di un job
   server-side che conserva refresh token. Il server-side si giustifica solo con un requisito di
   background sync e dopo encryption/deletion/audit.
4. **YACA Cloud, se nasce, è poster/catalog only.** Non deve diventare un token vault. I token
   restano nel browser o nell'istanza dell'utente.
5. **La sicurezza di YACA è oggi più debole di quella che serve per Nuvio.** `/api/user/:userId`,
   `/api/auth/me`, `/api/configure`, backup non cifrati, nessuna cancellazione account, nessuna
   revoca sessione: sono debiti da chiudere **prima** di aggiungere token di terzi.
6. **Il poster endpoint è un problema di abuso e costo, non di auth.** Badge allowlist, rate limit,
   cache immutabile, CDN, fail-open, log minimi. Senza, un endpoint globale è un denial-of-service
   a spese di YACA.
7. **Il brand è un rischio legale, non un dettaglio di marketing.** "Nuvio-native" va tenuto
   interno; il pubblico dice "compatibile con Nuvio", senza logo e con disclaimer.
8. **Nessuna promessa di continuità.** Nuvio può cambiare/fermare l'API **[D Terms §11]**; YACA deve
   avere un piano B (collections statiche, poster locale) e non costruire un prodotto che si rompe
   se Nuvio cambia una RPC.

---

## 12. Domande aperte

1. **Nuvio permette un'integrazione commerciale account-level?** I Terms non lo vietano
   esplicitamente, ma la notice non concede accesso al servizio hosted. Chiedere a
   `business@nuvio.tv` prima di YACA Cloud.
2. **Il logout revoca il refresh token?** `POST /auth/v1/logout` è documentato, `?scope=local` no
   **[D r. 247-253; C nuvio-push.js:338]**. Testare: dopo logout, il refresh token funziona ancora?
3. **Quanto dura davvero l'access token?** Docs 3600 s, Kaptain ~7 giorni. Misurare `expires_at` e
   il comportamento dopo 1h/24h/7g **[T]**.
4. **Il grant password funziona con passkey/2FA?** `passkeys_enabled: true` **[P]**; nessun flusso
   MFA pubblico. Testare un account con passkey **[T]**.
5. **Il PIN è enforceato lato server o solo UI?** La API pubblica lo espone read-only. Un token può
   scrivere un profilo locked? Testare su account usa-e-getta **[T]**.
6. **C'è un limite di richieste per account?** Il gateway mostra 900 req/s per IP/client; non è
   chiaro se esista una quota per utente. Testare burst e 429 **[T]**.
7. **Il 429 restituisce `Retry-After`?** Kaptain lo legge "se c'è"; la docs non lo documenta.
   Testare body/header **[T]**.
8. **`p_origin_client_id` è accettato da tutte le RPC?** Documentato per library, osservato altrove.
   Testare e usare un ID stabile `yaca-...` **[T]**.
9. **Nuvio prevede OAuth/scope/token per-app?** Oggi no. Se sì in futuro, cambia tutto: YACA
   potrebbe fare sync server-side senza password e con permessi limitati. Chiedere.
10. **Chi è il controller dei dati in YACA Cloud?** YACA, l'utente, o Nuvio? Serve una DPIA e un
    DPA con i fornitori (Atlas, Cloudflare, Bunny, GHCR).
11. **Dove sono i dati Atlas/R2?** M0 non garantisce una region specifica; R2 ha jurisdiction.
    Verificare per GDPR e per la promessa "i dati restano in UE".
12. **Il poster endpoint può usare `u=<uuid>` senza autenticazione?** Sì, ma serve cache-key
    isolation e rate limit per `u`. Pictorium lo fa; YACA deve testare collisioni e abuso.
13. **Qual è il peso medio reale di un poster?** 60/80/150 KB cambia il costo CDN di 2,5×.
    Misurare 100 file reali prima di dimensionare.
14. **Nuvio mostra il poster originale se YACA risponde 404/302?** Testare su TV e mobile; il
    fail-open va progettato sul comportamento reale, non su quello sperato.
15. **Quale licenza per il poster composito?** TMDB consente l'uso delle immagini con attribuzione;
    il badge YACA è un'opera derivata? Serve legal review.
16. **"Compatibile con Nuvio" è abbastanza?** Dipende dalla percezione di endorsement; un
    disclaimer esplicito e l'assenza di logo riducono il rischio, ma non lo azzerano. Legal review.

---

## Fonti primarie

### Nuvio — documentazione e pagine ufficiali

- `https://nuvio.tv/docs/nuvio-public-api.md` — v1.3, last updated 20/08/2026, 2036 righe, letto il
  20/10/2026. Riferimenti: r. 6 (third-party clients), 8-12 (notice), 90-105 (publishable key,
  service role), 107-114 (Bearer), 141-169 (errori/rate limit), 175-245 (signup/signin/refresh),
  247-271 (logout/user), 277-279 (6 profili e `p_client_max_profiles`), 304-325 (PIN read-only),
  331 (full replace profili), 384 (PIN non pubblico), 390-407 (delete profile data), 459 (full
  replace addons), 766/804 (batch 500), 1072-1074 (90% → history), 1395 (settings blob atomico),
  1592 (full replace collections), 1791-1796 (sync strategies), 1979-2012 (tabella RPC), 2016-2036
  (changelog).
- `https://nuvio.tv/terms` — Terms of Service, last updated 8/08/2026. §1 (definizione di Nuvio,
  public APIs), §3 (credenziali, profile locks, deletion, backup), §4 (third-party/addons,
  compatibilità ≠ endorsement), §5 (community addon developers, diritti), §6 (solo API documentate,
  no bypass auth/rate limit), §9 (nome/loghi/hosted services/database/trademark, GPLv3), §10
  (privacy), §11 (availability, change/stop), §12 (as is), §13 (liability).
- `https://nuvio.tv/privacy-policy` — Privacy Policy, last updated 8/08/2026. §1 (Nuvio Media), §2
  (account/auth data, Nuvio Sync data, operational data: IP/UA/rate limit events, browser storage),
  §3 (Sentry/diagnostics, credential filtering), §6 (infrastructure/providers), §8
  (retention/account deletion, backup), §9 (security, never send passwords/tokens), §10 (rights).
- `https://nuvio.tv/account-deletion` — last updated 26/07/2026: dashboard deletion, manual email
  `hello@nuvio.tv`, timing, limited retention, independent services.
- `https://status.nuvio.tv` — status page linkata dal footer (non usata per claim di uptime).
- `https://nuvio.tv/faq` — FAQ community collections (contesto, non security).

### Nuvio — codice client

- NuvioTV, branch `dev`, commit `f062601cc6b9561c4a50aa7ab7464d7ddc555c5e` (come nota 01):
  - `app/src/main/java/com/nuvio/tv/core/auth/AuthManager.kt:93` (`refreshMutex`), `:424-439`
    (refresh reattivo), `:908-989` (classificazione errori/retry Cloudflare).
  - `.../core/sync/ProfileSyncService.kt:170-244` (`sync_pull_profile_locks`, `set_profile_pin`,
    `clear_profile_pin`, `verify_profile_pin` — **non documentate**).
  - `.../core/network/BackendRateLimit.kt:14-113` (cooldown, `Retry-After` secondi/HTTP-date,
    exponenziale 1s→30s, jitter ≤1s, retry solo read-safe).
  - `app/src/test/java/com/nuvio/tv/core/network/BackendRateLimitTest.kt:31-38`
    (`verify_profile_pin` non ritentato).
  - `.../data/local/ServerConfigurationStore.kt:15-39` (backend custom feature-flagged: non è il
    percorso YACA).
  - `LICENSE` (GPLv3), `README.md:30-32` (GPLv3).
- NuvioMobile: `composeApp/src/commonMain/kotlin/com/nuvio/app/core/auth/DeviceLinkAuthRepository.kt`
  (DTO con `access_token`/`refresh_token`), `core/auth/AuthModels.kt`. Serve solo a confermare che
  il client usa token, non un flusso OAuth: la assenza di OAuth è nella docs pubblica, non dedotta
  dal codice.

### Kaptain — `nuvio-push.js`

`https://www.kaptain.stream/nuvio-push.js?v=106.9`, 1572 righe, letto il 20/10/2026:

- 4-6 (static page, no backend; password diretta a Nuvio).
- 14-15 (base URL, legacy anon key).
- 32-41 (`apikey` + Bearer).
- 124-143 (429, `Retry-After`, backoff 500ms·2^n + jitter, max 3).
- 176-184 (`liveToken`).
- 198-214 (`localStorage['nuvio_auth']`, 21 giorni, refresh margin 2 min).
- 216-249 (read/write/clear session; `logout?scope=local`).
- 251-308 (expiry, saveLogin, refresh single-flight, 4xx clears session).
- 310-341 (`getToken`, `signOut`).
- 808-840 (`sync_pull/push_provider_credentials` — **non documentate**).
- 1209-1250 (`sync_push_profile_settings_blob_guarded` — **non documentata**).
- 1303-1321 (RPC PIN — **non documentate**).
- 1352-1408 (`custom_poster_url_pattern`, `custom_poster_enabled_screens`,
  `POSTER_PLATFORMS`, `POSTER_SCREENS_ALL` — settings blob, non docs API).

### YACA — codice e deploy

- `index.js:58` (`trust proxy`), `:64-67` (CORS wildcard + credentials), `:68` (body 1 MB),
  `:109-110` (mount poster route), `:130-137` (auth limiter 20/15min), `:140-150` (auth routes),
  `:153-157` (domain limiter 120/min), `:170-186` (`/api/user/:userId` senza sessione, restituisce
  `user` con `apiKeys`), `:220-221` (configure limiter 30/min).
- `src/api/auth/index.js:30` (JWT 7d), `:36-45` (cookie HttpOnly/Secure/SameSite=None), `:54-65`
  (fallback secret), `:81-123` (login Stremio, salva authKey), `:208-216` (`/me` restituisce
  `stremio`, `tmdb`, `mistral`, `trakt`), `:228-230` (logout solo cookie), `:304-318`
  (`/api/auth/stremio` restituisce `authKey`), `:449-498` (UserCredentials/export).
- `src/api/middleware/sessione.js:26-37` (JWT verify, nessuna deny-list).
- `src/models/UserAccount.js:27-33` (`apiKeys` in chiaro), `src/models/UserCredentials.js:10-15`
  (`passwordHash`), `src/models/UserConfig.js:17-20` ("i token sono ora salvati in chiaro"),
  `:342-357` (`resolveUserConfig` include `apiKeys`).
- `src/configurazione/chiavi.js:93-133` (precedenza request → account → env).
- `src/configurazione/door.js:120-144` (Trakt token), `:271-280` (save), `:307-315` (disconnect
  `$unset`).
- `src/api/configure/index.js:51-68` (validateAuth/Keys), `:140-146` (save), `:154` (manifest URL
  con `userId`), `:166-177` (risposta con `apiKeys`).
- `src/api/configurazione.js:5-6` (session required), `src/api/profilo.js:41-47` (mask stremio,
  tmdb/mistral raw).
- `src/api/staticPosters.js:22-25` (Cache-Control 24h/5min), `:36-51` (path traversal),
  `:67` (timeout 5s), `:78-97` (fallback allowlist), `:99-111` (badge free text 32 char),
  `:138-142` (queue dedupe), `:186-229` (on-miss render), `:252-303` (route), `:294-296`
  (fallback/placeholder), `:310-317` (`sendFile`).
- `src/stremio/formatters/StremioFormatter.js:167-219` (poster URL composto/fallback).
- `src/stremio/manifest.js:57-74` (root manifest, id/name), `:77-189` (manifest per-utente).
- `src/api/stremio.js:173-195` (manifest, `:userHandle`), `:344-365` (legacy poster redirect),
  `:372-394` (placeholder 1×1).
- `src/infra/logger.js:16-36` (console/Mongo, TTL 7 giorni, `meta` as-is), `src/infra/rateLimiter.js:3-4`
  (concurrency 5, delay 100ms).
- `.env.example:5-7` (`HOST_URL`), `:16-23` (ERDB/DB/keys), `:25-30` (JWT/ADMIN/CORS).
- `docker-compose.yml:6` (Redis no persistence), `:23` (GHCR), `:29-40` (127.0.0.1, env_file),
  `:41-50` (volumes), `:59-63` (log rotation), `:145-166` (Watchtower).
- `Dockerfile:23-26` (NODE_ENV/PORT), `:28-32` (copy).
- `ops/yaca-backup.sh:50-51` (R2, 30 giorni), `:73-94` (mongodump gzip), `:129-137` (upload/delete).
- `ops/server.env.example:15-18` (HOST_URL), `:33-35` (Atlas M0), `:45-50` (JWT/ADMIN), `:88-107`
  (R2).
- `docs/DEPLOYMENT_HOME_SERVER.md:13-46` (architettura/RAM), `:248-265` (env), `:319-352` (Funnel),
  `:423-425` (Atlas M0 no backup), `:537-542` (UptimeRobot), `:546-564` (Watchtower caveat),
  `:580-588` (trap).
- `docs/EPISODE_BADGES.md:101-129` (rotta poster, 104k cache, versioning).
- `docs/TIMER_POSTER.md:9-20` (coda, 10-50 eventi/giorno).
- `package.json:27` (ISC), `.github/workflows/deploy.yml:40-48` (build/push, no signing).
- `src/api/admin.js:19-21` (`adminAuth` su tutte le rotte admin).

### Pictorium — confronto

- `https://github.com/Eful97/Pictorium` — branch `master`, letto il 20/10/2026; `LICENSE`
  (AGPL-3.0).
- `docs/discord-nuvio-guide.md`: 5-9 (hosted site, no server), 22-33 (personal space/password/
  recovery key), 35-45 (TMDB key), 61-76 (template `u=`, `live=1`, `shape={shape}`), 78-79 (never
  share `api_key`), 98-111 (shape), 151-190 (caching/IDs/privacy; `u=` non è una password).
- `README.md`: 155-170 (PIN solo editor; multi-user, session password, recovery key, AES-256-GCM,
  rate limit), 305-315 (`PICTORIUM_MULTI_USER`, `PROFILE_ENCRYPTION_KEY`, cap), 340-345
  (render/cache), 348-360 (limiti noti).
- `SECURITY.md`: 31-53 (scope: admin-token/PIN/session, rate limiting, SSRF, path traversal,
  cache-key isolation; hardening `PUBLIC_INSTANCE=0` + `ADMIN_TOKEN`, `TRUST_PROXY` +
  `CLIENT_IP_HEADER`, `PUBLIC_STATS=0`, `FRAME_ANCESTORS`, `PREVIEW_AUTH`).
- `.env.example`: 7-12 (key priority, instance fallback warning), 38-56 (auth/rate limit/
  multi-user/encryption/HMAC), 43 (`PICTORIUM_RATELIMIT_POSTER_MAX=200`).

### Hosting e costi

- Cloudflare Images pricing: `https://developers.cloudflare.com/images/pricing/` — $5/100k
  images stored/month, $1/100k delivered/month, 5,000 unique transformations free, then $0.50/1k.
- Cloudflare R2 pricing: `https://developers.cloudflare.com/r2/pricing/` — 10 GB-month free, 1M
  Class A, 10M Class B, egress free; $0.015/GB-month, $4.50/M Class A, $0.36/M Class B.
- Bunny CDN pricing: `https://bunny.net/pricing/` — Standard EU/NA $0.01/GB, Asia $0.03/GB,
  South America $0.045/GB, Middle East/Africa $0.06/GB; Volume $0.005/GB first 500 TB.
- DigitalOcean droplets: `https://www.digitalocean.com/pricing/droplets` — $6/mo 1 GB/25 GB/1 TB,
  $12/mo 2 GB/50 GB/2 TB, $24/mo 4 GB/80 GB/4 TB.
- MongoDB Atlas pricing: `https://www.mongodb.com/pricing` — M0 free 512 MB/100 ops/s; M2 2 GB
  $9/mo; M10 ~$0.08/h (~$56/mo).
- Tailscale pricing: `https://tailscale.com/pricing` — Free: up to 6 users, 50 tagged resources.
- Tailscale Funnel: `https://tailscale.com/kb/1223/funnel` — TLS only, ports 443/8443/10000,
  non-configurable bandwidth limits (no number published).
- TMDB attribution: `https://www.themoviedb.org/about/logos-attribution` — every application using
  TMDB data/images must attribute TMDB.

### Probe pubblici del 20/10/2026 (read-only, nessun account)

- `POST https://api.nuvio.tv/rest/v1/rpc/health_ping` (apikey) → `200 true`; header
  `Ratelimit-Limit: 900`, `X-Ratelimit-Limit-Second: 900`, `Ratelimit-Remaining: 547`,
  `Server: cloudflare`.
- `GET https://api.nuvio.tv/auth/v1/settings` (apikey) → `200`,
  `passkeys_enabled: true`, `mailer_autoconfirm: true`, `disable_signup: false`,
  `anonymous_users: true`, `phone: false`; nessun campo MFA.
- `OPTIONS https://api.nuvio.tv/rest/v1/rpc/health_ping` con `Origin: https://example.com` →
  `Access-Control-Allow-Origin: *`, allow headers `apikey,authorization,content-type`.
- `OPTIONS https://api.nuvio.tv/auth/v1/token?grant_type=password` con lo stesso `Origin` → stesso
  risultato: **CORS aperto a qualsiasi origine**.

### Nota legale

Questa nota è ricerca tecnica, non un parere legale. Per un servizio pubblico in UE: GDPR
(Regolamento UE 2016/679, in particolare artt. 3, 6, 7, 13, 17, 28, 32), DPIA se il trattamento è
sistematico, informativa privacy, DPA con Atlas/Cloudflare/Bunny/GHCR, e revisione legale di
terms/trademark. Le valutazioni su "cosa si può chiamare Nuvio" vanno confermate da un avvocato.
