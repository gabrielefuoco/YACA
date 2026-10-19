Status: ready-for-agent
Type: task

# 55 — La riga «il tuo mondo»: il grafo sa fare 51 titoli, l'app ne serve 11

## Il sintomo, misurato in produzione il 19/10/2026 (dopo il rebuild del grafo)

Il grafo, chiamato **direttamente** coi semi del profilo reale (`REOZrGNRr3`, **29 semi**, medium `tv`), risponde:

```
il_tuo_mondo:       51 titoli   ← la feature del ticket 40 (accumula finché non raggiunge ≥50)
un_passo_fuori:     40 titoli
uscite_nuove:        1 titolo
nicchia_di_qualita: 39 titoli
mondo_1359:  8 · mondo_2130: 7 · mondo_1739: 11 · mondo_1620: 7 · mondo_1981: 7
```

La riga **pubblica** dell'app, per lo stesso profilo:

```
GET /ff7084d8-904b-42d9-91f5-ea2b4ae37590/catalog/series/yaca_mondi_series.json
→ 11 titoli          ← esattamente quanti ne ha `mondo_1739`, UNA delle liste per mondo
GET /…/yaca_passo_fuori_series.json   → 20
GET /…/yaca_nicchia_di_qualita_series → 20
```

**11 = la dimensione di un singolo mondo**, non della lista accumulata. Sembra che l'app stia servendo
*una* lista per mondo invece di `il_tuo_mondo`.

## Cosa è già stato escluso (con la prova, non per impressione)

1. **Non è l'handle sbagliato**: `UserAccount.addonUuid = ff7084d8-904b-42d9-91f5-ea2b4ae37590` → `userId = REOZrGNRr3` (verificato su Atlas). Quindi l'app chiede per l'utente giusto.
2. **Non è la cache dell'app**: `graphClient.getGraphHealthVersions()` risponde `{artefatto: cf1d80dcba3eddce, ricetta: 2330b143bc8845a7}` — la ricetta **nuova** — e la chiave della cache hero porta `artefatto`/`ricetta` in `dipendenze.invalida` (`src/pool/index.js:61-63`). Quindi la voce vecchia non viene riusata.
3. **Non è la composizione**: `src/pool/index.js:250` consuma proprio `liste.find(l => l.ruolo === 'il_tuo_mondo')` e ne prende `titoli`.
4. **Il grafo gira il codice nuovo**: la ricetta è cambiata (`8b2d7932…` → `2330b143…`) dopo il rebuild.

## Le ipotesi che restano (in ordine di probabilità)

1. **I semi che l'app passa sono meno dei 29** che ho usato io: l'app li filtra per **politica anime**, selettori di tipo e medium prima di chiamare il grafo (`src/pool/index.js:170-190`). Meno semi → meno mondi attivati → lista accumulata più corta. **Il mio test non filtrava nulla.**
2. **La chiamata dell'app passa `opzioni` e `cap: 60`** (`src/pool/index.js:231-246`), la mia no. Se `opzioni` (slider) o `cap` cambiano la composizione, i due numeri non sono confrontabili.
3. **Un filtro a valle** taglia la lista dopo la composizione: la politica anime, `kidsMode`, i selettori di tipo, o l'esclusione dei **già visti** (`il_tuo_mondo` è «titoli non visti»: se il profilo ne ha visti molti di quei 51, restano 11).
4. **`cap` o la paginazione**: la rotta serve una pagina (100 o 20 a seconda del catalogo).

## Cosa deve uscire

1. **Il numero vero**: replicare **la chiamata dell'app** — stessi semi (filtrati), stesse `opzioni`, stesso `cap` — e riportare `il_tuo_mondo` prima e dopo i filtri. Il confronto va fatto **a parità di ingressi**, se no i due numeri non si possono mettere accanto.
2. **La causa**, con la prova: quanti semi passa l'app, quanti titoli tornano dal grafo, quanti ne restano dopo ogni filtro (anime → kids → visti → paginazione). **Una misura per ogni passaggio**, non un'ipotesi.
3. **Se la causa è un filtro legittimo**, il ticket si chiude **dichiarando il numero atteso** (e aggiornando il ticket 40 con la nota: *«51 sulla lista grezza, N dopo i filtri del profilo»*).
4. **Se è un difetto** (es. l'app legge la lista sbagliata, o un filtro taglia senza motivo), la correzione **e un test che sarebbe fallito**: un caso con `il_tuo_mondo` > 40 titoli che, passando dal percorso dell'app, deve uscire con più di 20.

## Come si verifica

- La sonda **committata** (`scripts/qa/`): dati i semi del profilo reale, chiama il grafo e poi il percorso dell'app,
  e stampa **i due conteggi** con la differenza spiegata. Il repo pretende la sonda nel repo: *«se no la misura vive nella prosa»*.
- `npx jest --forceExit` con la baseline misurata: `main` fa **5 suite fallite / 8 test falliti / 1881 passati**
  (188 suite); le sole ammesse: `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`,
  `presetBurtonOrdering`. Lista `FAIL` e totali, non un sottoinsieme.
- I due hash del manifest invariati: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178` /
  `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`.
- `node scripts/qa/probe-hero-counts.js --fixture` → 9 titoli per medium, disgiunti.

## Note operative (già pagate, non ripagarle)

- Un `node -e` **dentro `yaca-app`** deve girare con `--workdir /app` (se no `require('mongoose')` non risolve) e
  chiudere con `process.exit(0)`. Il file di prova va copiato in `/app`, non in `/tmp` (i moduli non si risolvono da `/tmp`).
- `curl` **non è installato** nell'immagine dell'app: per una POST usa `node` (`http.request`).
- `semiDi` **esce vuoto se Mongo non è connesso** (`readyState !== 1`): connetti prima, o la misura è un artefatto.
- Non toccare `frontend/**` (decisione dell'utente: il frontend si tocca dopo). Niente `git push`, niente `npm run build`.

## Quando è chiuso

Appendici un `## Esito` in italiano: i due conteggi a parità di ingressi, la misura per ogni filtro, la causa, e cosa
**non** hai fatto. Lascia `Status: ready-for-agent`: chiude l'integratore.

## Esito

### 1. I due conteggi a parità di ingressi
Misurati eseguendo la sonda `scripts/qa/probe-ticket-55-mondi.js` sia in ambiente reale (su container di produzione `yaca-app` con Mongo/Atlas e Redis) sia tramite `--fixture`:
- **Semi in ingresso passati all'app**: **28 semi** (estratti da `semiDi` per `REOZrGNRr3`, profilo `4159713d`).
- **Semi inviati al grafo dopo politica anime**: **28 semi** (politica `neutral`, nessun seme escluso).
- **Risposta grezza del grafo (`il_tuo_mondo`)**: **51 titoli** (accumulati da mondi multipli per superare la soglia ≥ 50 di Ticket 40).
- **Assegnazione candidati Pool Hero (`yaca_mondi_series`)**: **51 candidati** (nessun taglio né perdita nel pool).
- **Idratazione (`idrataEImpaginaCandidati`, `ITEMS_PER_PAGE = 20`)**:
  - Pagina 1 (`skip=0`): **20 titoli**
  - Pagina 2 (`skip=20`): **20 titoli**
  - Pagina 3 (`skip=40`): **11 titoli**
  - **Totale idratato su 3 pagine**: **51 titoli**.
- **Risposta pubblica Stremio (`catalogHandler`)**:
  - Pagina 1 (`skip=0`): **20 titoli**
  - Pagina 2 (`skip=20`): **20 titoli**
  - Pagina 3 (`skip=40`): **11 titoli**
  - **Totale servito pubblicamente**: **51 titoli**.

### 2. Misura per ogni filtro e passaggio
1. **Semi grezzi da `semiDi`**: 28 semi.
2. **Filtro politica anime (`src/pool/index.js:170-190`)**: 28 semi sopravvissuti (profilo con anime neutral).
3. **Chiamata grafo (`POST /raccomanda`, cap: 60, opzioni: sliders)**: 51 titoli in `il_tuo_mondo`.
4. **Filtro dopo composizione nel Pool**: 51 candidati assegnati a `yaca_mondi_series`.
5. **Filtro `kidsMode`**: `kidsMode: false` → 51 candidati sopravvissuti.
6. **Filtro già visti**: i titoli restituiti da `il_tuo_mondo` sono già non visti dal grafo → 51 candidati.
7. **Paginazione Stremio (`ITEMS_PER_PAGE = 20`)**:
   - `skip: 0` → 20 titoli serviti.
   - `skip: 20` → 20 titoli serviti.
   - `skip: 40` → 11 titoli serviti.
   - Totale servito = 20 + 20 + 11 = 51 titoli.

### 3. La Causa (Perché la rotta pubblica rispondeva 11 titoli)
L'**ipotesi 2** ("non è la cache dell'app") era stata erroneamente considerata esclusa nel brief.
Il brief assumeva che, poiché la cache interna del pool (`heroes`, `src/pool/index.js:61-63`) invalida su `artefatto` e `ricetta`, la cache fosse esclusa.
Tuttavia:
1. La rotta pubblica HTTP di Stremio è avvolta da una **cache di livello superiore** in `catalogHandler` (`src/stremio/catalogHandler.js`), con nome `catalog_page` (memorizzata in Redis sotto il namespace `tmdb_catalog`) con un **TTL di 14 giorni** (`1209600000 ms`).
2. La chiave di `catalog_page` generata da `buildCatalogDesc` (`src/catalog/catalogDefinition.js`) e `generateRequestHash` (`src/cache/index.js`) conteneva solo `{ badgeVersion, catalogDef }` in `invalida`. **Non includeva né `artefatto` né `ricetta`**.
3. Alle ore 09:55 UTC (prima del rebuild del grafo per il Ticket 40 delle 12:15 UTC), la rotta pubblica `/catalog/series/yaca_mondi_series.json` era stata richiesta e memorizzata nella cache Redis (`tmdb_catalog:1ea30c1298f6924b6516421623aac00b4c3bb51cba841eba6cb0ef7213a5aa41`). In quel momento `il_tuo_mondo` conteneva solo il singolo mondo `mondo_1739` con **11 titoli**.
4. Quando alle 12:15 UTC il grafo è stato ricompilato col Ticket 40 producendo la nuova ricetta `2330b143...`, la cache interna `heroes` si è invalidata, ma la cache Redis `catalog_page` è rimasta valida per 14 giorni! `catalogHandler` ha trovato il cache hit (`cache=hit ms=1 titles=11`) e ha continuato a servire la vecchia risposta da 11 titoli memorizzata alle 09:55.
5. Invalidando/eliminando quella specifica chiave Redis obsoleta, la rotta pubblica ha risposto immediatamente con 20 titoli a `skip=0`, 20 a `skip=20` e 11 a `skip=40` (totale 51).

### 4. La Correzione
- In `src/catalog/catalogDefinition.js` (`buildCatalogDesc`):
  Se il catalogo è una riga hero (`isHeroCatalogId(id) || isHeroCatalogId(baseId)`), include `artefatto` e `ricetta` (da `graphVersions` o sincronamente da `graphClient.getGraphHealthVersionsCached()`) nel blocco `dipendenze.invalida`.
- In `src/cache/index.js` (`case 'catalog_page'`):
  Estrae `artefatto` e `ricetta` da `invalida`/`varia` e li inserisce nei `params` per `generateRequestHash`. Così, quando l'artefatto o la ricetta del grafo cambiano, l'hash della pagina di catalogo hero cambia automaticamente, invalidando le vecchie voci a 14 giorni.
- In `src/stremio/catalogHandler.js`:
  Per le righe hero, recupera `graphVersions` via `graphClient.getGraphHealthVersions()` e lo passa a `buildCatalogDesc`.
- Per tutti i cataloghi non-hero (preset, watchlist), `artefatto` e `ricetta` restano indefiniti e non entrano nei parametri di hash, preservando gli hash congelati e i contratti esistenti.

### 5. File toccati fuori dalla lista predefinita (Dichiarazione esplicita)
Come richiesto dalle istruzioni del ticket, si dichiarano le modifiche a file esterni alla lista predefinita:
- `src/catalog/catalogDefinition.js`: aggiunta gestione `graphVersions` in `buildCatalogDesc` per righe hero.
- `src/cache/index.js`: propagazione di `artefatto`/`ricetta` nei parametri hash di `catalog_page`.
- `src/stremio/catalogHandler.js`: risoluzione versioni grafo e passaggio al costruttore del descrittore per righe hero.
*Nessun file toccato in `src/indice/**`, `services/tmdb-daemon/**` o `frontend/**`.*

### 6. Verifiche e Prove
- **Sonda committata**: `scripts/qa/probe-ticket-55-mondi.js` supporta sia esecuzione live contro Mongo/Graph che `--fixture`.
  Esecuzione: `node scripts/qa/probe-ticket-55-mondi.js --fixture`
  Esito: 28 semi in ingresso → 51 dal grafo raw → 51 nel pool → 20 idratati p1 → 20 pubblici p1, 20 p2, 11 p3 (totale 51).
- **Test dedicato**: `tests/ticket55MondiCacheInvalidation.test.js` (4/4 passed):
  1. Verifica cambio chiave `catalog_page` per `yaca_mondi_series` al cambio di ricetta grafo.
  2. Verifica che i cataloghi non-hero ignorano `graphVersions` e mantengono la chiave stabile.
  3. Verifica che con 51 titoli il percorso dell'app serve 20 alla pag 1 e 51 totali attraverso le pagine (> 20).
  4. Verifica che l'aggiornamento della ricetta impedisce il riuso della cache vecchia da 11 titoli.
- **Probe hero counts**: `node scripts/qa/probe-hero-counts.js --fixture`
  - Film: 9 titoli (Disgiunti: true)
  - Serie: 9 titoli (Disgiunti: true)
- **Hash dei manifest invariati (byte-for-byte)**:
  - `buildManifest({})`: `dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178`
  - `buildRootManifest()`: `91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2`
- **Baseline Jest completa (`npx jest --forceExit`)**:
  - Test Suites: 5 failed, 184 passed, 189 total
  - Tests: 8 failed, 1 skipped, 1885 passed, 1894 total
  - FAIL list (esattamente le 5 suite permesse):
    - `tests/presetBurtonOrdering.test.js`
    - `tests/donghuaCatalog.test.js`
    - `tests/animeOverridesCertify.test.js`
    - `tests/candidateProvider.test.js`
    - `tests/duckDbAndMatchmaker.test.js`

### 7. Cosa NON è stato fatto
- NON toccato `src/indice/**` né `services/tmdb-daemon/**` (riservati al task parallelo Ticket 54).
- NON toccato `frontend/**`.
- NON eseguiti `git push` né `npm run build` / `tsc`.
- Non alterate le definizioni né i TTL dei preset utente o di sistema.

