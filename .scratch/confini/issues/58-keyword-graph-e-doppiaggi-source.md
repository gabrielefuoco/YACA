Status: needs-triage
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

**`keyword-graph` è orfano: zero riferimenti.** `grep -rn "keyword-graph"` su tutto il repo (fuori da `.scratch`
e da `.git`) **non trova niente**: né nel compose, né nei workflow, né in `ops/`, né in `src/`, né in un altro
servizio. Non è «un servizio non ancora collegato»: è codice che nessuno raggiunge. Il criterio della decisione 32
dice ritirarlo.

**Sul `hierarchical_graph.json` (la «copia da uccidere»)**: nel repo ce n'è **una sola**, `src/data/`, 1,0 MB,
dentro l'immagine dell'app. Il secondo consumatore è il **grafo**: `services/graph/upstream/spazi-trakt.py:128`
la legge da `ROOT/src/data/`. Quindi non sono due copie divergenti: è **un file di dati condiviso che vive
nell'albero dell'app** ed è usato anche da un altro servizio. Da decidere dove sta il posto giusto (accanto
all'artefatto del grafo, o dove sta ora con un contratto che lo dichiara).
