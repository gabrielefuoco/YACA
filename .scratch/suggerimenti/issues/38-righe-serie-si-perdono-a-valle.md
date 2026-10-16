Status: ready-for-agent
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

