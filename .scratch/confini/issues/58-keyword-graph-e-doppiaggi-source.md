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
