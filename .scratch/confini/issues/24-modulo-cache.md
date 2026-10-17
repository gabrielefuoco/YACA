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

**Cosa resta**: l'applicazione. E il bug del TTL gonfiato (`swrMs` sul TTL esplicito) ha già il suo test da scrivere: *un TTL esplicito scade a quel TTL, non a quello in RAM*.

---

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
