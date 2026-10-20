Status: resolved
Type: research
Punto: P01, P02, P13, P29
Blocked by: —

# 01 — L’API pubblica di Nuvio: auth, sync, limiti, notice

## Domanda

Quali operazioni può fare davvero un’integrazione terza con l’API pubblica di Nuvio, con quale
autenticazione, con quale strategia di sync per ogni risorsa, e con quali limiti/termini? In particolare:
quali endpoint YACA userebbe per **leggere** library/storia e per **scrivere** addon, collections, home
layout e settings; cosa è full-replace e cosa è merge; cosa succede a token scaduti, 429 e richieste
parziali.

## Cosa deve uscire

Una nota in `ricerche/01-api-pubblica-nuvio.md` con:

- **matrice endpoint**: metodo, auth, payload, risposta, errori, strategia di sync (full replace / merge /
  delta / blob upsert). Coprire almeno: auth, profili, addons, library, watch progress, watch history,
  profile settings, home catalog settings, collections, sync overview, health.
- **auth flow**: publishable key, sign-in, refresh, logout, scadenza, cosa succede con 2FA (se esiste),
  cosa NON è pubblico (PIN, flussi distruttivi, service role).
- **rate limit**: numeri dichiarati, comportamento 429, retry/backoff, batching consigliato.
- **identità**: `profile_id` 1..6, `content_id`/`content_type`, `progress_key`, `event_id`, `sort_order`,
  deduplication per `md5(url)`.
- **sync strategy per risorsa**: cosa YACA può pushare in sicurezza e cosa richiede merge client-side.
- **notice/termini**: cosa dice la documentazione su licenza, trademark, hosted service, endpoint
  interni non documentati.
- **cosa manca**: endpoint o comportamenti che la docs non copre e che andrebbero testati su un account
  usa-e-getta.

## Fonti primarie

- `https://nuvio.tv/docs/nuvio-public-api.md` (v1.3, 20/08/2026), letto integralmente.
- NuvioTV: `app/src/main/java/com/nuvio/tv/core/sync/*`, `ProfileSyncService`, `AddonSyncService`,
  `CollectionSyncService`, `HomeCatalogSettingsSyncService`.
- Kaptain: `nuvio-push.js` (auth, refresh, retry 429, RPC, full-replace).
- Nuvio docs page (rendered) per eventuali testi non nel markdown.

## Come si chiude

La nota è pronta quando:

1. ogni endpoint che YACA userebbe ha una riga con auth, payload, risposta e strategia di sync;
2. i full-replace sono elencati esplicitamente e le conseguenze di un payload parziale sono documentate;
3. auth/refresh/429/2FA hanno un comportamento raccomandato, non un’ipotesi;
4. le zone non documentate sono marcate come “da testare”, non presentate come certe;
5. c’è una sezione “Cosa significa per YACA” con 3–5 conseguenze operative.

---

## Esito

**Risolto il 20/10/2026** — nota completa in
[`ricerche/01-api-pubblica-nuvio.md`](../ricerche/01-api-pubblica-nuvio.md).

- **Quattro strategie, non intercambiabili**: full replace su profili/addons/collections/library legacy;
  mutazioni incrementali sulla library nuova; blob atomico su settings/home; merge non distruttivo su
  progress/history.
- **Trappola `sync_push_profiles`**: senza `p_client_max_profiles` torna al default di **4 slot** e
  cancella i profili 5–6. Kaptain lo omette; NuvioTV manda `6`. YACA deve sempre mandare `6`.
- **Home catalog**: la docs descrive `{rows, hidden_catalogs}` con platform `tv`, ma i client usano
  `{hide_unreleased_content, items[]}` con `home_catalog_shared`; senza `p_platform` la RPC può
  rispondere **300**. Superficie sperimentale, non MVP.
- **Identità**: addon dedotti per `md5(url)` sulla stringa grezza (canonicalizzare è compito del client);
  `progress_key` calcolato dal server; `event_id` è un cursore per profilo e per risorsa.
- **Auth/limiti**: token dichiarati a 3600s ma Kaptain osserva ~7 giorni (da testare); gateway a ~900
  req/s contro la linea guida di 100 req/s; NuvioTV non gestisce il 429, Kaptain sì con `Retry-After` e
  backoff.
- **Notice**: la licenza non dà accesso al servizio hosted né al trademark; gli endpoint non elencati
  sono interni e possono cambiare senza preavviso.
- **Conseguenza**: YACA Sync è un **client di sync autorizzato dall’utente**, non un servizio
  server-to-server. La lettura (library/history) è la parte sicura; la scrittura richiede
  `pull → merge → push → verify` (ticket 11).

