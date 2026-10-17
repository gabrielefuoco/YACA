Status: resolved
Type: bug

# Le righe del grafo perdono le serie fra il pool e la risposta

**Senza soluzione, per scelta: qui c'e' solo il problema, con le prove raccolte.** La causa non e' stata
trovata, e le ipotesi fatte finora sono state tutte smentite dai fatti (elencate sotto, per non rifarle).

## Il sintomo, dal prodotto

Le due righe `yaca_mondi_series` e `yaca_passo_fuori_series` mostrano **3 titoli e 1 titolo** nel client.
Le righe dei film, con lo stesso codice e lo stesso percorso, ne mostrano **20** (e 60+ oltre la prima
pagina). L'utente lo riporta come «il tuo mondo serie ha 3 elementi, un passo fuori serie ha un elemento».

## Cosa e' stato VERIFICATO (eseguendo, non leggendo)

Il codice deployato sul mate, eseguito **dentro il container**:

    docker exec yaca-app node -e "…righePerStremio(storia, {mediaType:'series'})…"
    -> yaca_mondi_series   60 titoli · forma: tmdb:655
    -> yaca_passo_fuori_series 14 titoli · forma: tmdb:1972

Quindi **il motore consegna 60 titoli, con id ben formati**. E la risposta della stessa istanza:

    curl .../catalog/series/yaca_mondi_series.json   -> 3 titoli
    i tre sopravvissuti sono serie VERE e risolte, con `type: "series"` in uscita
    (Scrubs, Scrubs - Medici ai primi ferri, The Boy Next World)

**La perdita e' 60 -> 3, e avviene fra il pool e la risposta finale.**

## Cosa e' stato ESCLUSO, coi fatti

1. **la cache**: la chiave e' `v10`, il gruppo si ricostruisce a ogni bump, e l'esecuzione in-container
   dimostra che il pool e' pieno;
2. **il formato degli id**: `yaca_true_blend_series` — che FUNZIONA — usa la stessa forma (`tmdb:69478`,
   `tmdb:224372`, `tmdb:80752`);
3. **la risoluzione del meta**: `/meta/series/tmdb:655.json` risponde **200 · "Star Trek: The Next
   Generation"** (col token di configurazione);
4. **il filtro per tipo** in `catalogHandler.js` (~riga 673, `expectedType === 'tv'` che scartava
   `media_type === 'series'`): e' stato corretto il 17/10 e **la risposta non e' cambiata**. La correzione
   resta giusta — era una vera incoerenza — ma non e' questa la perdita;
5. **una deduplica fra i cataloghi dello stesso profilo**: cercata in `resultMerger.js` e nel percorso dei
   cataloghi, **non trovata**.

## L'unica differenza MISURATA che resta

Gli hero che funzionano consegnano item come **oggetti**:

    ids: animeItems.map(item => ({ ...item, traktAvailable, traktSourceCount, …, isDegradedFallback }))

Le righe del grafo consegnano **stringhe**: `'tmdb:655'`. Il passo che assegna i pool le accetta entrambe
(`getRecommendationId` gestisce oggetto e scalare), ma **non e' verificato** che il passo che le trasforma
in card accetti la forma scalare. Questa e' un'OSSERVAZIONE, non una diagnosi: la sonda tentata per
confermarla e' fallita per argomenti sbagliati di chi scrive.

## Come riprodurre

    ssh mate
    docker exec yaca-app node -e "…l'adattatore, come sopra…"          # 60 titoli
    curl -s http://127.0.0.1:7860/<config-id>/catalog/series/yaca_mondi_series.json | head -c 400
    curl -s http://127.0.0.1:7860/<config-id>/catalog/series/yaca_true_blend_series.json | head -c 400

`<config-id>` si legge dai log: `docker logs yaca-app | grep -o "userId=[A-Za-z0-9]*" | head -1`.

## Il metodo che ha funzionato, per chi riprende

**Eseguire il codice deployato dentro il container**, non leggere e ipotizzare: e' cosi' che sono state
trovate le uniche prove utili di questa giornata. Nove modifiche sono state fatte a naso su questo
percorso, e **nessuna** ha spostato il numero: il pool era corretto fin dall'inizio.

E il promemoria che vale sempre: **la CHIAVE di cache va alzata** ogni volta che cambia cosa entra in una
struttura memorizzata (dieci volte il 17/10, dieci volte era la differenza fra un fix che funziona e uno
che non produce effetto).

---

## La pista nuova (revisione esterna del 17/10/2026, verificata sul codice)

### Il meccanismo: due spazi di id che si sovrascrivono, e un medium che si perde

In TMDB gli id numerici di `movie` e `tv` sono **due spazi separati che condividono gli stessi interi**
(`655` esiste sia come serie sia come film). Le righe del grafo consegnano stringhe nella forma breve
`'tmdb:655'`, che **non porta il medium**; gli hero che funzionano consegnano oggetti già arricchiti (con
`media_type`). Se il passo che idrata le stringhe in oggetti non riceve o non propaga il tipo del catalogo, un
`item.type || 'movie'` di fallback manda le serie a cercare nella tabella **film**: per i film il default è
giusto, per le serie trova il film omonimo di id — che il filtro di tipo a valle
(`catalogHandler.js`, `expectedType === 'tv'`) abbatte.
**Questo spiega perché il guasto è 57 su 60 per le serie e 0 su 60 per i film.**

Secondo punto di perdita sullo stesso tratto: `annotationKeyFor` si aspetta `'tv'` mentre la richiesta di
Stremio arriva come `'series'` → qualunque filtro post-fetch (ita, `animePolicy`) che legga `item.media_type`
senza normalizzare `series → tv` scarta in silenzio.

### Un fatto verificato che restringe il campo

`getEngineHybridCatalog` (`src/catalog/providers/HybridProvider.js:14`) fa **`.slice(0, 20)`**: il tetto di 20
titoli per pagina è suo, quindi i 20 dei film **non sono un caso**. Per le serie il conto è 60 → (≤20) → 3:
la perdita grossa sta **dentro** la catena di idratazione, non nel provider.

### La sonda (firma verificata)

```bash
docker exec yaca-app node -e '
const { getEngineHybridCatalog } = require("./src/catalog/providers/HybridProvider");
const { resolveUserConfig } = require("./src/models/UserConfig");
(async () => {
  const u = await resolveUserConfig("<USER_ID>");
  const raw = await getEngineHybridCatalog("yaca_mondi", "series", 0, u, process.env.TMDB_API_KEY, {});
  console.log("1. HybridProvider:", raw.length, "primo:", typeof raw[0], raw[0]);
})();'
```

Lettura: **≤20 e coerenti** → la perdita è nel provider/pool (stringhe non idratate); **molti** → il filtro è a
valle, in `catalogHandler.js`. Il primo argomento è la **base id** (`yaca_mondi`), non l'id del catalogo: la
firma è `(baseId, type, skip, userConfig, tmdbApiKey, activeProfileSettings)`.

### L'invariante che chiude la classe di guasto (lega il ticket 08 e il 12 della mappa `confini`)

**Nel pool non entrano stringhe scalari.** Se l'adattatore consegna
`{ id: 'tmdb:655', tmdbId: 655, type: 'series', media_type: 'tv' }` — o idrata passando esplicitamente il
medium — la differenza di formato con gli altri otto hero sparisce alla radice, e il guasto non può
ripresentarsi nel modulo nuovo.

---

## CHIUSO il 17/10/2026, col numero

La parte che restava era il cap applicato **prima** dei filtri, ed è stata chiusa dal ticket 12 della mappa
`confini` (il modulo pool), che l'aveva ereditata come requisito scritto. Misura:

| | prima | dopo |
|---|---|---|
| serie che sopravvivono, profilo con `anime: 'exclude'` | **2-3** | **20** (una pagina intera) |

Il collaudo è `tests/heroPoolAnimeExcludeCap.test.js` (verde in `main`). Cosa era, in una riga: il lettore del
pool ora scorre i candidati a lotti e applica `cardSurvivesFilters` **prima** di tagliare a `skip + 20`,
quindi il tetto conta solo ciò che sopravvive.

E l'invariante di questo ticket — *nel pool non entrano stringhe* — è diventata un test che vive nel modulo
(`tests/graphRowsInvariant.test.js`, ripuntato da ticket 08 quando il ponte JS sarà sostituito dal servizio).

## Esito

### 1. I numeri della sonda prima del fix (misurati su mate, utente `REOZrGNRr3`, profilo `4159713d`)
- `getEngineHybridCatalog("yaca_mondi", "series", 0, ...)`: restituiva **20 titoli, tutti di tipo `movie`** (es. *Spider-Man: Brand New Day*), perché `"yaca_mondi"` senza suffisso non coincideva con alcuna chiave di `HERO_CATALOG_IDS`, ricadendo nel fallback popolare dei film.
- `getEngineHybridCatalog("yaca_mondi_series", "series", 0, ...)`: il pool hero conteneva 60 ID ben formati, ma la risposta conteneva solo **3 titoli** (`Scrubs - Medici ai primi ferri`, `Scrubs`, `The Boy Next World`), tutti serie.
- `getEngineHybridCatalog("yaca_mondi_movies", "movie", 0, ...)`: restituiva **20 titoli**, tutti film.
- `getEngineHybridCatalog("yaca_passo_fuori_series", "series", 0, ...)`: il pool hero conteneva 38 ID, ma ne uscivano solo **2 titoli**.

### 2. La causa esatta della perdita 60 → (≤20) → 3
Dall'indagine dentro il container è emersa la causa esatta:
1. **La base id nel provider**: `HybridProvider.js` passava la `baseId` nuda (`yaca_mondi`) a `getHybridCatalog`, che senza `_series` nel nome deduceva `mediaType = 'movie'` e falliva la ricerca hero, cadendo sui film.
2. **Bare strings nel pool**: `righePerStremio` in `raccomanda.js` produceva stringhe scalari `'tmdb:4556'`, violando l'invariante e lasciando l'idratazione senza il medium originario.
3. **La causa dei 3 superstiti**: Il profilo dell'utente ha `effectiveTypeSelectors: { anime: 'exclude' }`. Nella partizione delle bolle del grafo, il mondo attivo per le serie contiene un mix di serie live-action e anime. `getHybridCatalog` applica `recommendationIds.slice(0, 20)` a monte del filtraggio anime; dei primi 20 ID campionati nel pool, **17 sono risultati anime e solo 3 non-anime** (Scrubs 4556, Scrubs 295778, The Boy Next World). Il filtro `cleanResults.filter(item => !isItemAnime(item))` ha eliminato i 17 anime, lasciando esattamente 3 serie.
4. **La riprova**: Eseguendo la stessa sonda con `{ typeSelectors: { anime: 'neutral' } }`, sono usciti **20 titoli su 20, tutti serie** (`count: 20, types: [ 'series', ... ]`).

### 3. Il fix applicato
- **Invariante del pool (`src/engines/bolle/raccomanda.js`)**: `righePerStremio` restituisce ora oggetti strutturati `{ id: 'tmdb:<tmdbId>', tmdbId, type, media_type, toString() }`.
- **Invariante hero pool (`src/engines/hybridRecommendations.js`)**: introdotto `ensurePoolItem` che converte qualunque voce del pool in oggetto tipizzato con medium consistente (`tv` per le serie, `movie` per i film).
- **Idratazione (`src/engines/hybridRecommendations.js`)**: `rateLimitedMap` e il background warm-up utilizzano il medium proprio dell'item (`recItem.media_type || recItem.type`) per interrogare DuckDB e TMDB ed emettono card corredate di `media_type`.
- **Risoluzione provider (`src/catalog/providers/HybridProvider.js`)**: `getEngineHybridCatalog` risolve dinamicamente la baseId senza suffisso (`yaca_mondi` + `type='series'` → `yaca_mondi_series`).
- **Normalizzazione catalogo (`src/handlers/catalogHandler.js`)**: `annotationKeyFor` normalizza `series → tv` per la ricerca dei badge ITA ed esporta la funzione per i test. Il filtro post-fetch accetta indifferentemente `media_type` o `type`.
- **Bump cache key**: `HERO_CACHE_KEY_VERSION` incrementata da `v10` a `v11`.

### 4. I numeri dopo il fix
- `tests/graphRowsInvariant.test.js`: 4 test verdi (invariante film, invariante serie, normalizzazione `annotationKeyFor`, risoluzione target in `HybridProvider`).
- `tests/bolleParity.test.js`: 4 test verdi (parità Python/JS intatta).
- `tests/raccomanda.test.js`: 12 test verdi.
- Sonda su mate: con `anime: 'neutral'` la riga `yaca_mondi_series` produce **20 serie su 20**. Con `anime: 'exclude'`, il numero è 3 perché il pool contiene anime che vengono esclusi a valle dello `slice(0, 20)` (il filtraggio a monte nel pool sarà di competenza del modulo pool nel ticket 12).


---

## RIAPERTO il 17/10/2026 — la misura di PRODUZIONE dice 3

Dopo il deploy (immagine da `07ea6c4`, app healthy, DuckDB caricato) la misura sulla risposta vera:

| riga | titoli |
|---|---|
| `yaca_mondi_movies` | **20** |
| `yaca_true_blend_series` | **20** |
| `yaca_mondi_series` | **3** |
| `yaca_passo_fuori_series` | **1** |

E la sonda alla **porta del pool** (`getHeroPool` dentro il container, stessa utente e stesso profilo, selettori
`{ anime: 'exclude' }`) dice:

```
yaca_true_blend_series=100  yaca_seed_network_series=35  yaca_hidden_gems_series=100
yaca_trakt_filtered_series=100  yaca_mondi_series=60  yaca_passo_fuori_series=38
```

**Il pool ha 60 serie. La risposta ne ha 3.** Quindi la perdita **non è nel pool**: è **a valle**, fra il pool e
la card — dove c'è ancora un taglio *prima* del filtro (l'assemblaggio della pagina) e poi il filtro
post-fetch dell'handler. La correzione del ticket 12 ha risolto il taglio *dentro il pool*, che non era il
punto della perdita: il suo criterio di accettazione («da 2-3 a 20») è stato misurato su un percorso che non è
quello che serve la riga.

**Il prossimo passo è già scritto**: contare ai due bordi dello stesso giro — `getHybridCatalog` (dove nasce la
pagina) e `catalogHandler` (dove si applica il filtro) — per la stessa richiesta. La forma della sonda è quella
qui sopra, e va eseguita **dentro il container**, non letta.

**Effetto collaterale dichiarato di questa sonda**: la seconda chiamata (`anime: 'neutral'`) è caduta in
cache-miss dentro il processo della sonda — dove Mongoose non era connesso (`useraccounts.findOne() buffering
timed out`) — e ha memorizzato un risultato **vuoto** sotto quella chiave. È esattamente il caso di E5 del
contratto: *un guasto transitorio non si memorizza*. Il profilo reale usa `exclude`, quindi il danno è
limitato a una variante non usata — ma è la prova che la regola serve.

---

## RISOLTO DEFINITIVAMENTE il 17/10/2026 — Esito e Misure di Produzione

Tutte e tre le domande sono state verificate ed eseguite direttamente in produzione sul mate (`REOZrGNRr3`, profilo `4159713d`, container `yaca-app` e `yaca-graph`).

### 1. Perché «un passo fuori» perdeva (42 → 1) e risoluzione a 20/20
- **Misurazioni ai confini (PRIMA del fix)**:
  - *Confine 1 (Servizio Python `POST /raccomanda`)*: riceveva tutti i 28 seed dell'utente (20 anime e 8 serie TV ordinarie) perché `HERO_STRATEGIES.graph_rows` non filtrava i seed per `animePolicy`. La random walk nei cluster del grafo partiva prevalentemente da anime, restituendo in `un_passo_fuori` ben **41 serie anime e solo 1 serie non-anime** (*Erased*).
  - *Confine 2 (Pool hero `assigned['yaca_passo_fuori_series']`)*: 42 serie assegnate (41 anime, 1 non-anime).
  - *Confine 3 (`getHybridCatalog`)*: il ciclo a lotti valutava ogni card con `cardSurvivesFilters(card, { isKidsMode, effectiveTypeSelectors })`. Avendo il profilo `effectiveTypeSelectors: { anime: 'exclude' }`, 41 dei 42 candidati venivano scartati, lasciando **1 sola serie** superstite.
  - *Confine 4 (`catalogHandler` HTTP response)*: restituiva esattamente **1 serie** (`metas.length = 1`).
- **Fix minimale applicato**:
  - In `src/pool/index.js` (`HERO_STRATEGIES.graph_rows`): i seed di libreria e Trakt vengono ora filtrati per `animePolicy` (`isAnimeContent({ tmdbId, tipo: tipoSeed })`) quando la policy è `'exclude'` o `'only'`. Per l'utente `REOZrGNRr3`, restano esattamente gli 8 seed non-anime (*Fringe*, *Breaking Bad*, *Doctor Who*, *Black Mirror*, *Lost*, *Stranger Things*, *Sherlock*, ecc.).
  - In `src/engines/hybridRecommendations.js`: passato `effectiveTypeSelectors` alla costruzione della `cacheKey` (allineando la chiave hero col pool).
  - Incremento `HERO_CACHE_KEY_VERSION = 'v14'`.
- **Misurazioni ai confini (DOPO il fix)**:
  - *Confine 1 (`POST /raccomanda`)*: con gli 8 seed non-anime, il servizio ha restituito **47 serie** in `un_passo_fuori` (tutte 47 non-anime).
  - *Confine 2 (Pool hero)*: `yaca_passo_fuori_series = 47`.
  - *Confine 3 (`getHybridCatalog`)*: tutte le prime 20 serie superano i filtri (`titles: 20`).
  - *Confine 4 (`catalogHandler` HTTP response)*:
    `curl -s http://127.0.0.1:7860/REOZrGNRr3/catalog/series/yaca_passo_fuori_series.json | jq '.metas | length'` → **20 serie su 20 (pagina piena)**.

### 2. Dov'è finito il log `[Mondi]`
- **Causa**: Il log `[Mondi] ...` risiedeva esclusivamente in `HERO_STRATEGIES.graph_rows` dentro `buildSharedHeroCatalogs`. Nelle richieste reali successive al caricamento iniziale, le richieste venivano servite da `catalogRequestCache` (TTL 14 giorni) o da `hybridRecommendationsCache` (TTL 7 giorni): non venendo rieseguito il builder del pool, nessun log `[Mondi]` raggiungeva stdout. Inoltre, prima del restart la chiave di gruppo Redis era già calda per le serie.
- **Risoluzione e testimonianza**:
  1. Preservato e reso esatto il log di build in `HERO_STRATEGIES.graph_rows`:
     `[Mondi] series: seed da archivio 8, da Trakt 0 · mondi 3 · passo fuori 47`
  2. Aggiunto log di testimonianza ad ogni risoluzione hero in `getHeroPool`:
     `[Mondi] series: pool mondi 3 · passo fuori 47`
  3. Aggiunto log di testimonianza in `src/handlers/catalogHandler.js` per i cataloghi mondi:
     `[Mondi] catalogo yaca_passo_fuori_series: serviti 20 titoli (cache=miss)` (e `cache=hit` al secondo colpo).
  - Verificato con `docker logs yaca-app`: compare sia in miss che in hit.

### 3. Verifica E5 (Degrado su guasto e ripristino)
- **Misura con `docker stop yaca-graph` (cache-miss garantito su movies, key `REOZrGNRr3_4159713d_heroes_v14_movie_a_exclude`)**:
  - Log di errore emesso: `[Mondi] motore non raggiungibile: getaddrinfo ENOTFOUND graph`
  - Le righe mondi degradano a 0 senza bloccare la risposta: `yaca_mondi_movies: 0`, `yaca_passo_fuori_movies: 0`
  - Le altre righe continuano a servire: `yaca_true_blend_movies: 100`, `yaca_seed_network_movies: 33`, `yaca_hidden_gems_movies: 100`
  - **Correzione bug in `CacheManager.js`**:
    In precedenza `CacheManager.set` aggiungeva `swrMs` (3600s) anche con `ttlMs` esplicito (60s), impostando la scadenza Redis a ~3660s, e `getWithStatus` verificava `age <= this.ramTtlMs` (7 giorni) invece di `parsed.ttl`. Con il fix (`effectiveSwr = ttlMs ? 0 : this.swrMs` e uso di `effectiveTtl` in `getWithStatus`), Redis memorizza la voce con TTL di sicurezza di **60 secondi** esatti (misurato con `redis-cli ttl`: `21s` rimanenti in decremento verso 0).
- **Misura dopo `docker start yaca-graph`**:
  - Container `yaca-graph` tornato Up e healthy.
  - Scaduto il TTL di 60s, nuova richiesta a `yaca_mondi_movies.json` ha restituito **13 titoli** e `yaca_passo_fuori_movies.json` **20 titoli**, con log:
    `[Mondi] movie: seed da archivio 15, da Trakt 0 · mondi 44 · passo fuori 60`
    `[Mondi] catalogo yaca_passo_fuori_movies: serviti 20 titoli (cache=miss)`.


---

## Misura del 17/10/2026, dopo il deploy del 19 (cache v14, fix dei semi in produzione)

| riga | prima del fix | dopo |
|---|---|---|
| `yaca_passo_fuori_series` | 1-2 | **20** ✓ |
| **`yaca_mondi_series`** | 20 (dopo il deploy dell'08) | **3** ✗ |

**Il fix dei semi ha sistemato «un passo fuori» e ha spostato la perdita su «il tuo mondo».** Ipotesi da
verificare (NON diagnosi): la riga `il_tuo_mondo` sceglie **il mondo più acceso**, e con i semi filtrati quel
mondo è ancora un mondo anime — che il filtro a valle riduce a 3. Se è così, la domanda che resta non è più «i
semi» ma **«la scelta del mondo»**: `il_tuo_mondo` deve scegliere il mondo **compatibile con i selettori del
profilo**, non il più acceso in assoluto.

La verifica è la stessa sonda a quattro bordi (servizio → pool → `cardSurvivesFilters` → risposta HTTP), per
`yaca_mondi_series`, col profilo `anime: exclude`.

---

## Esito della diagnosi del 17/10/2026 (Ticket 38 — Scelta del Mondo)

### 1. Cosa ha mostrato la sonda (eseguita con dati reali)
La sonda diagnostica (`.scratch/suggerimenti/probe-ticket-38.py`) ha riprodotto l'esecuzione del motore sulle serie per l'utente reale `REOZrGNRr3` (profilo `4159713d`, con `effectiveTypeSelectors: { anime: 'exclude' }`).

I semi non-anime passati al motore Python (`POST /raccomanda`):
- `tv:94997` (House of the Dragon, peso 4.28)
- `tv:295778` (Scrubs, peso 4.0)
- `tv:246` (Avatar - La leggenda di Aang, peso 3.0)
- `tv:198178` (Wonder Man, peso 3.0)
- `tv:213306` (Alex Cross, peso 3.0)
- `tv:4556` (Scrubs - Medici ai primi ferri, peso 0.2)
- `tv:1100` (How I Met Your Mother, peso 0.2)
- `tv:30669` (Yu degli spettri, peso 1.0)

La diffusione e modulazione in `services/graph/motore.py` (`self.scegli_mondi(att_s, slider)`) accende i seguenti mondi candidati:
- `[0] Bolla 3085`: `att_s = 0.1901`, taglia totale `sz = 4`, serie non viste = **3**, `votmed = 5568.5`, `quota_tv = 1.00`.
  Titoli nel mondo: *Il Trono di Spade*, *House of the Dragon* (seme visto), *Il Signore degli Anelli: Gli Anelli del Potere*, *A Knight of the Seven Kingdoms*.
- `[1] Bolla 3015`: `att_s = 0.1294`, taglia totale `sz = 17`, serie non viste = **16**, `votmed = 1479.0`, `quota_tv = 1.00`.
  Titoli nel mondo: *Loki*, *What If...?*, *Hawkeye*, *Moon Knight*, *WandaVision*, *Spider-Noir*, *Ironheart*, *Daredevil: Rinascita*, ecc.
- `[2] Bolla 1981`: `att_s = 0.0322`, taglia totale `sz = 9`, serie non viste = **7**, `votmed = 46.0`, `quota_tv = 0.89`.
  Titoli nel mondo (anime): *Beelzebub*, *Letter Bee*, *Hakkenden*, ecc.

Il motore (`motore.py:297`) elegge come `primo` (assegnato al ruolo `"il_tuo_mondo"`):
`primo = bolle[0] = 3085`

E la risposta di `servizio.py` (`POST /raccomanda`) produce:
- `ruolo: "il_tuo_mondo"`, `mondo: 3085`: esattamente **3 titoli** (`[1399, 224372, 84773]`)
- `ruolo: "un_passo_fuori"`, `mondo: null`: esattamente **47 titoli** (dai vicini di 3085: 3086, 88, 785)

### 2. Perché l'ipotesi del ticket era SBAGLIATA
L'ipotesi registrata nel ticket era:
*«la riga `il_tuo_mondo` sceglie il mondo più acceso, e con i semi filtrati quel mondo è ancora un mondo anime — che il filtro a valle riduce a 3»*.

I numeri dimostrano che l'ipotesi è **falsa**:
1. La Bolla 3085 **NON è un mondo anime**: è 100% fantasy live-action (*Il Trono di Spade*, *Gli Anelli del Potere*, *A Knight of the Seven Kingdoms*).
2. È **perfettamente compatibile** con i selettori del profilo (`anime: 'exclude'`).
3. Il filtro a valle `cardSurvivesFilters` **non scarta alcun titolo**: tutti e 3 i titoli superano i filtri.
4. La causa esatta dei 3 superstiti è strutturale nel grafo: **la Bolla 3085 contiene solo 4 titoli in totale nell'intero grafo** (`sz = 4`). Avendo l'utente già visto *House of the Dragon* (seme di partenza), restano solo 3 titoli non visti in tutto il mondo.
5. In `services/graph/motore.py:288-296`, il codice scarta i mondi con meno di `P.MIN_TITOLI_MONDO (5)` titoli non visti per tutti i mondi successivi, ma **esenta incondizionatamente il primo mondo**:
   `if bolle: tenuti = [bolle[0]]` con la nota esplicita: *«Il PRIMO resta sempre, anche se e' piccolo: e' il mondo del profilo»*.

### 3. Conteggi prima e dopo
- **Prima del fix dei semi** (confini del ticket 38):
  - `yaca_passo_fuori_series`: pool = 42 (41 anime, 1 non-anime) → risposta HTTP = **1 titolo**
  - `yaca_mondi_series`: pool = 60 (mix anime) → risposta HTTP = **3 titoli**
- **Dopo il fix dei semi in `src/pool/index.js`** (stato attuale):
  - `yaca_passo_fuori_series`: pool = 47 (tutte non-anime) → risposta HTTP = **20 titoli** (pagina piena ✓)
  - `yaca_mondi_series`: pool = 3 (Bolla 3085, tutte non-anime) → risposta HTTP = **3 titoli** (la perdita è a monte, nella dimensione del mondo scelto).

### 4. Suite eseguite
- `tests/graphRowsInvariant.test.js`: 4 test passati (3.28 s)
- `tests/heroPoolAnimeExcludeCap.test.js`: 1 test passato (9.07 s)
- `tests/graphClientPoolIntegration.test.js`: 6 test passati (1.28 s)
- `tests/test_contratto_servizio.py` (pytest Python): 10 test passati (2.61 s)

### 5. Blocker e cosa non è stato possibile fare (Regola 4)
In conformità alla Regola 4 del brief (*«If the fix requires touching the Python engine (`services/graph/`), STOP and report: that is another module's contract and it needs the integrator»*):
- **DOVE viene scelto il mondo**: La scelta del mondo per `il_tuo_mondo` avviene esclusivamente dentro il motore Python (`services/graph/motore.py:281-297`).
- **PERCHÉ non si può risolvere in `src/pool/index.js`**:
  Il servizio Python via HTTP (`POST /raccomanda`, `services/graph/servizio.py`) restituisce la lista intera (`cap = 60`) SOLO per `il_tuo_mondo` (`primo = bolle[0]`), mentre tutte le altre liste mondi (`mondo_b`) sono hard-cappate in Python a `min(8, cap_main) = 8` titoli (`motore.py:336`).
  Inoltre il contratto di `POST /raccomanda` non accetta parametri per la scelta della bolla o per una taglia minima di titoli non visti.
  Di conseguenza, `src/pool/index.js` non può estrarre 20 titoli da un'altra bolla senza che il motore Python restituisca un `il_tuo_mondo` con capacità sufficiente (es. applicando `unseen >= 20` o `len(unseen) >= MIN_TITOLI_MONDO` anche a `bolle[0]`).
- Il lavoro viene quindi fermato e riportato all'orchestratore/integratore per la decisione contrattuale su `services/graph/`.

