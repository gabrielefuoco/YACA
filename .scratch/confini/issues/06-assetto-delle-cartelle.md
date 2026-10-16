Status: resolved
Type: grilling
Blocked by: 04

# 06 — L'assetto delle cartelle: dove va cosa

**Deciso il 17/10/2026 in grilling; l'applicazione è ancora da fare, ed è di questo ticket** (i `git mv` e le
rinomine sono meccanici). Le decisioni stanno in `## Esito`, e sono la decisione 13 della mappa: chi prende
questo ticket non ri-decide, applica.

> **Precisazioni dell'inventario (04), 17/10/2026.** I file di `scripts/` sono **48 tracciati**, ma quelli
> senza chiamante funzionale sono **19** e **12 di questi non sono nominati in nessun altro posto della repo**;
> **nessuno** è citato da CI, `Dockerfile` o `docker-compose`; l'automazione ne tocca 2 (via i timer di
> `ops/`) più 1 da una rotta admin. E c'è un vincolo che ribalta il «si può rimuovere tutto»:
> **`scripts/erdb-builder/build.js` è importato da 4 file di prodotto** — è una dipendenza vera, non uno
> script.

## Perché

Oggi la stessa parola significa due cose: `graph/` è il modulo Python del motore **nuovo** (bolle), mentre
`src/engines/graph/HierarchicalGraph.js` + `src/data/hierarchical_graph.json` sono il grafo delle **keyword**
del vecchio stack. Il primo sta alla root accanto a `src/`, il secondo dentro `src/`. In mezzo: `services/`
(che oggi contiene `anime-source` e `doppiaggi-source`, cioè *servizi*, con la loro immagine), `scripts/`
(48 file tracciati), `offline_graph_builder/` (1,5 GB, 46.160 file, con `venv/` e `cache/`), `ops/` (35 file),
`todo/` (9 md), `public/`, `tests/` (185 file).

Senza un assetto dichiarato, ogni ticket di questa mappa sposta i file dove capita — e il prossimo li sposta
di nuovo.

## La domanda

Qual è l'albero di destinazione di YACA, e qual è **la regola** che dice dove va un file nuovo?

## Cosa deve uscire

- L'albero di destinazione, con la regola per ciascuna cartella (una riga: *cosa possiede*).
- La decisione su `graph/`: **`services/` è il posto giusto?** Attenzione: `services/` oggi contiene servizi
  con immagine propria e `Dockerfile`; il modulo Python è un servizio solo dopo il ticket 07, ed è anche una
  pipeline offline (`python -m graph.pipeline esporta`, `parita`, `build`) e un archivio di misure
  (`measure/`, 19 arbitri vivi + `legacy/`). Se ci va, con quale nome — e il nome deve dire *cosa fa*, non
  *come è fatto* (è il motivo per cui `graph` va rinominato: vedi sotto).
- La decisione sulla **rinomina del grafo delle keyword**: `src/engines/graph/` non può chiamarsi così mentre
  `graph/` è il motore nuovo. Il nome nuovo deve dire che è una **gerarchia di keyword** (non «graph», non
  «DNA»): è il candidato `keywords` o `keywordGraph`, da scegliere guardando cosa contiene davvero.
- La decisione su `scripts/` (che l'utente sospetta si possa rimuovere tutta — l'inventario del 04 dice che i
  file senza chiamante sono **19**, che **12** non sono nominati da nessuno e che **`erdb-builder/build.js`
  non è uno script ma una dipendenza**: va portato fra i moduli, non cancellato), su `offline_graph_builder/`
  (la fabbrica del vecchio grafo delle keyword: se il vecchio stack resta, resta anche lei — ma 1,5 GB di cui
  `venv/` e `cache/` non vanno tracciati), e su `todo/` (9 md).
- **Come si applica senza rompere il deploy**: la CI costruisce da `Dockerfile`, il `.dockerignore` esclude
  `node_modules`, `graph/data`, `.cache`, `tests`, `docs`; un `COPY` che punta a una cartella spostata rompe
  la build **e il deploy automatico la porta in produzione**. Ogni spostamento va fatto con la build verde.

## Il confine da non superare

Questa mappa non rinomina il prodotto e non inventa una gerarchia nuova per gusto: l'assetto serve a far
**vedere** i confini decisi negli altri ticket (01–03), non a essere bello.

## Come si verifica

L'assetto è deciso quando si può rispondere, per ognuna delle cartelle di oggi, **dove va e chi la possiede** —
e quando la regola è abbastanza precisa da decidere un caso nuovo senza chiedere. L'applicazione la fanno 12
e i ticket che già toccano quei file; se resta un residuo, questo ticket lo applica direttamente.

---

## Esito

**Tre decisioni prese il 17/10/2026 in grilling, più il contesto dell'inventario (04).**

Il contesto, in due righe: i file di `scripts/` sono **48** tracciati, ma **19** non hanno un chiamante
funzionale fuori dalla memoria del lavoro e **nessuno** è citato da CI, `Dockerfile` o `docker-compose`;
`scripts/erdb-builder/build.js` è **importato da 4 file di prodotto** — è una dipendenza, non uno script.

### La regola

**Una cartella = un possessore, e il nome dice *cosa possiede*, non *come è fatto*.** Con una conseguenza
operativa che si porta dietro tutto il resto: **se non è prodotto né memoria, non esiste** — per questo i 19
script si cancellano invece di essere parcheggiati in una cartella che nessuno guarda.

### 1. L'albero

```
index.js · package.json · Dockerfile · docker-compose.yml · start.sh · README.md
src/            il prodotto, per dominio (api · catalog · profile · library · pool · engines/…)
frontend/       il client
public/         gli asset
services/       chi ha un ciclo di vita suo
  anime-source/       (immagine propria)
  doppiaggi-source/   (immagine propria)
  graph/              il modulo Python — pipeline oggi, servizio dal 07
  keyword-graph/      la fabbrica di hierarchical_graph.json
ops/            il lato ospite: unità systemd, timer, shell
tests/ · docs/ · .scratch/
```

- **`graph/` → `services/graph/`, senza rinominare il pacchetto.** `python -m graph.pipeline esporta` resta
  identico, gli **83** import interni non si toccano, e il modulo con 39 ticket e il fixture di parità non
  corre nessun rischio. Motivo: una rinomina del pacchetto si paga in 83 import + i comandi citati in
  `src/engines/bolle/Bolle.js`, `tests/bolleParity.test.js`, i README e i docs + il clone sul mate
  (`/srv/yaca/modulo/`) — e la paga un modulo che funziona, per un nome.
- **`src/engines/graph/` → `src/engines/keywords/`.** Quello **non è un grafo di raccomandazioni**: è una
  gerarchia di keyword (`hierarchical_graph.json`). È il conflitto vero fra i due `graph`, e si risolve con
  un `git mv`.
- **`offline_graph_builder/` → `services/keyword-graph/`** (la fabbrica sta con ciò che produce), con `venv/`
  e `cache/` fuori da git (già lo sono) e fuori dall'immagine.
- **`todo/` → `docs/TODO.md`** (o `docs/todo/*.md`): è un backlog, e i documenti del prodotto stanno in
  `docs/`.

### 2. I 19 script: cancellati, con la storia scritta

I 14 fra migrazioni, riparazioni e misure one-off (quasi tutti del 05/10) e i 5 tool della campagna QC
(`qa/dedup-real-library`, `qa/hero-enrich`, `qa/keyword-bench`, `qa/qc-aggregate`, `qa/verify-solo-anime`)
**escono dalla repo**. Ma la cancellazione è accompagnata da una riga ciascuno in un md (`ops/README.md` o
`docs/storico-script.md`): **cosa faceva, quando, e lo sha del commit da cui si recupera**
(`git show <sha>:scripts/<file>`).

Questo è il punto che il proprietario ha scelto accettando il rischio dichiarato: per **13 su 14** non c'è
prova che la migrazione fosse già stata eseguita (per uno solo, `seed_learned_names.js`, è scritto nel suo
header). La riga di storia con lo sha è la mitigazione — e chi cancella, **prima** controlla la data
sull'oggetto o sui dati, come il report avverte.

**`erdb-builder` non è fra i 19** e non si cancella: è importato da `src/api/staticPosters.js:7`,
`src/cache/posterDaEvento.js:21`, `src/catalog/formatters/StremioFormatter.js:9`,
`src/utils/libraryPosterRefresh.js:35`. Il suo **codice diventa un modulo del prodotto** (il percorso lo dà la
regola: `src/erdb/`), e resta un ingresso a riga di comando sottile per il dump offline.

### 3. `.dockerignore`: fuori il modulo e la fabbrica, **dentro** gli script

Il contesto di build oggi include `graph/` (667 MB in locale) e `offline_graph_builder/` (1,5 GB): l'immagine
dell'app non li usa — il modulo avrà la sua immagine dal ticket 07, la fabbrica è offline. **`scripts/` invece
resta**, e non per prudenza: il fatto è verificato — `ops/yaca-poster-eventi.service:32` esegue
`docker exec --workdir /app … yaca-app node scripts/drena-coda-poster.js`, e `src/api/admin.js:74` esegue
`scripts/analyze_presets.js` **dentro** il contenitore. Escluderli romperebbe un timer e una rotta admin: il
tipo di guasto che si scopre tre giorni dopo.

### L'applicazione

È di **questo** ticket — i `git mv` e le rinomine sono meccanici, e il ticket resta aperto finché non sono
fatti — con tre collisioni dichiarate: il ticket **07** (il modulo diventa un servizio: `Dockerfile`, compose
e volumi), i ticket **15/16** (i modelli della libreria) e il **05** (gli stessi file della root). Chi prende
l'uno o l'altro lo scrive nel ticket prima di toccare i file condivisi.

**L'ordine consigliato**: i `git mv` del modulo e delle keyword per primi (sono i due che cambiano i percorsi
citati altrove), poi le cancellazioni degli script, poi `.dockerignore`. E la build della CI verde dopo ogni
passo: il deploy è automatico su `main`, e un `COPY` che punta a una cartella spostata rompe l'immagine.

### Cosa resta aperto

- **Dove vive `hierarchical_graph.json`** (1 MB tracciato, letto da un `require` dinamico in
  `src/engines/keywords/HierarchicalGraph.js:18-20`): con la fabbrica in `services/keyword-graph/` o nel
  prodotto? È la stessa domanda del ticket 09 per gli artefatti, e la risposta deve essere la stessa.
- **`scripts/extracted_nsfw_keywords.json`** (3.814 byte, citato **solo** da `todo/3_kids_filter_and_nsfw.md`):
  o si cancella con gli altri, o si sposta accanto alla nota che lo usa — è l'input di un lavoro non iniziato,
  e deciderlo è di chi prende questo ticket.
- **I modelli in due cartelle** (`src/models/` e `src/db/models/`) e `TasteProfile`: con `library/` e
  `profile/` nel prodotto, la regola dell'albero li separa — ma il `git mv` lo fa il ticket 15.

---

## Emendamenti — revisione esterna del 17/10/2026 (verificati sul codice)

### 1. Lo spostamento del modulo rompe `python -m graph.pipeline` (e si evita così)

**Verificato**: `graph/pipeline.py` usa percorsi **relativi alla CWD** — `json.load(open("src/data/bolle.json"))`
(riga 495), il default `--fuori src/data/bolle.json` (riga 808), i pattern di `graph/data/` (righe 632-634).
Quindi:

- con `graph/` in `services/graph/`, `python -m graph.pipeline` lanciato **dalla root** muore
  (`ModuleNotFoundError: No module named 'graph'`) — il pacchetto non è più in `.`;
- lanciato **da `services/`** funziona il pacchetto ma **rompono tutti i percorsi** `src/…` cablati.

Soluzione da applicare **in questo ticket**: `PYTHONPATH=services` (e `pythonpath = ["services"]` in
`pyproject.toml`/`pytest.ini` per `pytest`) **e si continua a lanciare dalla root** — così i percorsi
`src/data/bolle.json` restano veri. Più un controllo: i riferimenti a `graph/data/` devono passare per
`Path(__file__).resolve().parent`, non per la CWD.

### 2. Sul mate si sposta **anche** il dato (138 MB non tracciati)

`/srv/yaca/modulo/graph/data/` è 138 MB **fuori da git**: dopo il `git mv` del codice, al primo `git pull`
codice e dati si trovano in due posti diversi. Va spostata anche la cartella
(`mv /srv/yaca/modulo/graph/data /srv/yaca/modulo/services/graph/data`) — è l'unica parte dell'assetto che
non si vede in un checkout.

### 3. `erdb-builder` ha un chiamante fuori da `src/`

**Verificato**: `ops/erdb-legion/costruisci.js:34` richiede `../../scripts/erdb-builder/build.js` (oltre ai 4
file di prodotto). Promuovere il modulo significa aggiornare anche quello — o lasciare uno **shim di
re-export** al vecchio percorso.

### 4. L'ordine: il `git mv` del modulo **prima** del ticket 07

Il 07 scrive `Dockerfile`, entrypoint, test e percorsi del modulo: se nasce con `graph/` alla root e poi il 06
lo sposta, il lavoro del 07 va rifatto. Quindi: **questo ticket applica lo spostamento per primo**, e il 07
nasce dentro `services/graph/`. (La collisione era dichiarata qui; ora è risolta in una direzione.)

---

## Esito dell'applicazione (17/10/2026)

L'assetto è stato interamente applicato e verificato nel worktree.

### 1. Spostamenti e Rinomine
- **`graph/` → `services/graph/`** (47 file spostati): il pacchetto conserva il nome `graph`. Creato `pytest.ini` (`pythonpath = services`), aggiornato `services/graph/canon.py` (`ROOT = pathlib.Path(__file__).resolve().parents[2]`, `DATA = pathlib.Path(__file__).resolve().parent / "data"`), `pipeline.py` (scrittura bolle.json relativa a root, cwd in esecuzione su K.ROOT), `spazi-trakt.py` e il test `tests/test_graph_pipeline.py`.
- **`src/engines/graph/` → `src/engines/keywords/`** (1 file spostato): `HierarchicalGraph.js` risiede ora sotto `src/engines/keywords/`.
- **`offline_graph_builder/` → `services/keyword-graph/`** (3 file spostati). Aggiornato `.gitignore` con le regole per `services/keyword-graph/{venv, cache, .env, __pycache__}`.
- **`todo/` → `docs/todo/`** (9 file spostati). Spostato inoltre `scripts/extracted_nsfw_keywords.json` in `docs/todo/extracted_nsfw_keywords.json` accanto alla relativa nota.
- **Promozione `scripts/erdb-builder/` → `src/erdb/`**: creato `src/erdb/build.js` e `src/erdb/index.js`, mantenuto `scripts/erdb-builder/build.js` come thin CLI wrapper / re-export shim per retrocompatibilità.

### 2. Cancellazioni e Storico Script
- **19 script eliminati** con `git rm` (14 migrazioni/riparazioni one-off + 5 tool campagna QC).
- Scritto il documento di tracciamento e recupero in [`docs/storico-script.md`](../../docs/storico-script.md) con SHA di commit, data, descrizione dell'attività e stato di prova dell'esecuzione.

### 3. Aggiornamento Import e Chiamanti (Conteggi)
- **Import di `HierarchicalGraph` aggiornati (5 moduli di prodotto/codice + 8 file di test + 1 doc)**:
  - `src/engines/hybrid/catalogStrategies.js:56`
  - `src/dna/dnaEngine.js:26` (e commento riga 16)
  - `src/profile/ProfileScorer.js:187, 363, 477`
  - `src/db/duckDbStore.js:413`
  - `docs/ALGORITHMS.md:231`
  - Suite di test: `tests/dnaKeywordIdentity.test.js`, `tests/diag.recommender.h1.lightMeta.test.js`, `tests/diag.recommender.h8.determinism.test.js`, `tests/characterization/dnaCharacterization.test.js`, `tests/characterization/dnaEngineExtraction.test.js`, `tests/duckDbAndMatchmaker.test.js`, `tests/heroAnimeFavoredSeam.test.js`, `tests/heroAnimeTypeSelectors.test.js`, `tests/ticket15.dnaFixes.test.js`.
- **Import di `erdb` aggiornati (4 moduli di prodotto + 1 script ops)**:
  - `src/api/staticPosters.js:7`
  - `src/cache/posterDaEvento.js:21`
  - `src/catalog/formatters/StremioFormatter.js:9`
  - `src/utils/libraryPosterRefresh.js:35`
  - `ops/erdb-legion/costruisci.js:34`

### 4. `.dockerignore`
- Esclusi `services/graph/` e `services/keyword-graph/` dall'immagine Docker dell'applicazione.
- Mantenuto `scripts/` nel build context (verificato per i servizi e timer di `ops/`).

### 5. Verifiche Eseguite
- **Require check individuali**:
  - `node -e "require('./src/engines/keywords/HierarchicalGraph')"` -> OK
  - `node -e "require('./src/dna/dnaEngine')"` -> OK
  - `node -e "require('./src/profile/ProfileScorer')"` -> OK
  - `node -e "require('./src/db/duckDbStore')"` -> OK
  - `node -e "require('./src/engines/hybrid/catalogStrategies'); process.exit(0)"` -> OK
  - `node -e "require('./src/erdb/build')"` -> OK
  - `node -e "require('./src/erdb')"` -> OK
  - `node -e "require('./scripts/erdb-builder/build')"` -> OK
  - `node -e "require('./src/api/staticPosters')"` -> OK
  - `node -e "require('./src/cache/posterDaEvento')"` -> OK
  - `node -e "require('./src/catalog/formatters/StremioFormatter')"` -> OK
  - `node -e "require('./src/utils/libraryPosterRefresh')"` -> OK
- **Test mirati Jest (un file alla volta)**:
  - `npx jest tests/erdbBuilder.test.js` -> 27 passed (0.96s)
  - `npx jest tests/posterNameConcordance.test.js` -> 9 passed (0.79s)
  - `npx jest tests/erdbList.test.js` -> 23 passed (4.20s)
  - `npx jest tests/dnaKeywordIdentity.test.js` -> 13 passed (0.73s)
  - `npx jest tests/diag.recommender.h1.lightMeta.test.js` -> 2 passed (1.04s)
  - `npx jest tests/diag.recommender.h8.determinism.test.js` -> 2 passed (0.49s)
  - `npx jest tests/characterization/dnaCharacterization.test.js` -> 40 passed (0.69s)
  - `npx jest tests/characterization/dnaEngineExtraction.test.js` -> 7 passed (1.30s)
  - `npx jest tests/heroAnimeFavoredSeam.test.js` -> 9 passed (0.96s)
  - `npx jest tests/heroAnimeTypeSelectors.test.js` -> 8 passed (6.40s)
  - `npx jest tests/ticket15.dnaFixes.test.js` -> 20 passed (0.59s)
- **Verifica Python del modulo graph**:
  - `PYTHONPATH=services py -m graph.pipeline --help` -> OK (exit code 0)
  - `PYTHONPATH=services py -m graph.pipeline ricetta` -> OK (exit code 0)
  - `PYTHONPATH=services py -m graph.pipeline pesanti` -> OK (exit code 0)
  - `py -m pytest tests/test_graph_pipeline.py -k "test_ppr_riproduce_le_varianti_degli_arbitri"` -> OK
  - `py -m pytest tests/test_graph_pipeline.py -k "test_il_ciclo_non_e_duplicato_da_nessuna_parte"` -> OK
  - `py -m pytest tests/test_graph_pipeline.py -k "test_il_dag_vero_e_in_ordine_topologico"` -> OK

### 6. Passaggi rimanenti sul Mate (Produzione)
Sul server host (`mate`):
1. **Spostamento dei dati non tracciati**: spostare la cartella da 138 MB dei dati di calcolo:
   ```bash
   mv /srv/yaca/modulo/graph/data /srv/yaca/modulo/services/graph/data
   ```
2. **Ambiente e PYTHONPATH**: nei comandi manuali o cron che invocano la pipeline dalla radice del repo, assicurarsi di esportare `PYTHONPATH=services` (es. `PYTHONPATH=services python -m graph.pipeline ...`).

