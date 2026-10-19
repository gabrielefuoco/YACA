Status: resolved
Type: task

# 58 — `keyword-graph` e `doppiaggi-source`: o si completano, o si ritirano

## Perché

Esistono come **codice**, ma non sono **servizi**: nessuno dei due è nel `docker-compose.yml`, nessuno ha un
workflow, nessuno gira. Verificato il 19/10/2026:

| | nel compose | workflow | stato |
|---|---|---|---|
| `services/keyword-graph` | **NO** | **NO** | `README.md`, `build_graph.py`, `requirements.txt` — nessun Dockerfile |
| `services/doppiaggi-source` | **NO** | **NO** | `README.md`, `cli.js`, `src/` — nessun Dockerfile |

Due cartelle che sembrano servizi e non lo sono è **peggio di non averle**: chi legge `services/` crede che girino,
e chi cerca il produttore di un artefatto lo cerca lì.

Nota: il **doppiaggi** ha un timer attivo sul mate (`yaca-doppiaggi.timer`, verificato: prossimo giro alle 16:00) —
quindi *qualcosa* produce i doppiaggi, ma non è questa cartella: il timer chiama un percorso dell'app. Va capito
quale, e se questa cartella è un residuo o un lavoro interrotto.

## Cosa c'è da decidere (triage)

1. **Per ognuno dei due**: si **completa** (Dockerfile, servizio nel compose, workflow, contratto dell'artefatto)
   o si **ritira** (`git rm`, e la documentazione che lo nomina si aggiorna)?
2. **Chi produce l'artefatto oggi**: per i doppiaggi, `yaca-doppiaggi.timer` → quale comando esegue? È dentro
   l'app o in questa cartella?
3. **`keyword-graph`**: serve ancora? L'indice DuckDB e il grafo gerarchico (`hierarchical_graph.json`) coprono
   il suo lavoro? (Attenzione: l'app carica **anche** un proprio `hierarchical_graph.json` da 1,0 MB dentro
   l'immagine — decisione 32, «una copia da uccidere».)

## La prova

- Per il **ritiro**: `git rm` della cartella, `git grep` che non la nomini più, e nessun timer/workflow che la
  chiami.
- Per il **completamento**: il servizio nel compose con `mem_limit` e healthcheck, un workflow che pubblica
  l'immagine, e l'artefatto **con una versione** (decisione 32: i volumi come interfaccia sono il difetto).

## Note

- Nasce da un brainstorming: **va triato** prima di essere eseguibile.
- Il criterio è la decisione 32: si completa **solo** se ha un profilo di risorse diverso da chi lo userebbe —
  se è «un pezzo di logica in più», si ritira.

## Triage (19/10/2026) — la tabella del ticket ha una riga sbagliata

**`doppiaggi-source` NON è morto: gira, e produce un artefatto che l'app legge.**

- Il timer sul mate è **attivo**: `yaca-doppiaggi.timer`, cadenza 04:00 e 16:00 (verificato: ultimo giro 11h fa,
  prossimo alle 16:00).
- Il timer esegue `ops/yaca-doppiaggi.sh`, che punta a `SERVICE_DIR="${BASE_DIR}/services/doppiaggi-source"` e
  lancia la sua `cli.js` — una CLI vera, con `--dry-run`, `--health-check`, `--mongo-uri`.
- L'output è `ita_annotations.jsonl`, e **l'app lo legge**: `src/catalog/itaAnnotations.js:31`.

Quindi non è «una cartella che sembra un servizio e non lo è»: è un **produttore pilotato dall'host**, come il
drenatore dei poster. Il difetto vero è che questa forma non è **scritta da nessuna parte** — chi legge
`services/` non sa che quel servizio si esegue da un timer di sistema, e chi guarda il compose non lo vede.
Da decidere: si **dichiara** (una riga nel README del servizio + la regola nel `docs/` del server, come per il
drenatore), o si **containerizza** (Dockerfile + servizio + workflow) — con l'avvertenza che un container che gira
due volte al giorno è un `docker run` da timer, non un servizio always-on.

**`keyword-graph` NON è orfano — e la prima stesura di questo triage diceva il falso.**

Un `grep -rn "keyword-graph"` su tutto il repo non trova **niente**: nessuno nomina la cartella. Da lì avevo
concluso «codice che nessuno raggiunge, si ritira». **Sbagliato**: il collegamento non è il nome della cartella,
è l'**output**.

`services/keyword-graph/build_graph.py:520` scrive **`../src/data/hierarchical_graph.json`** — cioè **il grafo
gerarchico**: quello che l'app carica in `src/indice/HierarchicalGraph.js` (1,0 MB dentro l'immagine) e che
`services/graph/upstream/spazi-trakt.py:128` legge come input. **È il produttore di un artefatto vivo, caricato
da due consumatori.**

**Il difetto vero è il README, che mente.** Dice: *«Il risultato finale sarà generato in `../src/data/graph_data.json`»*
e descrive tre chiavi (`keyword_to_cluster`, `cluster_adjacency`, `cluster_members`) che non esistono più.
`graph_data.json` **è stato committato e poi cancellato** il 23/07/2026 da `482fa3d` («clean unused files»), e
nessuno lo legge. Lo script ha **due** output: il primo stadio (riga 18) e quello finale (riga 520), e il README
documenta solo il primo, morto.

**Conclusione: si tiene, e si corregge la documentazione.** `keyword-graph` non è un servizio e non deve
diventarlo — è un **costruttore offline** con requisiti suoi (Python 3.10, ~1 GB di VRAM per gli embedding,
`BAAI/bge-small-en-v1.5`, clustering Leiden), esattamente come `scripts/erdb-builder` lo è per i poster. Non
sta nel compose **giustamente**. Va però detto: che produce `hierarchical_graph.json`, che va rilanciato a mano
quando quel file cambia, e che il suo README va riportato al vero.

**Sul `hierarchical_graph.json` (la «copia da uccidere»)**: nel repo ce n'è **una sola**, `src/data/`, 1,0 MB,
dentro l'immagine dell'app. Il secondo consumatore è il **grafo**: `services/graph/upstream/spazi-trakt.py:128`
la legge da `ROOT/src/data/`. Quindi non sono due copie divergenti: è **un file di dati condiviso che vive
nell'albero dell'app** ed è usato anche da un altro servizio. Da decidere dove sta il posto giusto (accanto
all'artefatto del grafo, o dove sta ora con un contratto che lo dichiara).

## Decisioni del triage (19/10/2026)

- **`keyword-graph`: si tiene.** È il produttore di `hierarchical_graph.json`; il README va corretto (dichiara un
  output cancellato) e il servizio va dichiarato come **costruttore offline**, non come servizio da containerizzare.
- **`doppiaggi-source`: si tiene e si dichiara.** Gira da un timer di sistema dell'host due volte al giorno e
  produce `ita_annotations.jsonl`, che l'app legge. Non si containerizza: si scrive nel suo README e nella
  documentazione del server che è un **produttore pilotato dall'host**, come il drenatore dei poster.

**La lezione, che vale oltre questo ticket**: *«nessuno lo nomina» non vuol dire «nessuno lo usa»*. Un `grep` sul
**nome** di una cartella non vede chi consuma ciò che la cartella **produce**. La prossima volta si cerca prima
l'output (`git log --all -- <file>`, e chi lo legge) e poi si conclude.

**Sul `hierarchical_graph.json` (la «copia da uccidere»)**: nel repo ce n'è **una sola**, `src/data/`, 1,0 MB,
dentro l'immagine dell'app. Il secondo consumatore è il **grafo**: `services/graph/upstream/spazi-trakt.py:128`
la legge da `ROOT/src/data/`. Quindi non sono due copie divergenti: è **un file di dati condiviso che vive
nell'albero dell'app** ed è usato anche da un altro servizio. Da decidere dove sta il posto giusto (accanto
all'artefatto del grafo, o dove sta ora con un contratto che lo dichiara).

## Esito (19/10/2026)

Il ticket 58 è stato completato come intervento di **documentazione e verità architetturale** senza toccare il codice applicativo né eliminare componenti. Entrambi i moduli in `services/` sono stati mantenuti al loro posto e la loro reale natura è stata formalizzata:

### 1. Cosa è stato corretto

1. **`services/keyword-graph/README.md`**:
   - Chiarito che il modulo è un **costruttore offline manuale** (Python 3.10, ~1 GB VRAM, embeddings `BAAI/bge-small-en-v1.5`, clustering Leiden) e che **correttamente non fa parte di `docker-compose.yml` né possiede workflow CI/CD** (come `scripts/erdb-builder` per i poster).
   - Corretto l'output reale: produce `src/data/hierarchical_graph.json` (`build_graph.py:520`).
   - Dichiarato che il vecchio file `../src/data/graph_data.json` documentato storicamente è stato eliminato il 23/07/2026 da `482fa3d` e nessun componente lo legge.
   - Formalizzato il contratto dell'artefatto condiviso: `src/data/hierarchical_graph.json` vive nell'albero dei sorgenti dell'app (~1.0 MB) e ha due consumatori disaccoppiati (`src/indice/HierarchicalGraph.js` caricato in RAM all'avvio e `services/graph/upstream/spazi-trakt.py:128`).
2. **`services/doppiaggi-source/README.md`**:
   - Dichiarata l'architettura reale: è un **produttore pilotato dall'host** (Systemd Timer, non container Docker).
   - Documentato che il timer di sistema host `yaca-doppiaggi.timer` invoca `ops/yaca-doppiaggi.sh` due volte al giorno (04:00 e 16:00), il quale imposta `SERVICE_DIR="${BASE_DIR}/services/doppiaggi-source"`, rileva l'interprete Node dell'host (mise o sistema), gestisce `.cache/` ed esegue `cli.js`.
   - Spiegata la motivazione del mancato container: esecuzione batch di ~6 secondi a giro, accesso diretto al volume `yaca_tmdb`, risparmio di ~200 MB di RAM.
   - Documentato che `ita_annotations.jsonl` è consumato direttamente dall'app (`src/catalog/itaAnnotations.js:31`) e che il diff alimenta la coda Redis per il drenatore dei poster.
3. **`docs/DEPLOYMENT_HOME_SERVER.md`**:
   - Aggiunta la sezione `1.1 Job Batch e Produttori Schedulati da Systemd Timer` documentando la strategia di esecuzione a zero RAM permanente per `yaca-doppiaggi.timer`, `yaca-poster-eventi.timer` e `yaca-backup.timer`.
   - Aggiunta la sezione `1.2 Costruttori Offline e Contratti Dati Condivisi` documentando `services/keyword-graph` e il contratto condiviso di `src/data/hierarchical_graph.json`.
   - Aggiunta la sezione `7.3 Installazione dei Timer Systemd Periodici (Doppiaggi ITA e Drenatore Poster)` con i comandi di installazione e verifica delle unit di sistema.
4. **`docs/INDEX.md`**:
   - Registrato `src/data/hierarchical_graph.json` tra gli artefatti di produzione (`## 📦 Artefatti di Produzione e Stato`), evidenziando i due consumatori (app core e servizio grafo).

### 2. Comandi eseguiti come prova di ciascuna affermazione

- **(a) `build_graph.py` scrive `hierarchical_graph.json`**:
  ```bash
  $ git grep -n "hierarchical_graph.json" services/keyword-graph/
  services/keyword-graph/build_graph.py:520:    OUTPUT_JSON = '../src/data/hierarchical_graph.json'
  ```

- **(b) `HierarchicalGraph.js` e `spazi-trakt.py` leggono `hierarchical_graph.json`**:
  ```bash
  $ git grep -n "hierarchical_graph.json" src/ services/
  services/graph/upstream/spazi-trakt.py:128:G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
  services/keyword-graph/build_graph.py:520:    OUTPUT_JSON = '../src/data/hierarchical_graph.json'
  src/indice/HierarchicalGraph.js:18:            const dataPath = path.join(__dirname, '../data/hierarchical_graph.json');
  src/indice/HierarchicalGraph.js:24:                console.warn('[HierarchicalGraph] File hierarchical_graph.json non trovato. Grafo non disponibile.');
  src/indice/keywordIds.js:28:// PERCHÉ ESISTE. Il grafo gerarchico (`hierarchical_graph.json`) è indicizzato
  ```

- **(c) `graph_data.json` non esiste ed è stato eliminato dal commit `482fa3d`**:
  ```bash
  $ git log --oneline --all -- src/data/graph_data.json
  482fa3d refactor(architecture): clean unused files, optimize DuckDB catalog routing, and add LRU memoization to keyword vectorizer
  dd6687a feat(graph): offline graph builder with VSM visualizer, keyword graph pipeline

  $ Test-Path src/data/graph_data.json
  False
  ```

- **(d) `ops/yaca-doppiaggi.sh` punta a `services/doppiaggi-source`**:
  ```bash
  $ git grep -n "services/doppiaggi-source" ops/
  ops/yaca-doppiaggi.sh:4:# Servizio: services/doppiaggi-source
  ops/yaca-doppiaggi.sh:31:SERVICE_DIR="${BASE_DIR}/services/doppiaggi-source"
  ```

- **(e) `src/catalog/itaAnnotations.js` legge `ita_annotations.jsonl`**:
  ```bash
  $ git grep -n "ita_annotations.jsonl" src/
  src/catalog/itaAnnotations.js:31:const FILE_NAME = 'ita_annotations.jsonl';
  ```

- **(f) Invarianza dei manifest hash**:
  ```bash
  $ node -e "const { buildManifest, buildRootManifest } = require('./src/stremio/manifest'); const crypto = require('crypto'); console.log('buildManifest({}):', crypto.createHash('sha256').update(JSON.stringify(buildManifest({}))).digest('hex')); console.log('buildRootManifest():', crypto.createHash('sha256').update(JSON.stringify(buildRootManifest())).digest('hex')); process.exit(0);"
  buildManifest({}): dc4af35c836503e4e28f8ba375dab24a38e9c0b392d43dbb24b9e4cc997c2178
  buildRootManifest(): 91bf96d38e8c753be430cdbe63ca3a5fe1b37c700779d5d378f56a1627969ce2
  ```

- **(g) Test Jest baseline**:
  - `npx jest --forceExit`
  - Risultato: `Test Suites: 5 failed, 184 passed, 189 total` (1887 test passati, solo le 5 suite autorizzate fallite: `animeOverridesCertify`, `candidateProvider`, `donghuaCatalog`, `duckDbAndMatchmaker`, `presetBurtonOrdering`).

### 3. Cosa NON è stato fatto
- Nessun file o servizio è stato eliminato: `services/keyword-graph` e `services/doppiaggi-source` sono entrambi mantenuti al loro posto.
- Nessuna modifica a codice applicativo (`src/**`, `ops/**`, `services/**/*.js`, `services/**/*.py`).
- Nessuna modifica a `docker-compose.yml`, `Dockerfile` o `.github/workflows/**`.
- Nessun `git push`. Nessun `npm run build`/`tsc`.
- Stato del ticket: lasciato `Status: ready-for-agent` (chiusura riservata all'orchestratore/integratore).


---

**Chiusura (19/10/2026, integratore).** Verificato e integrato in `3d29b0b`. Suite alla baseline (5 rosse / 8
test / 1887 verdi), entrambi gli hash del manifest invariati.

**Due bugie nuove, introdotte mentre si correggevano le vecchie** — corrette prima di mergiare, ed è la cosa da
ricordare di questo ticket:

1. il README riscritto elencava una chiave **`L1_adjacency`** che nel file **non esiste** (le chiavi sono sette:
   `metadata`, `kw_to_L1`, `L1`, `L2`, `L3`, `L4`, `L5`) e dichiarava la versione **`"2.0"`** mentre
   `metadata.version` è **`"2.3"`**;
2. le durate erano **enunciate invece che misurate**: «~6 secondi» (vero: **7 s**, `yaca-doppiaggi.service`
   04:01:09 → 04:01:16) e «~0,7 secondi» (i timestamp di systemd hanno risoluzione di un secondo: si può dire
   **1 s**, non 0,7).

Un ticket sulla verità dei documenti ha prodotto due affermazioni non verificate: **il rischio non è scrivere
poco, è scrivere con sicurezza**. Da qui la regola applicata: ogni numero in un doc porta accanto il comando che
l'ha prodotto.
