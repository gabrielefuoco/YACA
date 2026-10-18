Status: needs-triage
Type: task

# 41 — Il sostituto della catena ibrida (l'ultimo modulo da costruire)

## Perché

Il ticket 39 ha misurato che i provider **nuovi** del catalogo (`HybridProvider`, `AiDiscoveryProvider`)
dipendono dal **vecchio motore** per 2.670 righe:

```
catalog/providers/HybridProvider ─→ engines/hybridRecommendations (459)
                                  ─→ pool (655)
                                  ─→ engines/hybrid/dataFetchers (417)
                                  +  engines/hybrid/catalogStrategies (1.599)
```

Finché quella catena esiste, il vecchio stack (5.879 righe) **non si può cancellare** — non perché serva le rotte
vecchie, ma perché serve **i provider nuovi**. L'inventario di cosa fa ognuno dei cinque file è nella sezione
`## Inventario della catena ibrida` del ticket 39: le quattro strategie hero di gusto (`true_blend`,
`seed_network`, `hidden_gems`, `trakt_filtered`), cosa coprono già i moduli nuovi (il servizio del grafo,
`src/indice/`, `src/profile/`, `src/ricerca/`) e cosa manca.

## Cosa deve uscire

1. **Il fornitore dei candidati** nel motore nuovo: liste spiegate per gusto/mondo, dal servizio del grafo o da
   query parametrizzate su `src/indice/` — senza passare dallo scoring monolitico.
2. **La sincronizzazione Trakt/Stremio** dentro `src/library/` (che possiede i fatti e la cronologia).
3. **`src/pool/index.js` semplificato**: le strategie esclusive ricevono le liste direttamente; restano
   l'invariante di assegnazione disgiunta (`claimedIds`) e la formattazione Stremio.
4. **La prova**: i conteggi delle righe hero **prima e dopo** (le stesse sonde del ticket 38 di `suggerimenti`),
   e i 21 file di test del vecchio stack ripuntati o cancellati con lui.

## Ordine e dipendenze

È **lavoro di prodotto**, non pulizia: è il motore che produce i cataloghi che l'utente vede. Va dopo il deploy
del ticket 30 (così si misura su dati veri) e prima della cancellazione del vecchio stack.

## Handoff e stato (18/10/2026)

Il piano operativo completo è in **`C:\Users\gabri\AppData\Local\Temp\handoff-catena-ibrida.md`**: numeri verificati,
le cinque cose che mancano, i sei passi con la loro prova, gli invarianti da non rompere e le **11 trappole** pagate
in un giorno.

Le cifre da usare sono misurate, non stimate: la catena sono **3.169 righe** (`hybridRecommendations` 462 +
`pool` 693 + `dataFetchers` 416 + `catalogStrategies` 1.598), il serving è **1.717** (`catalogHandler` 1.037 +
`metaHandler` 680), il vecchio stack intero **5.098**.

## Stato aggiornato (18/10/2026, dopo il ticket 42)

`src/` = **157 file, 37.193 righe**. Il vecchio stack è **5.098** (invariato: il 42 ha distribuito, non tolto
motore), la catena ibrida è **3.169**. `src/data/` non ha più file `.js` (solo asset), `src/utils/` è sceso a
**6 file** (solo il cluster `tmdb*`, vivo), e la casa nuova è `src/infra/` (10 file, 854 righe).

Due note di integrazione che il prossimo deve conoscere: la porta di `src/infra` **spalma** gli export (per un
costruttore serve `const { LRUCache } = require('../infra')`), e la porta del **catalogo** non riesporta
`filters`/`presets`/`kidsModeFilters`/`contentId` — debito aperto.

## Esito (prima fetta: fornitore + hidden_gems — revisione post-review)

### 1. La forma della porta dei candidati
- **Collocazione**: nel modulo che possiede i dati, `src/indice/candidati.js`, esposto attraverso la porta pubblica `src/indice/index.js` tramite `indice.candidati(contesto, opzioni)` e l'alias semantico `indice.candidatiPerGusto(contesto, opzioni)`.
- **Firma del verbo**:
  ```javascript
  async candidati(contesto, { mediaType = 'movie', strategia = 'hidden_gems', limit = 100 } = {})
  ```
- **Contratto di ritorno**: **non solleva mai eccezioni** (degrado morbido in `motivi[]`), restituendo candidati spiegati:
  ```javascript
  {
      candidati: [
          {
              id: string,          // ID TMDB normalizzato
              motivo: string,      // Spiegazione (es. 'gemma_nascosta:vsm_alta_affinita', 'seme_cronologia', ...)
              punteggio: number,   // Score normalizzato (0.0 - 10.0)
              genres: string[],    // Generi per diversità
              genre_ids: number[]
          }
      ],
      items: [ ... ],            // Alias per i consumatori
      motivi: string[]           // Tracciamento diagnosi o degrado
  }
  ```
- **Isolamento da Mongoose e TasteProfile**: `src/indice/candidati.js` non importa né `mongoose` né `TasteProfile`. Il profilo di gusto (`tasteProfile`) è posseduto dal modulo profilo e viene passato pulitamente nel contesto dal chiamante (`ctx.tasteProfile = ctx.profile || ...`).
- **Nessun degrado silenzioso (VIOLATION 4)**: se `tasteProfile` non è presente o se la connessione al database del profilo fallisce, la degradazione viene tracciata esplicitamente in `motivi.push('taste_profile_non_disponibile')` / `'database_profilo_non_connesso'`.
- **Risolto BUG 2 (Kids Mode)**: il pavimento di punteggio (`score <= 0`) viene applicato solo quando un profilo di gusto esiste realmente (`kidsMode && tasteProfile && score <= 0`). Un profilo kids a freddo riceve la lista filtrata per età dai predicati dichiarativi DuckDB e dai marcatori di certificazione (`ProfileScorer.isItemInappropriateForKids`), senza mai svuotare il catalogo.

### 2. La strategia `hidden_gems` dietro switch & Isolamento Cache
- **Stato non-mutabile (VIOLATION 6)**: eliminata ogni variabile mutabile di modulo. La fonte di verità unica è `process.env.FLAG_NUOVA_CATENA_HIDDEN_GEMS === 'true'`. La funzione `setFlagNewHiddenGems(val)` scrive o rimuove la variabile d'ambiente.
- **Risolto BUG 1 (Collisione Chiave Cache)**: `toHeroDesc` e `buildSharedHeroCacheKey` in `src/pool/index.js` inseriscono lo stato dello switch in `dipendenze.varia`:
  ```javascript
  ...(isNewHiddenGemsActive() ? { nuova_catena_hidden_gems: 'true' } : {})
  ```
  Il modulo di cache (`src/cache/index.js`) incorpora questo stato nella chiave di `heroes`:
  - Switch OFF: `utente1_global_heroes_v14_movie`
  - Switch ON: `utente1_global_heroes_v14_movie_hg`
  Zero collisioni: attivare la nuova catena non serve mai righe della vecchia cache da 7 giorni.
- **Invariante `claimedIds`**: con switch ON, l'assegnazione disgiunta del pool garantisce totale assenza di duplicati tra righe hero concorrenti.
- **Collaudo percorso OFF (GAP 7)**: test dedicato in `tests/poolHiddenGemsSwitch.test.js` che verifica che a switch OFF venga eseguito `catalogStrategies.buildHiddenGemsCatalog` e che `indice.candidati` non venga toccato.

### 3. Collocazione metodi e dipendenze
- **Allineamento VSM (VIOLATION 5)**: `isHiddenGemAlignedWithProfile` è stato spostato in `src/profile/ProfileScorer` (suo legittimo proprietario) e viene invocato come `ProfileScorer.isHiddenGemAlignedWithProfile(...)`. Nel fornitore di candidati `ProfileScorer` viene importato dalla porta del modulo (`src/profile`).
- **Duplicazione temporanea dei filtri qualità**: i filtri sanitari `isCompilationOrBoxSet` e `passesQualityFloor` sono replicati localmente in `src/indice/candidati.js` per non violare il divieto di modifica su `src/engines/hybrid/catalogStrategies.js`. Questa duplicazione è transitoria fino alla dismissione del vecchio motore; la fonte di verità per il nuovo flusso è `src/indice/candidati.js`.
- **Debito preesistente sulle dipendenze circolari**: `src/library/index.js:53` richiede `../profile` mentre `ProfileBuilder` richiede `../library`. Questo ciclo è preesistente (presente identico in `main`). Per non amplificare il debito, i require verso `library` e `profile` all'interno di `candidati.js` sono invocati in modalità lazy all'interno della funzione.

### 4. I numeri della misura riproducibile (QA Probe)
Misurazione eseguita tramite la nuova sonda riproducibile committata nel repository:
`node scripts/qa/probe-hidden-gems-jaccard.js`

Profilo di gusto impiegato: profilo reale `REOZrGNRr3/global` (Atlas MongoDB, 2.090 chiavi nel vettore `V_final`). Se eseguito in ambienti CI privi di rete, la sonda commuta automaticamente sul profilo cinefilo sintetico con vettori reali garantendo la riproducibilità.

| Media | OFF Count | ON Count | Intersezione | Unione | Indice Jaccard | Score VSM medio | Note sullo score VSM |
|---|---|---|---|---|---|---|---|
| **Film (`movie`)** | **160** | **75** | 14 | 221 | **0.0633** (~6.33%) | **4.42** (max 7.37) | **75/75 non-zero** (min 1.86) |
| **Serie (`series`)** | **160** | **58** | 18 | 200 | **0.0900** (~9.00%) | **4.46** (max 7.60) | **58/58 non-zero** (min 1.86) |

#### Analisi onesta della divergenza compositiva
1. Nella precedente misurazione lo score VSM era 0 per tutti i 77 titoli perché nessun profilo raggiungeva il fornitore (degradazione silenziosa). Con il passaggio del profilo dal pool al contesto (`ctx.tasteProfile`), **il 100% dei candidati ha ora punteggi di affinità VSM non-zero** (punteggio medio 4.42 per i film, 4.46 per le serie, con picchi fino a 7.60).
2. La bassa sovrapposizione Jaccard (~6.3% per i film, ~9.0% per le serie) è fisiologica e spiegabile chiaramente:
   - Il vecchio motore (`buildHiddenGemsCatalog` con `fetchSmartAndPool`) cercava titoli tramite keyword dei cluster ma poi riempiva fino a 160 titoli attingendo al fallback per popolarità decrescente pura (`fetchHiddenGemsFallbackIds` ordinato per `popularity.desc`).
   - Il nuovo motore compila query DuckDB con ordinamento nativo per qualità bayesiana (`S.QUALITY`), filtra per allineamento DNA (`isHiddenGemAlignedWithProfile`), ordina rigorosamente per punteggio VSM decrescente e applica tetti rigidi di diversità tematica (max 10 per genere, 3 per regista, 3 per filone narrativo).
   - I 14 film e le 18 serie in comune rappresentano i titoli ad alta notorietà condivisi; i restanti titoli del nuovo motore sono titoli a più alto merito qualitativo/VSM e maggiore varianza tematica.

### 5. Le suite di test eseguite (tutte verdi, eseguite singolarmente)
- `npx jest tests/candidateProvider.test.js --forceExit`: **9 passed**, 9 total (5.3s) — asserzioni non vacue, kids mode non vuota, tracciamento degrado e scoring VSM positivo
- `npx jest tests/poolHiddenGemsSwitch.test.js --forceExit`: **6 passed**, 6 total (4.4s) — switch ON/OFF, esecuzione vecchio motore, isolamento chiavi cache e invariante claimedIds
- `npx jest tests/heroCacheKeyNoVersion.test.js --forceExit`: **10 passed**, 10 total (1.2s)
- `npx jest tests/heroPoolAnimeExcludeCap.test.js --forceExit`: **1 passed**, 1 total (6.3s)
- `npx jest tests/graphClientPoolIntegration.test.js --forceExit`: **6 passed**, 6 total (1.1s)
- `npx jest tests/sliderWiringAndModulation.test.js --forceExit`: **10 passed**, 10 total (2.4s)
- `npx jest tests/domainSurface.test.js --forceExit`: **29 passed**, 29 total (1.7s)

Totale: 7 suite eseguite singolarmente, **71 test passati**, zero fallimenti.

### 6. Cosa abbiamo deliberatamente non fatto
- Non abbiamo toccato `src/engines/hybrid/catalogStrategies.js` (rispettato il vincolo: sola lettura).
- Non abbiamo modificato le altre 3 strategie hero (`true_blend`, `seed_network`, `trakt_filtered`).
- Non abbiamo toccato gli handler HTTP (`src/handlers/**`) né le rotte API (`src/api/**`).
- Non abbiamo toccato `services/**` né `frontend/**`.

### 7. Cosa serve alla prossima fetta
- Sostituzione della seconda strategia: `trakt_filtered` (o `seed_network`).
- Per `trakt_filtered`: isolare il client Trakt in `src/library/` (che possiede la cronologia) o `src/clients/trakt`, e alimentare la strategia attraverso `indice.candidati`.

## Verifica dell'integratore (18/10/2026) — fetta 1 accettata

**Cosa ho verificato eseguendo** (non leggendo il referto dell'agente):

| verifica | comando | esito |
|---|---|---|
| `mongoose`/`TasteProfile` fuori dall'indice | `grep -rn "mongoose\|TasteProfile" src/indice/*.js` | **solo 2 commenti** in `keywordIds.js` ✓ |
| kids mode non svuota più il catalogo | `indice.candidati({kidsMode:true,…})` | **72 candidati**, motivo dichiarato `taste_profile_non_disponibile` ✓ |
| chiave di cache distinta OFF/ON | `grep _hg src/cache/index.js` + `nuova_catena_hidden_gems` in `toHeroDesc`/`buildSharedHeroCacheKey` | suffisso `_hg` ✓ |
| **la misura ora è vera** | `node scripts/qa/probe-hidden-gems-jaccard.js` (committata, 7,7 KB) | **58/58 score non-zero**, media 4.46 — il VSM è acceso ✓ |
| i numeri | la sonda | film OFF 160 / ON 75, Jaccard **0.063**; serie OFF 160 / ON 58, **0.09** |
| suite toccate + intera | `npx jest` | **195 suite, 1971 test, zero rossi** ✓ |

**Nota sui numeri**: quelli della prima misura (98→77, Jaccard 0.087) **non sono confrontabili** con questi — venivano da una sonda improvvisata che girava **senza profilo di gusto**, quindi misurava un percorso che in produzione non esiste. Il riferimento d'ora in poi è **la sonda committata**.

**Il rilievo che vale più di tutti** (revisione di specifica): *un numero giusto con una spiegazione sbagliata è peggio di un numero sbagliato*, perché la spiegazione è ciò che convince. Terza volta in un giorno con questa forma.

**Prossima fetta**: `trakt_filtered` (o `seed_network`) — richiede l'isolamento dell'ingestione Trakt in `src/library/`. Poi `true_blend` (il cuore). Poi il pool svuotato e il serving.

## Come si fa la PARTE 2 (il piano, scritto qui perché non viva in chat)

### Dove siamo

La **fetta 1** ha consegnato: la porta `indice.candidati(contesto, opzioni)` (candidati *spiegati*
`{id, motivo, punteggio}`, non solleva mai, degrada dichiarando in `motivi[]`) e **`hidden_gems`** dietro
`FLAG_NUOVA_CATENA_HIDDEN_GEMS` (OFF = vecchio motore, verificato). La sonda
`scripts/qa/probe-hidden-gems-jaccard.js` è il riferimento dei numeri.

### Le tre strategie che restano (in ordine di difficoltà crescente)

| strategia | cosa fa oggi (vecchio) | cosa serve per rifarla | difficoltà |
|---|---|---|---|
| **`trakt_filtered`** | scarica le raccomandazioni Trakt dell'utente (`fetchTraktRecommendationsRawDetailed`) e le filtra/ordina col DNA | una **porta** `raccomandazioniTrakt(userId)` dove vivono le credenziali: `src/clients/trakt.js` (ha già refresh, 33 test) o `src/library/`. I token sono il blocco `trakt` unificato (ticket 26) ✓. Poi: ordinare per affinità VSM + caps | **media** — l'ingestione Trakt è il pezzo da spostare |
| **`seed_network`** | espande i semi (`collectRealSeeds`), aggiunge suggerimenti Trakt e similarità DuckDB (`similar_to`), calcola lo score ibrido VSM+similarità | semi: `src/library/semiDi` ✓ esiste. Vicini: il servizio del grafo (`POST /raccomanda` con `semi`) **o** `similar_to` su DuckDB. Lo score: `ProfileScorer` ✓ | **media-alta** — è l'espansione, e va deciso *chi* propone i vicini |
| **`true_blend`** | generi dominanti dal profilo → query DuckDB per genere → match VSM → quote di diversità (max 3/genere, 1/regista, 2/famiglia) | è il **cuore**: candidati dai generi dominanti (`compiler` ✓), match VSM ✓, e le quote (`ProfileScorer.applyDiversityCaps` ✓ — il nuovo fornitore le usa già) | **alta**, ma è quello con più pezzi già in piedi |

### I due pezzi di sistema

4. **Il pool si svuota**: tolte le chiamate a `dataFetchers`/`catalogStrategies`, `pool/index.js` resta il
   **compositore** — invariante `claimedIds`, ordine delle righe, cache, paginazione. È lì che la sostituzione si
   chiude, e lì che si vede (o no) il guadagno: **-3.169 righe**.
5. **Il serving**: `catalogHandler` (1.037) + `metaHandler` (680) sui moduli nuovi — le rotte Stremio smettono di
   passare dal vecchio stack. **La prova è il protocollo**: le suite `tests/stremio*.test.js` devono passare
   **identiche** (esistono già).

### E alla fine

6. **La cancellazione**: `git rm` delle 5.098 righe del vecchio stack, e la decisione sui **57 file di test** che le
   esercitano (ripuntati ai moduli nuovi o morti con loro).

### Le regole per OGNI fetta (il pattern che ha funzionato)

- **Una strategia alla volta, dietro interruttore**, con **OFF = comportamento di oggi**. Nessuna fetta spedisce.
- **La chiave di cache deve portare lo switch** (trappola pagata il 17/10: senza, si serve il vecchio motore per 7
  giorni).
- **La prova è una misura** (conteggio + Jaccard, e `oro_preso` quando il metro del ticket 45 sarà pronto) — e la
  sonda va **committata**, se no la misura vive nella prosa.
- **Un test che fallirebbe se lo switch fosse ignorato** (il buco trovato dalla review nella fetta 1).
- **Non toccare il vecchio motore**: la duplicazione è **temporanea** e va **dichiarata** (chi è la fonte di verità).
- **Revisione indipendente dopo ogni fetta** (due revisori, assi diversi: standard e specifica) — nella fetta 1 ha
  trovato 9 difetti, di cui due bug veri, che nessun test aveva visto.

### ⚠️ Un rilievo della review rimasto aperto (trovato ora)

`buildHiddenGemsOnNewProvider` **ha** il ripiego (se il fornitore torna vuoto usa `fetchHiddenGemsFallbackIds`) ma
**non è avvolto in `runPoolBuilder`**: se una qualunque parte solleva, l'errore risale al `Promise.all` delle
strategie e può far cadere **tutto il pool** invece di degradare. La porta non solleva ✓ (contratto rispettato),
quindi il rischio pratico è basso — ma la parità col percorso OFF va chiusa, ed è la prima cosa da fare nella
parte 2.

---

# RE-TRIAGE (18/10/2026) — cosa resta, dopo che il 46 ha cambiato lo scopo

Il piano «PARTE 2» qui sopra (tre strategie da **reimplementare**) è **superato**: la decisione 26 ha deciso di
**rimuoverle**, e il ticket 46 le ha rimosse (`catalogStrategies.js` −1.598 righe, i cataloghi hero sostituiti da
`nicchia_di_qualita` e `uscite_nuove` del grafo). La prova che funziona: `tests/feedProtocolAndCatalogs.test.js`
(8 cataloghi, titoli > 0) e la sonda `probe-hidden-gems-jaccard.js`.

## Cosa resta, misurato (non stimato)

| file | righe | chi lo chiama oggi | cosa fa | destinazione |
|---|---|---|---|---|
| `src/handlers/catalogHandler.js` | **1.037** | `api/catalog`, `api/configurazione`, `api/stremio` | il **serving** del catalogo Stremio: definizione, chiave di cache, `CatalogRouter`, badge (airing, ita), kids, formattazione, paginazione | moduli, con **una sola invocazione** (decisione 27) |
| `src/handlers/metaHandler.js` | **680** | `api/stremio` | il **serving** del meta Stremio: dettagli, episodi, id IMDb (dump + traduzione), kitsu, anime | moduli |
| `src/pool/index.js` | **539** | `engines/hybridRecommendations` | il **compositore** delle righe: priorità, `claimedIds`, chiave di cache condivisa | **resta** (decisione 26) — ma i suoi ingressi cambiano |
| `src/engines/hybridRecommendations.js` | **512** | `catalog/providers/{HybridProvider,AiDiscoveryProvider}` | la **facciata del gusto**: contesto, staleness, pool, idratazione, paginazione | si **divide**: profilo/libreria/cache/indice |
| `src/engines/hybrid/dataFetchers.js` | **279** | `hybridRecommendations`, `pool` | **estrazione dei fatti** (contesto del profilo, storia e voti Trakt, sync) | **si tiene** (decisione 26): va in `library`/`profile` |
| `src/engines/hybrid/scoringEngine.js` | **134** | `hybridRecommendations` | punteggio ibrido di co-occorrenza, top generi/keyword | da decidere: morto o a `profile` |
| `src/engines/profileStaleness.js` | **78** | `hybridRecommendations` | freschezza del profilo | `profile` |
| **totale** | **3.259** | | | |

E **33 file di test** li nominano (`catalogHandler` 19, `metaHandler` 14, `hybridRecommendations` 14,
`dataFetchers` 5, `scoringEngine` 4, `profileStaleness` 1) su **183 suite**.

## Le tre fette che restano

1. **La facciata del gusto** (`hybridRecommendations` 512 + `dataFetchers` 279 + `scoringEngine` 134 +
   `profileStaleness` 78 = **1.003 righe**): dividere ciò che è del profilo, della libreria, della cache e
   dell'indice. **Prova**: i conteggi delle righe hero prima/dopo, identici (le sonde esistono già).
2. **Il serving** (`catalogHandler` + `metaHandler` = **1.717 righe**): portarlo sui moduli, con **una sola
   invocazione** del motore (decisione 27). **Prova**: le suite `tests/stremio*.test.js` e i 33 test coinvolti
   devono passare **identici**, e il manifest byte-a-byte.
3. **La cancellazione**: `git rm` di ciò che resta senza consumatori, e la decisione sui test che muoiono con lui.

## La domanda che il 46 ha aperto: **il deploy aspetta ancora?**

La decisione scritta nel ticket 30 (*«niente push finché il 41 non è finito»*) è stata presa **prima** che il 26
cambiasse lo scopo del 41. Adesso il 41 che resta è **lavoro interno** (serving + cancellazione): non cambia il
feed, non cambia il contratto del motore, e non è un prerequisito per il deploy — è un prerequisito per
**cancellare** il vecchio stack.

Le due opzioni, dichiarate:
- **A. Deploy adesso** (dopo il ticket 47, che è un blocco vero): la produzione prende il refactor, i moduli, il
  grafo, i cataloghi nuovi. Il serving resta dov'è (funziona) e le tre fette si fanno dopo, su `main`, senza
  fretta. Costo: nessuno, se non che il vecchio stack resta in piedi ancora un po'.
- **B. Deploy dopo le tre fette**: un solo push con tutto, come deciso allora. Costo: `main` si allontana ancora
  dalla produzione (oggi **135 commit**), e ogni fetta in più è rischio accumulato su un deploy mai provato.

**Raccomandazione: A.** Il motivo è la misura, non il gusto: il distacco fra `main` e produzione è già il più
grande che questa mappa abbia mai avuto, e un deploy mai provato che cresce è il modo di rendere impossibile
attribuire un guasto. Le tre fette non toccano il feed, quindi non hanno fretta — e si fanno **dopo**, con la
produzione allineata e i numeri veri in mano.
