Status: resolved
Type: task
Blocked by: 08

# 09 — L'artefatto esce dal prodotto

## Perché

`src/data/bolle.json` è **3,2 MB tracciati in git**, dentro il prodotto, generati da un altro progetto
(`graph/`) a mano. Ogni clone se li porta dietro, ogni patch di codice ne trascina una versione, e il
prodotto legge un formato di cui non conosce il produttore. Dopo il ticket 08 nessuno lo legge più: resta da
decidere **come ci arriva, l'artefatto**, e chi lo possiede.

## Cosa deve uscire

- **Il file esce dal prodotto**: via da `src/data/` e via dal tracking git (con `git rm --cached`, e la regola
  in `.gitignore`).
- **La decisione su come l'artefatto raggiunge la produzione**, che è la parte vera del ticket. Candidati da
  valutare *con i numeri* (dimensione 3,2 MB, 138 MB la cartella `graph/data/` completa sul mate):
  1. **build in CI**: il workflow lo genera (`python -m graph.pipeline esporta`, ~10 s di codice, ma il
     modulo vuole i parquet TMDB in `.cache/tmdb/`) e lo mette nell'immagine;
  2. **volume sul mate**: già c'è `/srv/yaca/modulo/` con un venv e i parquet; il deploy non lo tocca;
  3. **download da `ops/`**: uno script che scarica l'artefatto da dove è pubblicato.
  La scelta deve dire anche **cosa succede quando l'artefatto non c'è** (il degrado lo definisce il contratto
  01: una riga vuota, non un feed rotto).
- **La versione**: l'artefatto porta `versione`, e il prodotto non deve cablare nessun numero (i parametri
  viaggiano lì, lezione del modulo). Dopo questo ticket, se un parametro cambia, che cosa si rifà — e chi se
  ne accorge.
- **Il cugino**: `src/data/hierarchical_graph.json` (1 MB tracciato) è l'artefatto del **vecchio** stack. La
  stessa domanda vale per lui, e la risposta sta nel 02/06 — non decidere qui al posto loro, ma lasciare la
  riga aperta nel ticket 13 se resta tracciato senza ragione.

## Come si verifica

Il test è il deploy: si cambia il codice del motore, si pubblica un artefatto nuovo, e il prodotto serve le
righe nuove **senza che nessuno tocchi il prodotto**. Se per aggiornare l'artefatto serve un commit nel
prodotto, la separazione non è finita.

## Attenzione

Il file è anche un oggetto di git: cancellarlo dal tracking **non** cancella la storia (i 3,2 MB restano nel
`.git` per sempre, 66 MB in totale). Se il peso della storia diventa un problema, è un ticket suo, con la sua
misura — non un effetto collaterale di questo.

---

## Esito

**Risolto il 17/10/2026.**

### 1. Cosa è uscito dal prodotto
- `src/data/bolle.json` (**3,26 MB**) è stato rimosso dal tracking git (`git rm --cached src/data/bolle.json`) e aggiunto al `.gitignore`. Il file resta sul disco locale come un-tracked.
- **Verifica lettori (`grep`)**:
  - Nel codice applicativo (`src/**/*.js`): **0 lettori rimasti** (ogni `require` verso `bolle.json` era già stato eliminato nel ticket 08 con la rimozione di `Bolle.js` e `raccomanda.js`).
  - L'unico riferimento residuo in `src/` è `src/engines/bolle/README.md` (documentazione storica del vecchio motore JS).

### 2. Il percorso di pubblicazione dell'artefatto
- **Opzione scelta: bind mount su volume host del mate** (Opzione 2 dei candidati).
  - *Scartata Opzione 1 (build in CI)*: richiederebbe il download di ~140 MB di dati grezzi TMDB in GitHub Actions per ogni build e la modifica di `.github/workflows/` (che per vincolo di credenziali non dispone dello scope `workflow`).
  - *Scartata Opzione 3 (download da `ops/`)*: passaggio intermedio superfluo dato che la pipeline Python risiede ed è eseguibile direttamente sul mate.
  - *Scelta Opzione 2*: sul mate i dati persistono sull'host in `/srv/yaca/services/graph/data/` (140 MB) e vengono montati in sola lettura dal container `yaca-graph` su `/app/services/graph/data:ro` (assetto definito dal ticket 18).
- **Allineamento della pipeline**:
  - In `services/graph/pipeline.py`:
    - Aggiornato l'argomento di default per il comando `esporta`: `--fuori` ora punta di default a `str(K.DATA / "bolle.json")` (ovvero `services/graph/data/bolle.json`), risolto in modo indipendente dalla working directory corrente.
    - Nel DAG `PASSO`, la voce `esporta` dichiara `"scrive": ["bolle.json"]` all'interno di `K.DATA`.
    - In `parita()` e nel test `tests/test_graph_pipeline.py`, la lettura verifica prioritariamente `K.DATA / "bolle.json"` con fallback trasparente a `src/data/bolle.json`.
- **Comando di produzione / esportazione dell'artefatto**:
  ```bash
  cd /srv/yaca && PYTHONPATH=services python -m graph.pipeline esporta --colloca
  ```
  oppure richiamando l'eseguibile del venv del modulo:
  ```bash
  cd /srv/yaca && PYTHONPATH=services /srv/yaca/modulo/.venv/bin/python -m graph.pipeline esporta --fuori /srv/yaca/services/graph/data/bolle.json --colloca
  ```
  Questo genera l'artefatto completo direttamente nella cartella dati montata nel servizio. **Nessun commit nel prodotto Node è richiesto per aggiornare o pubblicare l'artefatto.**

### 3. La catena di versione: `artefatto → /health → cache`
- **Cosa succede se cambia un parametro in `parametri.py`**:
  - `P.impronta()` ricalcola l'hash sha256 dei parametri (es. `8b2d793220fd2e65` → `25e3f98d7f3d2b75`).
- **Cosa succede se cambia un artefatto in `services/graph/data/`**:
  - `motore.artefatto = K.sha_file("bolle-eterogeneo-subvoti.npy")` produce un nuovo hash (es. `cf1d80dcba3eddce` → `914feb3ecc87d720`).
- **Propagazione verso il prodotto (Emendamento E3)**:
  1. `yaca-graph` espone all'avvio in `GET /health` in <1 ms:
     ```json
     {"ok": true, "contratto": 1, "versioni": {"artefatto": "<sha_art>", "ricetta": "<sha_ric>"}}
     ```
  2. Nel prodotto (`yaca-app`), `graphClient.getGraphHealthVersions()` memorizza in RAM per 60 secondi il payload di `/health`.
  3. `buildSharedHeroCacheKey` compone la chiave includendo `_art_<sha_art>_ric_<sha_ric>` (es. `user1_global_heroes_v13_art_cf1d80dcba3eddce_ric_8b2d793220fd2e65_movie`).
  4. Non appena il servizio viene riavviato con un nuovo artefatto o ricetta, il nuovo hash compare in `/health`. Scaduti i 60 s di cache locale in RAM, la chiave di cache del prodotto muta: i vecchi pool memorizzati (TTL 7 giorni) non matchano più, provocando un cache-miss deterministico che interroga il nuovo motore senza alcun intervento manuale sul codice o sulla configurazione di Node.

### 4. Verifiche eseguite end-to-end sul mate
Eseguito test reale via SSH sul mate:
1. **Verifica servizio attivo**: `yaca-graph` attivo e healthy.
2. **Endpoint `/health`**:
   `GET http://graph:7862/health` → `{"ok": true, "contratto": 1, "versioni": {"artefatto": "cf1d80dcba3eddce", "ricetta": "8b2d793220fd2e65"}}`.
3. **Generazione artefatto nel mount**:
   Eseguito `pipeline esporta --fuori /srv/yaca/services/graph/data/bolle.json`:
   - Scritto file da 3,12 MB (66.259 titoli, 3.497 bolle, 16.528 serie).
   - Verificata la presenza immediata sia sull'host `/srv/yaca/services/graph/data/bolle.json` che nel container `/app/services/graph/data/bolle.json`.
4. **Verifica chiave di cache nel prodotto**:
   Eseguito in `yaca-app` tramite `node -e`:
   - `buildSharedHeroCacheKey` produce `user1_global_heroes_v13_art_cf1d80dcba3eddce_ric_8b2d793220fd2e65_movie`.
5. **Simulazione mutazione parametro e artefatto**:
   - Modifica parametro in `parametri.py`: `ricetta` passa a `25e3f98d7f3d2b75`.
   - Modifica artefatto: `sha_file` passa a `914feb3ecc87d720`.
   - Un mock server HTTP su porta scratch restituisce il nuovo `/health` e produce la nuova chiave di cache invalidando quella precedente.

### 5. Cosa resta per il mate (To-Do operativo)
- Configurare il timer systemd/cron notturno per l'esecuzione automatica di:
  `cd /srv/yaca && PYTHONPATH=services /srv/yaca/modulo/.venv/bin/python -m graph.pipeline esporta --colloca`
  seguito da un restart agile del container `docker compose restart graph` (1,3-2,0 s di avvio misurato).

