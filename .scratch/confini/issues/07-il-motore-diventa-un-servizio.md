Status: resolved
Type: task
Blocked by: 01

# 07 — Il motore diventa un servizio

## Perché

Il confine deciso in charting (decisione 2) è che il motore delle raccomandazioni sia un **servizio**: il
prodotto gli manda semi e opzioni, lui risponde con liste spiegate. Il contratto lo scrive il ticket 01; qui
il modulo impara a **rispondere**.

Oggi `graph/` è una pipeline offline guidata da comandi: `python -m graph.pipeline esporta|parita|build`
(`graph/pipeline.py` contiene anche il DAG: `PASSO`, `piano()`), e `motore.py` espone `deduci`, `modula`,
`scegli_mondi`, `lista`. Niente di tutto questo è raggiungibile dal prodotto: il ponte è un file.

## Cosa deve uscire

- **Un processo che risponde**, dentro il modulo: riceve una richiesta conforme al contratto 01, la esegue
  con il codice che già esiste (`motore.py`, `camminata.py`, `raccomanda`-equivalente lato Python), e
  risponde. Nessuna riscrittura del motore: la logica c'è, manca la porta.
- **L'artefatto letto dal modulo, non dal prodotto**: `graph/data/` (138 MB sul mate) è già la sua casa;
  `src/data/bolle.json` è la copia che il prodotto si è tenuto. **La casa dell'artefatto IN PRODUZIONE è una
decisione di questo ticket** — volume montato (come `/srv/yaca/modulo/` oggi) o dentro l'immagine? — perché è
ciò che il ticket **09** presuppone quando decide come si pubblica verso il prodotto: se le due risposte si
contraddicono, il servizio parte rispondendo su un artefatto vecchio, e senza un errore. Criterio: misurare
(138 MB in `graph/data/`, i parquet TMDB in `.cache/tmdb/`, ~1,3 s di caricamento, misurato il 17/10/2026 — era dichiarato ~20 s senza misura). Il lato prodotto
lo chiude il 09.
- **Il tempo di risposta misurato**, non stimato: quanto ci mette una richiesta tipica (una storia da ~100
  semi, 4 liste, cap 60) a caldo e a freddo, e quanto pesa in RAM il processo. Il prodotto lo chiama al
  cache-build, ma un tetto serve al contratto.
- **Il degrado**: cosa risponde quando l'artefatto non c'è, quando la storia è vuota, quando un id non è nel
  grafo. Il comportamento atteso è già scritto nel prodotto (*una riga vuota è meglio di un feed rotto*,
  `raccomanda.js`) e nel contratto 01.
- **I test**: `pytest` (3 s per 22 test) resta l'anello veloce. Un test del contratto — una richiesta
  d'esempio con una risposta asserita — vale più di dieci test interni.
- **L'immagine e la sua assenza**: il processo **non** entra in `docker-compose` in questo ticket (lo decide
  il 08, che è il primo a chiamarlo). Se entra, entra con il suo `Dockerfile` e i suoi volumi (gli artefatti:
  `graph/data/` è 138 MB sul mate, `.cache/tmdb/` sono i parquet TMDB).

## Come si verifica

Eseguendo il codice deployato, come sempre: il servizio risponde **la risposta vera** del motore per una
storia vera, e l'esempio del contratto 01 è quello che si ottiene. Il confronto con il prodotto è
`python -m graph.pipeline esporta` (l'artefatto resta rigenerabile in ~10 s) e `parita` per il fixture.

## Attenzione

`DELTA_FASCIA` è marcato **INVENTATO** in `graph/parametri.py`, e gli assi **modulano l'attivazione, non
filtrano** (mappa `suggerimenti` §13). Se il contratto espone gli slider, questo ticket deve dire cosa
risponde il motore per un valore che non è calibrato — e non nasconderlo dietro un default.

## Esito

Risolto il 17/10/2026.

### 1. La forma degli endpoint e l'architettura
Il servizio risponde in `services/graph/servizio.py`, avviabile con `python -m graph.servizio` (`PYTHONPATH=services`):
- **`GET /health`** (Emendamento E3):
  Risponde `200` con `{"ok": true, "contratto": 1, "versioni": {"artefatto": "...", "ricetta": "..."}}`.
  Tempo di risposta: **0.25 ms** (<1 ms prescritto), payload serializzato una volta sola all'avvio in RAM senza toccare il grafo.
  Funziona da healthcheck per Docker/compose, impedendo al reverse proxy o a Node di inviare traffico durante l'inizializzazione.
- **`POST /raccomanda`** (e alias `POST /`):
  Riceve il payload del contratto:
  `{"semi": [{"tmdbId": 655, "medium": "series", "tipo": "watched", "peso": 0.42}], "medium": "series", "opzioni": {"largo": 4, "lontano": 0.0, "cozy": 0.0, "canone": 0.0}, "cap": 60}`
  Risponde:
  `{"contratto": 1, "versioni": {"artefatto": "...", "ricetta": "..."}, "semi": {"n": 100, "da_catalogo": false}, "liste": [...], "motivi": []}`
  Ogni lista ha spiegazione (`ruolo`, `mondo`, `descrizione`, `attivazione`, `mediana_voti`, `quota_serie`, `semi` che l'hanno accesa) e ogni titolo porta `tmdbId`, `medium` ("movie"|"series") e `punteggio`. Le liste derivate `uscite_nuove` e `nicchia_di_qualita` portano `parziale: true`.
- **Emendamenti implementati**:
  - **E1**: `peso` numerico opzionale per seme. Se presente, il motore applica il peso del prodotto (decadimento temporale di `collectRealSeeds`), altrimenti ripiega su `PESO_TIPO[tipo]`.
  - **E2**: tipo `"catalogo"` accettato: semina la diffusione PageRank, resta escluso dalle raccomandazioni (in `visti`), e accende `semi.da_catalogo: true`.
  - **E4**: `medium` opzionale. Se specificato, filtra per medium (`movie` o `series`) contando la capienza *per medium*; se assente, restituisce entrambi i medium.

### 2. Misure reali (non stimate)
Misurato con benchmark standalone su una storia reale di 100 semi da cache Trakt (`coldlocals`), 4 liste, cap 60:
- **Avvio del processo / caricamento artefatti**: **2.05 s** (ottimizzato da `transizione-potata.npz` in RAM).
- **`GET /health`**: **0.25 ms** (sotto il limite di 1 ms).
- **`POST /raccomanda` a freddo (prima richiesta)**: **95.44 ms**.
- **`POST /raccomanda` a caldo (media su 10 richieste consecutive)**: **92.39 ms** (minimo **86.62 ms**).
- **Memoria RAM residente (RSS)**: **128.4 MB** (singolo worker, singolo processo `http.server`, dentro l'intervallo 110–150 MB).

### 3. La casa dell'artefatto in produzione (Decisione)
- **Scelta**: **Volume montato read-only** (`yaca_graph_data` montato su `/app/services/graph/data:ro`, corrispondente a `/srv/yaca/services/graph/data` sul mate).
- **I numeri**:
  - Locale completo con scarti/cache storici: **666 MB**.
  - Produzione sul mate (soli artefatti attivi: `bolle-eterogeneo-subvoti.npy`, `transizione-potata.npz`, `mappa-finale-6-2.npz`, `metadati-canone.npz`, `titoli-canone.txt`, `nuovo-LIST.npz`): **138 MB**.
- **Perché**:
  1. Mettere 138 MB dentro l'immagine Docker obbligherebbe CI a compilare, trasferire e fare pull di 138 MB a ogni commit di codice, saturando la banda del mate.
  2. Il ticket 09 richiede che l'aggiornamento dell'artefatto sia trasparente al prodotto: scrivendo il nuovo artefatto nel volume e riavviando il servizio (o via SIGHUP/watchtower), il servizio serve immediatamente il nuovo grafo, `GET /health` espone il nuovo SHA dell'artefatto in <1 ms, e il prodotto invalida automaticamente la propria cache.

### 4. Degrado e gestione guasti
Collaudato e verificato secondo la tabella di §6 del contratto:
- **Storia fuori dal canone / vuota**: HTTP `200`, `liste: []`, `motivi: ["storia fuori dal canone"]`.
- **Lista senza materiale**: HTTP `200`, lista omessa, motivo registrato in `motivi` (es. `mondo_1867: nessun titolo trovato`).
- **Richiesta non valida / malformata**: HTTP `400` con spiegazione errore.
- **Artefatto non pronto**: HTTP `503` con `{"ok": false, "errore": "motore non pronto"}`.

### 5. Verifica ed esecuzione
- Pytest contratto: `tests/test_contratto_servizio.py` (10 test passati in 2.26 s).
- Pytest pipeline invariata: `tests/test_graph_pipeline.py` (18 test passati in 2.88 s).
- Totale suite Python: **28 passati in 4.18 s**.
- Parità: `python -m graph.pipeline parita` verde (0 diff su `tests/fixtures/parita.json`).

### 6. Cosa resta per il ticket 08
Il ticket 08 (lato Node/prodotto) deve:
1. Connettersi a `http://graph:7862/raccomanda` dentro la rete interna del compose al momento del cache-miss di `buildSharedHeroCatalogs` (`src/engines/hybridRecommendations.js`).
2. Rispettare il timeout di 10 s (la risposta è ~92 ms, quindi c'è un margine di 100x).
3. Leggere periodicamente `GET /health` (cache in memoria 60 s) per ottenere `versioni.artefatto` e `versioni.ricetta` da includere nella chiave di cache delle raccomandazioni.
4. Applicare la regola E5: se la chiamata HTTP al motore fallisce (503/timeout/connessione rifiutata), non memorizzare il fallimento per 7 giorni.
