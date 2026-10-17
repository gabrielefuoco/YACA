Status: resolved
Type: grilling

# 24 — Il modulo cache: chi possiede le chiavi

## Perché

La cache oggi è **un meccanismo senza proprietario**, e i sintomi sono misurati:

- `cacheInstances` è importato in **8 file**;
- i TTL sono **sei costanti** sparse in `src/config.js` (da 6 ore a 14 giorni: `FAST_CATALOG_PAGE1_L2_TTL_MS`,
  `FAST_CATALOG_DEEP_L2_TTL_MS`, `SLOW_CATALOG_L2_TTL_MS`, `CACHE_TTL_MS`, `MOVIE_META_CACHE_TTL_MS`,
  `SERIES_META_CACHE_TTL_MS`);
- le chiavi sono costruite **a mano in tre posti** (`buildRecommendationCacheKey` in
  `hybridRecommendations.js`, il template string del pool, `catalogRequestCache.set(requestCacheKey, …)`
  in `catalogHandler.js`);
- e stanotte ne è uscito un **bug vero**: `CacheManager` gonfiava il TTL esplicito con `swrMs` (60 s → 3660 s) e
  `getWithStatus` confrontava col TTL in RAM (7 giorni) invece che con quello della voce — trovato *verificando
  E5*, non leggendo.

E soprattutto: **la trappola numero uno di questa mappa** — *«la chiave va alzata ogni volta che cambia cosa entra
in una struttura memorizzata»*, pagata dieci volte in un giorno — è il sintomo esatto di chiavi che nessuno
possiede.

## Deciso in grilling (17/10/2026)

**Il modulo deriva le chiavi.** Chi vuole memorizzare **dichiara cosa memorizza** — la struttura, la sua
**versione**, le **dipendenze** (profilo, selettori, artefatto del motore) — e il modulo **costruisce la chiave**
e applica il TTL. Alzare la versione diventa un campo della descrizione, non una costante da ricordare in dieci
posti: la trappola diventa **impossibile invece che ricordata**.

**La forma della descrizione** (deciso lo stesso giorno): `{ nome, versione, dipendenze, ttl }` → il modulo torna
`{ chiave, ttl }`. E dentro le dipendenze sta la distinzione che conta, oggi mescolata in un template string:
quelle che **variano** (profilo, selettori, media — danno *chiavi diverse*) e quelle che **invalidano** (versione
della struttura, artefatto del motore — rendono *vecchia* la voce).

**Conseguenza**: la seconda domanda è chiusa da questa — i **sei TTL** di `src/config.js` diventano **campi delle
descrizioni**, e non c'è più un dizionario da tenere allineato a parte. Il TTL di una voce si legge **accanto alla
voce**.

**Il poster è un dominio suo** (deciso lo stesso giorno): il nome ERDB, i file composti, la coda degli eventi e il
suo drenatore — che gira da un **timer di sistema**, cioè da un consumatore *fuori* dal processo — stanno in un
**modulo poster**, il quarto accanto a profilo, ricerca, catalogo, indice, cache. È coerente con quello che il
ticket 16 aveva già deciso (*«la cache/ERDB possiede i poster e la coda»*, fuori dal modulo libreria) e dà un nome
a una cosa che oggi vive sparsa fra `src/cache/` e `scripts/`, pilotata da fuori.

**Entrano tutte le risposte memorizzate** (deciso lo stesso giorno): il gruppo hero, la pagina del catalogo
(`catalogRequestCache`, 14 giorni), le meta (6 ore / 14 giorni), le raccomandazioni. Una convenzione sola — e
soprattutto una guardia che può essere **senza buchi**: se una cache resta fuori, la guardia ha un buco, e il buco
è esattamente dove sta la prossima trappola. La differenza fra le cache (il feed costa 21-42 s, la pagina no) è un
**campo della descrizione**, non un confine.

## Tutte le domande decise (17/10/2026)

| domanda | decisione |
|---|---|
| la descrizione | `{ nome, versione, dipendenze, ttl }` → il modulo torna `{ chiave, ttl }`; nelle dipendenze, quelle che **variano** (chiavi diverse) e quelle che **invalidano** (la voce diventa vecchia) |
| i TTL | chiusa dalla precedente: i **sei TTL** di `config.js` diventano campi delle descrizioni — il TTL si legge accanto alla voce |
| poster e coda | **un modulo poster** (ERDB, i file composti, la coda e il drenatore): è un dominio, non una cache, e ha un consumatore **fuori dal processo** (un timer di sistema) |
| quanto grande | **tutte le risposte memorizzate**: gruppo hero, pagina del catalogo (14 g), meta (6 h / 14 g), raccomandazioni. La differenza di costo è un campo della descrizione, non un confine |
| la guardia | **è l'API, non un test**: il consumatore passa una *descrizione*, mai una chiave — fuori dal modulo non c'è niente da costruire. E la verifica è una sola, e non è una regex: **nessuno fuori dal modulo importa il client** (ioredis), una guardia sulle *dipendenze* che regge ai refactor |

---

## Esito (17/10/2026)

Tutte le decisioni del ticket sono applicate e verificate con test focalizzati:

### 1. L'API del modulo cache (`src/cache/index.js`)
L'API espone:
- **`leggi(descrizione, costruttore, options)`**: se `costruttore` è fornito, gestisce hit, miss e SWR in background in modo trasparente; se omesso, restituisce `{ value, status, chiave, ttl }`.
- **`scrivi(descrizione, valore, options)`**: memorizza il valore associato alla chiave derivata e al TTL esplicito o di default.
- **`cancella(descrizione, options)`** (alias `invalida`): cancella la chiave derivata dall'istanza cache appropriata.
- **`deriva(descrizione)`**: traduce la descrizione in `{ chiave, ttl, instance }`.

**La guardia applicata**: se il chiamante passa una stringa invece di una descrizione a `leggi()`, `scrivi()` o `deriva()`, viene lanciato immediatamente un `TypeError`. Inoltre, la guardia architetturale verifica che nessun file fuori da `src/cache` importi `ioredis` (zero violazioni).

### 2. La forma della descrizione e la distinzione delle dipendenze
Forma canonica:
```javascript
{
  nome: 'heroes' | 'recommendations' | 'catalog_page' | 'meta' | string,
  versione: number | string, // campo esplicito per alzare la versione e invalidare
  dipendenze: {
    varia: { utente, profilo, media, kids, selettori, catalogo, ... }, // generano chiavi DIVERSE
    invalida: { versione, artefatto, ricetta, catalogDef, ... }       // rendono VECCHIA la voce
  },
  ttl: number // letto accanto alla voce
}
```
- **Variare**: profili, utenti, tipi media, filtri kids e selettori (`selettori.anime`) producono chiavi distinte.
- **Invalidare**: cambiare la versione strutturale (`versione: 15`) o l'artefatto/ricetta del motore altera la chiave, invalidando automaticamente la cache senza dover ricordare convenzioni o toccare template string sparsi.
- **Selettori (nota per ticket 21)**: il modulo cache **non risolve** i selettori (non consulta DB né userConfig); li **riceve** direttamente in `dipendenze.varia.selettori` e costruisce la chiave da ciò che il contesto porta.

### 3. Le tre costruzioni a mano diventate una (con prova `grep`)
Tutte e tre le costruzioni a mano sono state eliminate e sostituite dalla derivazione centralizzata in `src/cache/index.js`:
1. `buildRecommendationCacheKey` (`src/engines/hybridRecommendations.js:63`): template string `${userId}_${context}_${catalogId}` rimosso; la funzione delega a `cache.deriva({ nome: 'recommendations', dipendenze: { varia: ... } })`.
   - `grep '\$\{userId\}_\$\{context\}_'` in `hybridRecommendations.js` → **0 occorrenze**.
2. Template string del pool (`src/pool/index.js:69`): `${userId}_${context}_heroes_${HERO_CACHE_KEY_VERSION}` rimosso; `buildSharedHeroCacheKey` delega a `cache.deriva({ nome: 'heroes', ... })`, e la cache del pool legge e scrive con `cache.leggi(heroDesc)` / `cache.scrivi(descToWrite, group)`.
   - `grep '\$\{userId\}_\$\{context\}_heroes_'` in `src/pool/index.js` → **0 occorrenze**.
3. `catalogRequestCache.set(requestCacheKey, ...)` (`src/handlers/catalogHandler.js:927`): rimosso insieme a `catalogRequestCache.getOrFetch` ed eliminato `requestCacheKey`. Ora usa `cache.scrivi(catalogDesc, freshData)` e `cache.leggi(catalogDesc, fetchCatalog)`.
   - `grep 'catalogRequestCache\.set'` in `src/handlers/catalogHandler.js` → **0 occorrenze**.
   - `grep 'requestCacheKey'` in `src/handlers/catalogHandler.js` → **0 occorrenze**.

### 4. I TTL spostati nelle descrizioni
Tutte le risposte memorizzate dichiarano il loro TTL esplicito accanto alla voce:
- `heroes` (`pool/index.js`): TTL 7 giorni (`7 * 24 * 60 * 60 * 1000`), degradato a 60 secondi in caso di guasto transitorio E5 (`graphCallFailed`).
- `recommendations` (`hybridRecommendations.js`): TTL 7 giorni (`7 * 24 * 60 * 60 * 1000`).
- `catalog_page` (`catalogHandler.js`): `catalogDesc.ttl = effectiveTtl` (14 giorni standard, 7 giorni fast, 36 ore finestra giornaliera, 20 min simulcast, 2 min watchlist).
- `meta` (`metaHandler.js`): 14 giorni per i film (`14 * 24 * 60 * 60 * 1000`), 6 ore per le serie (`6 * 60 * 60 * 1000`).

### 5. Il bug del TTL in CacheManager e il suo test
- **Fix completato**: in `CacheManager.js:72`, `effectiveSwr` in L1 è calcolato come `envelope.ttl ? 0 : this.swrMs`, allineando L1 al comportamento già presente in L2. In questo modo un TTL esplicito non viene gonfiato con la finestra SWR.
- **Test dedicato**: `tests/cacheModule.test.js` verifica che con RAM TTL = 7 giorni e SWR = 1 ora, una voce scritta con TTL esplicito di 60 s è `fresh` a 30 s e scade esattamente a `miss` a 61 s (non resta fresh per 7 giorni né stale per 3660 s).

### 6. Suite di test verificate
- `tests/cacheModule.test.js`: **16 passed** (guardia API, derivazione, varia/invalida, TTL bug, leggi/scrivi).
- `tests/heroCacheKeyNoVersion.test.js`: **10 passed**.
- `tests/graphClientPoolIntegration.test.js`: **6 passed**.
- `tests/hybridRecommendations.test.js`: **22 passed**.
- `tests/catalogCacheKey.test.js`: **20 passed**.
- `tests/catalogCacheKeys.test.js`: **8 passed**.
- `tests/metaHandlerCacheImmutability.test.js`: **4 passed**.

### 7. Cosa resta (fuori da questo ticket)
- **Modulo poster**: la gestione dei file ERDB, poster statici composti, coda eventi e drenatore (`posterDaEvento.js`, `codaEventi.js`, `drenaPoster.js`) è un dominio autonomo con consumatore fuori processo (timer di sistema) assegnato al ticket 25 in parallelo. Tali file sono stati lasciati intatti.


**Il poster è il ticket 25** (): il modulo vive in  (con  dentro), il drenatore resta un **comando** per il timer di sistema, e le unità sull'host vanno riportate a mano ( →  +  + ).
