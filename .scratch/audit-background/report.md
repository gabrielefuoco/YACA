# Pulizia generale dello sfondo — audit ponytail

**Data**: 28 novembre 2026 · **Prima**: `0a752003` · **Dopo**: `4daad4a4` (+ i fix di deploy)
**Metodo**: cinque audit in parallelo (agy, read-only) su perimetri netti — daemon/dati, ops/systemd, scripts, servizi laterali, background dentro l'app — poi verifica mia con `rg` di ogni taglio prima di applicarlo.
**Risultato in una riga**: **123 file toccati, −23.075 righe**, quattro fragilità chiuse, il resto classificato con una decisione da prendere.

---

## 1. Cosa è stato tolto

| blocco | cosa | perché | righe |
|---|---|---|---|
| `526400ae` | `ops/timing/**`, gli script di `ops/erdb-legion`, `ops/yaca-grafo.*`, `scripts/analyze_presets.js` + le due rotte admin orfane + il loro test | profilazione una tantum; prefill poster fatto una volta (resta la patch dell'immagine); `yaca-grafo` puntava a `graph_dense`, che il compose non avvia; le rotte non erano chiamate da nessuno (né frontend né timer) | −1.677 |
| `87b8c67b` | 11 migrazioni Mongo già applicate, 4 backfill una tantum, 3 utility superate dalle rotte admin, la validazione preset via TMDB live + il suo report JSON, 23 sonde di `scripts/qa` (16 Python che non partono: importano `graph._archivio-v10`, fuori dal percorso) + `__pycache__`, e i due test che seguivano gli script | one-shot, zero chiamanti | −11.883 |
| `5c3a2d28` | `services/graph/_archivio-v10/` (38 file: il motore V10 e i suoi esperimenti) | irraggiungibile da `servizio.py`; l'unico riferimento era una riga di docstring. Era ancora nel contesto di build, quindi finiva nell'immagine | −9.496 |

Documenti allineati dove elencavano gli script cancellati: `TESTING_UTILITIES.md` (con la cronaca di una migrazione sostituita dalla regola, che resta valida), `INDEX.md`, `RECOMMENDATION_GRAPH.md`, e il README di `erdb-legion` ridotto a cosa servono le patch.

**Cosa ho lasciato di proposito, contro il parere degli audit:**

- **`ops/yaca-backup.*` e `ops/yaca-dump-backup.*`** (8 file, spenti): cancellare una ricetta di backup perché "tanto c'è rclone altrove" è il taglio che si rimpiange. Sono `disabled`: non costano niente finché non li accendi. Decidi tu: se i backup sono tutti su Google Drive, un commit li toglie (e `DEPLOYMENT_HOME_SERVER.md` §backup con loro).
- **`scripts/backfill-cjk-titles.js`**: il suo `findCompromisedIds` è usato da un test del daemon.
- **`scripts/seed_learned_names.js`, `scripts/backfill-airing-anime.js`**: citati da codice vivo (`src/anime/airing.js`) e da test.

---

## 2. Fragilità chiuse (`4daad4a4`)

| # | era | ora |
|---|---|---|
| 1 | **Due ricostruzioni per giro**: `dailySync` convertiva alla fine e il chiamante riconvertiva → parquet 14 s + swap + Tier 2 28 s + people.db 12 s, **due volte** | una sola, in fondo al giro |
| 2 | **Conversioni in parallelo**: il cold start ne lancia una ogni 5.000 titoli e la finale poteva scrivere gli stessi `.tmp` | coda: chi arriva dopo aspetta, nessuno cancella i file altrui |
| 3 | **Guasto invisibile**: il `catch` scriveva `error`, il giro dopo riscriveva `phase: 'idle'` e `--health-check` rispondeva sano su un indice fermo | resta `phase: 'error'`, l'unica cosa che il health-check legge |
| 4 | **OOM a metà build**: DuckDB dichiara `max_memory: 2GB`, container a `mem_limit: 1024m` | container a **2048m** (host: 7 GB, picco ~1 minuto due volte al giorno) |
| 5 | **Timer sovrapposti**: drenaggio poster ogni 5 minuti con giri fino a 15 (due giri si pestavano); doppiaggi che scrive nel volume dove scrive il daemon | `flock -n` sul drenaggio, `flock -w 300` nei doppiaggi |
| 6 | **GC che non può vincere**: cache poster +~850 file/giorno, GC a `--max-delete 500` → debito crescente per costruzione (15,9 GB, 109.887 file, **zero** più vecchi di 60 giorni: la soglia TTL non ha mai morso) | `--max-delete 3000`, applicato anche all'unità installata in `/etc/systemd/system` |

Deploy verificato: app, daemon e grafo sullo stesso id immagine del registry, tutti `healthy`, `restarts=0`; manifest 200, ricerca 200, admin 401, unità ricaricate (`daemon-reload` ok, `max-delete 3000` letto dal servizio), daemon ripartito con 2 GB e già in sync.

---

## 3. Fragilità aperte (con gravità e perché non le ho toccate)

| # | cosa | gravità | nota |
|---|---|---|---|
| 1 | **DuckDB è single-writer e ci sono due processi**: app (legge) e daemon (deve aprirlo per ricostruire). Al riavvio si vede nei log: `Conflicting lock … attesa 2000ms`, 3 tentativi | **alta** | la toppa (retry) funziona, ma un build più lungo dei 3 tentativi lascia il daemon senza indice. La soluzione vera è che il daemon ricostruisca **dai parquet** senza aprire il DB vivo: è un cambio di disegno, non una pulizia |
| 2 | **`services/doppiaggi-source` gira dall'host**, non in container: `ops/yaca-doppiaggi.sh` cerca un `node` fra quattro percorsi (mise, latest, `command -v`, `/usr/local/bin`) e scrive nel volume del daemon | media | il `flock` chiude la corsa; il resto (version drift, dipendenze dell'host) resta |
| 3 | **Watchtower e `/srv/yaca` sono due mondi**: i container arrivano dall'immagine, i timer eseguono lo script dal checkout, che può essere indietro (oggi lo era di due commit) | media | niente rompe in silenzio, ma "l'ho mergiato" ≠ "il timer lo usa" |
| 4 | **`catch` che degrado-morbido senza dire niente**: `buildTier2Index`/`buildPeopleIndexFile` loggano e proseguono; se il Tier 2 è rotto la ricerca testuale perde la coda lunga senza che nessuno lo sappia | media | il fix 3 copre la conversione DuckDB, non questi due |
| 5 | **~50 parametri V10 morti in `services/graph/parametri.py`** e `Engine.raccomanda()`/`carica()` mai chiamati: 1.200 righe nel percorso Python | bassa | taglio sicuro ma va fatto con i test Python in mano, non in un giro di pulizia |
| 6 | **`services/graph/upstream|fetch|tests`** ora fuori dall'immagine ma ancora nel repo, e `build/` (4.368 righe) bloccato da un test | bassa | decisione: archivio o rimozione, con replay da rifare |

### Housekeeping fuori dal codice (misurato, non toccato)

| cosa | numero | azione |
|---|---|---|
| immagini Docker | 111, **12,8 GB recuperabili** | `docker image prune -a` (le yaca sono 4) |
| `/srv/yaca` non tracciato | `modulo/` 748 MB, `backups-local/` 28 MB, `.env.bak*` | spostare fuori dal checkout: i timer girano da lì |
| cache poster | **15,9 GB / 109.887 file**, ~153 KB per file | dopo il GC a 3000 la curva si piega; se resta alta, il prossimo passo è la dimensione, non il numero |
| `services/graph_dense`, `services/keyword-graph` | 96 + 528 righe | `graph_dense` non è più avviato da nessuno (resta il `data/`); `keyword-graph` è uno strumento manuale con lo script di build rotto (`v2.0`, percorsi `../` sbagliati) |

---

## 4. Cosa resta da decidere (una riga ciascuna)

1. **Backup**: accendere `yaca-backup.timer`, o cancellare gli 8 file e la sezione del deployment doc?
2. **`tier2_titles.parquet`**: 46 MB scritti a ogni ricostruzione e letti da nessuno (la ricerca legge `titles_fts5.db`). Toglierlo costa un `COPY` e un test da aggiornare.
3. **Il lock DuckDB**: accettare il retry come soluzione, o fare il passo vero (rebuild dai parquet senza aprire il DB vivo)?
4. **`services/graph`**: quanto del ramo Python morto si archivia? I 1.200 righe di V10 e i 50 parametri sono tagli sicuri con i test in mano.
5. **`doppiaggi-source` in container**: spostarlo nel compose (con la sua unità) toglierebbe il `node` cercato a mano e il `git pull` come dipendenza.

---

## 5. Come è stato fatto (riproducibile)

Gli audit sono in `.scratch/audit-background/`:

| file | perimetro | esito |
|---|---|---|
| `1-daemon.md` | daemon TMDB + pipeline dati | 16 tagli, 10 fragilità |
| `2-ops.md` | ops/systemd/compose | 32/42 file removibili, 3 fragilità |
| `3-scripts.md` | scripts + qa | 50 file, −12.624 righe |
| `4-servizi.md` | servizi non-compose + grafi | 3 tagli grossi |
| `5-app-bg.md` | background dell'app | ~950 righe, 3 fragilità |

Ogni taglio applicato è stato ri-verificato da me con `grep` sui chiamanti reali (`src/`, `services/`, `tests/`, `ops/`, `compose`, `frontend`) prima della cancellazione: due proposte degli audit sono state respinte perché un test importava il file (vedi §1), una perché era una rete di sicurezza (backup).

Stato finale: **2.128 test passati**, 1 saltato, i due timeout noti (`duckDbPresetsValidation`, `heroMovieDateRegression`) che passano da soli; lint senza errori.
