Status: ready-for-agent
Type: task
Blocked by: 07

# 08 — Il prodotto parla col servizio

## Perché

Il ticket 12 chiuderà il vecchio stack dietro un confine; questo chiude il **nuovo** dal lato prodotto. Oggi
il prodotto legge l'artefatto in casa propria (`src/data/bolle.json` → `src/engines/bolle/Bolle.js` →
`raccomanda.js` → `hybridRecommendations.js`, il gancio dopo `assignHeroPools`) e serve due righe:
`yaca_mondi_*` e `yaca_passo_fuori_*`.

## Cosa deve uscire

- **L'adattatore**: il punto del prodotto che traduce la storia in una richiesta e la risposta in pool.
  Oggi quella traduzione è `righePerStremio` dentro `raccomanda.js` (semi → `{yaca_mondi_series: [...]}`),
  con `CAP=60`, `MONDI_PER_RIGA=8`, `VICINI=3` cablati: quei numeri sono **opzioni di richiesta**, non
  costanti del prodotto (charting, decisione 3).
- **La chiamata al cache-build**, non per richiesta: `buildSharedHeroCatalogs` in
  `src/engines/hybridRecommendations.js` è dove il gruppo si costruisce (e dove oggi il `console.log`
  stampa `[Mondi] … settimane · mondi 60 · passo fuori 14`). La risposta del motore entra lì, e da lì in poi
  il resto del prodotto la tratta come una riga qualsiasi.
- **La fine della doppia verità**: `Bolle.js`, `raccomanda.js` e la lettura di `bolle.json` non servono più
  al prodotto. Vanno **cancellati**, non lasciati in piedi «per sicurezza»: se restano, la prossima sessione
  li userà. La cancellazione del file lo fa il 09; qui si cancella il codice.
- **Il degrado**: motore giù o lento → la riga non compare, il resto del feed continua. Il guardiano c'è già
  (`[Mondi] ATTENZIONE: … ZERO titoli in entrambe le righe`) e va conservato.
- **La chiave di cache alzata** (`HERO_CACHE_KEY_VERSION`): cambia *cosa entra* nella struttura memorizzata,
  quindi senza bump il fix non produce effetto. È la trappola pagata dieci volte il 17/10.

## Come si verifica

Dentro il container, sul deploy vero: `docker logs yaca-app | grep '\[Mondi\]'` deve mostrare i conteggi che
il motore ha restituito, e `curl .../catalog/series/yaca_mondi_series.json` deve restituire **gli stessi
titoli**. Il confronto è fra i due numeri, non con un'impressione.

**Questo è anche il posto in cui il ticket 38 della mappa `suggerimenti` (le righe serie che si perdono fra
pool e risposta) diventa visibile o sparisce**: se dopo questo ticket le righe serie sono ancora 3, la perdita
è a valle del pool — e il 38 va riaperto con la prova in mano, non con un'ipotesi.

## Attenzione

Gli hero sono definiti in **dieci** posti (nove derivati da `src/catalog/registry.js`, più `HERO_PRIORITY`):
se una riga smette di comparire, il sospetto è lì prima che nel motore. E `tv`/`series` sono la stessa cosa
con due nomi (`annotationKeyFor` usa `tv`, la MetaPreview in uscita usa `series`).

---

## Esito

**Risolto il 17/10/2026** (lasciato in `Status: ready-for-agent` in attesa del collaudo end-to-end sul mate a valle del ticket 18).

### 1. La forma del client (`src/pool/graphClient.js` e `src/pool/index.js`)
- Creato il client HTTP dedicato `src/pool/graphClient.js`:
  - Indirizzo configurabile via env var `GRAPH_SERVICE_URL` con default sane `http://graph:7862` (il servizio compose del ticket 07).
  - Timeout fissato a **10 s** (`GRAPH_TIMEOUT_MS = 10000`).
  - Metodo `raccomanda({ semi, medium, opzioni, cap })` che effettua `POST /raccomanda`.
- Nella voce additiva `graph_rows` di `HERO_STRATEGIES` in `src/pool/index.js`:
  - I semi vengono estratti tramite `semiDi` di `src/library/`, convertiti nella forma del contratto `{ tmdbId, medium, tipo, peso }`, con top-up dei seed da Trakt quando disponibili.
  - Le opzioni (`graphOptions`: slider largo, lontano, cozy, canone) vengono passate dal profilo utente se presenti (`opzioni`), con `cap: 60` e `medium` (`'movie'` o `'series'`).
  - La risposta del servizio viene mappata negli item del pool tramite `ensurePoolItem`: garantisce oggetti con `id` (`tmdb:<id>`), `tmdbId` numerico, `type` (`movie`|`series`), `media_type` (`movie`|`tv`), `punteggio` e metodo `toString()`.
  - Le liste mantengono i ruoli del contratto: `il_tuo_mondo` popola `yaca_mondi_*`, `un_passo_fuori` popola `yaca_passo_fuori_*`.
  - Conservati i log di deploy prescritti:
    `[Mondi] <media>: seed da archivio X, da Trakt Y · mondi N · passo fuori M`
    e il guardiano `[Mondi] ATTENZIONE: ... ZERO titoli in entrambe le righe`.

### 2. La nuova derivazione della chiave di cache (Emendamento E3)
- `HERO_CACHE_KEY_VERSION` alzata da **v12** a **v13**.
- `graphClient.getGraphHealthVersions()` interroga `GET /health` e memorizza il payload delle versioni in memoria RAM per **60 s** (`HEALTH_CACHE_TTL_MS = 60000`).
- `buildSharedHeroCacheKey` concatena le versioni restituite dall'health check (`_art_<artefatto>_ric_<ricetta>`) nella chiave (`..._heroes_v13_art_<sha>_ric_<sha>_...`).
- Quando l'artefatto sul motore viene aggiornato e il servizio riavviato (ticket 09), `GET /health` espone il nuovo hash in <1 ms, la cache in RAM si aggiorna e la cache del prodotto invalida automaticamente i pool memorizzati senza toccare né riavviare il prodotto.
- In assenza o prima della risposta di `/health`, la chiave degrada a `..._heroes_v13_...`, mantenendo pieno determinismo e compatibilità con i test unitari.

### 3. Comportamento in caso di guasto / degrado (Emendamento E5)
- In caso di errore di rete, timeout (10 s), 503 o connessione rifiutata (`ECONNREFUSED`):
  - Viene registrato il log prescritto: `[Mondi] motore non raggiungibile: <errore>`.
  - Le righe `yaca_mondi_*` e `yaca_passo_fuori_*` restano vuote e il resto del feed prosegue regolarmente con gli altri hero.
  - Viene impostato il flag `graphCallFailed = true`.
  - In `buildAndCacheSharedHeroCatalogs`, se `graphCallFailed === true`, il gruppo hero **non viene memorizzato per 7 giorni** (`RECOMMENDATIONS_CACHE_TTL_MS`), ma viene salvato con **TTL breve di 60 s** (`hybridRecommendationsCache.set(cacheKey, group, 60 * 1000)`).
  - Aggiornato `src/cache/CacheManager.js` affinché rispetti il `ttlMs` personalizzato sia in L1 (RAM) che in L2 (Redis). Un guasto transitorio al riavvio del servizio non avvelena più la cache per una settimana.

### 4. Cosa è stato cancellato e test rimossi
- **Cancellati i file del ponte JS interno**:
  - `src/engines/bolle/Bolle.js`
  - `src/engines/bolle/raccomanda.js`
- **Lettura di `bolle.json`**:
  - Eliminato ogni `require('.../data/bolle.json')` all'interno di `src/`. Il file `src/data/bolle.json` rimane tracciato su disco (sarà rimosso dal tracking git nel ticket 09).
- **Test rimossi con motivazione**:
  - `tests/bolleParity.test.js`: eliminato perché verificava la parità matematica tra l'implementazione JS locale (`Bolle.js`) e il golden Python. Con la rimozione del ponte JS, questo test non ha più oggetto (la parità è garantita dal test di contratto del servizio Python introdotto nel ticket 07, `tests/test_contratto_servizio.py`).
  - `tests/raccomanda.test.js`: eliminato perché testava le funzioni interne di `src/engines/bolle/raccomanda.js` ormai cancellato.
- **Test aggiornati e aggiunti**:
  - `tests/graphRowsInvariant.test.js`: ri-orientato sulla voce `graph_rows` del modulo pool mockando la risposta del servizio HTTP, preservando identico l'invariante del ticket 38 (oggetti strutturati con `id`, `tmdbId`, `type`, `media_type` coerenti per movie e series).
  - `tests/graphClientPoolIntegration.test.js`: nuova suite per verificare E3 (caching health in RAM e derivazione della chiave), E5 (degrado con timeout/connessione rifiutata e memorizzazione con TTL 60s), e chiamate a `raccomanda`.
  - `src/api/bolle.js` e `tests/bolleRoute.test.js`: aggiornati per consumare `graphClient` anziché il file rimosso `raccomanda.js`.

### 5. Esito verifiche Jest (eseguite singolarmente)
- `tests/graphRowsInvariant.test.js`: **4/4 passati** (in 1.40 s)
- `tests/hybridRecommendations.test.js`: **22/22 passati** (in 1.72 s)
- `tests/heroPoolAnimeExcludeCap.test.js`: **1/1 passato** (in 5.91 s, con cacheKey v13)
- `tests/heroCacheKeyNoVersion.test.js`: **10/10 passati** (in 0.93 s)
- `tests/diag.recommender.h1.lightMeta.test.js`: **2/2 passati** (in 0.83 s)
- `tests/graphClientPoolIntegration.test.js`: **6/6 passati** (in 1.03 s)
- `tests/bolleRoute.test.js`: **6/6 passati** (in 1.08 s)

### 6. Cose da verificare sul mate una volta concluso il ticket 18
Quando il ticket 18 avrà configurato compose e deploy:
1. `docker compose ps` deve mostrare entrambi i container `app` e `graph` attivi sulla rete interna.
2. `docker exec yaca-app curl -s http://graph:7862/health` deve restituire `{"ok":true,"contratto":1,"versioni":{"artefatto":"...","ricetta":"..."}}`.
3. `docker logs yaca-app | grep '\[Mondi\]'` deve confermare il passaggio dei seed e i conteggi restituiti dal servizio (`[Mondi] series: seed da archivio ..., da Trakt ... · mondi N · passo fuori M`).
4. `curl .../catalog/series/yaca_mondi_series.json` e `curl .../catalog/movie/yaca_mondi_movies.json` devono restituire i titoli corrispondenti alle liste calcolate dal grafo.
5. In caso di stop temporaneo del container `graph` (`docker compose stop graph`), il feed di YACA deve continuare a rispondere (degrado elegante), nei log deve comparire `[Mondi] motore non raggiungibile: ...`, e la cache non deve rimanere bloccata per 7 giorni.

