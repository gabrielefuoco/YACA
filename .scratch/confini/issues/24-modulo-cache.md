Status: ready-for-agent
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

## Le domande che restano (per il prossimo grilling)

1. **La forma della descrizione**: `{ nome: 'heroes', versione: 14, dipendenze: { utente, profilo, selettori,
   media, kids }, ttl }` → e il modulo restituisce `chiave` + `ttl`. Quali dipendenze sono obbligatorie, e come
   si dichiara che una dipendenza **invalida** (versione) invece di **variare** (il profilo)?
2. **Le istanze**: RAM + Redis + SWR restano nel modulo (sì, per la decisione), ma **chi decide i TTL**? Le sei
   costanti di `config.js` diventano campi delle descrizioni, o restano un dizionario del modulo?
3. **La cache dei poster e il drenatore** (`src/cache/posterDaEvento.js`, `drenaPoster.js`, la coda eventi): sono
   **cache** o sono un'altra cosa (una coda con un consumatore)? La decisione 14 dice che stanno fuori dal modulo
   libreria — ma dentro il modulo cache, o in un loro?
4. **`catalogRequestCache` (14 giorni) e le meta (6 ore / 14 giorni)**: entrano anche loro nella descrizione, o
   il ticket si ferma alla cache delle raccomandazioni?
5. **Il test-guardia**: un test che fallisce se compare una chiave costruita a mano fuori dal modulo — come si
   scrive senza dipendere dalla forma delle stringhe (che è la trappola della regex sul sorgente, vista col
   ticket 20)?

## Come si verifica (da completare in grilling)

Minimo: le tre costruzioni a mano diventano **una** (col `grep` che lo dimostra), il bug del TTL ha il suo test
(`ttl esplicito → la voce scade a quel TTL, non a quello in RAM`), e una versione alzata **invalida davvero**
(con la prova su Redis: `redis-cli ttl`).
