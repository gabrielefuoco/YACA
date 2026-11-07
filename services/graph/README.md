# `services/graph` — package di produzione del grafo YACA

`services/graph` è la casa canonica del codice che costruisce e serve il grafo. La build V45 è offline
ed è distinta dal runtime HTTP: il container non scarica dati, non addestra lo studente e non compila
artefatti.

## Build V45

```bash
PYTHONPATH=services py -m graph.build --check
PYTHONPATH=services py -m graph.build --build --version v45-replay
```

Il lock congelato è [`recipes/V45.lock.json`](recipes/V45.lock.json); la ricetta, le impronte e il
protocollo di replay sono in [`V45.md`](V45.md). Il build legge le cache locali e riusa il nuovo
studente; CAST/DIR/PROD sono matrici sorgente congelate per garantire il replay byte-identico. Gli
input densi e gli embedding già materializzati rimangono nella cache locale
`services/graph_dense/data/`; questa è una directory di dati, non un'import dal vecchio package.

## Runtime

- `servizio.py` espone l'API storica `/raccomanda` e la rotta di aggregazione `POST /scaffali`. **V10 è stato completamente rimosso dal servizio runtime**: entrambe le rotte sono alimentate esclusivamente da `graph.runtime.Engine` (V45). Il vecchio modulo `motore.py` non è più importato né istanziato dal servizio (è conservato unicamente per script offline).
- `runtime/` contiene il motore sparse V45 (`Engine`, PageRank personalizzato) e il banco di misura.
- L'immagine Docker è runtime-only: `.dockerignore` esclude `build/`; gli artefatti si promuovono
  offline e il volume dati resta read-only.

### Endpoint `/raccomanda` (Cutover V45) e `/scaffali` (V45 Standalone)

- **`POST /raccomanda` (contratto versione 1)**: Preserva al 100% la compatibilità a livello di chiavi e tipi con i client YACA (`src/clients/graphClient.js`), producendo `il_tuo_mondo` e `un_passo_fuori`. È servito da `graph.runtime.Engine` (latenza: **p50 = 1,0 ms**, **p95 = 17,4 ms**). *Nota compatibilità:* questo endpoint è mantenuto temporaneamente per retrocompatibilità fino alla migrazione del lato Node; anche i suoi ruoli `il_tuo_mondo` e `un_passo_fuori` sono da considerarsi legacy (il client cesserà di richiederli passando unicamente a `POST /scaffali`).
- **`POST /scaffali` (contratto versione 2)**: Implementa la ricetta congelata di clustering e ranking a due livelli (etichette tassonomiche in testa e fallback «Perché hai visto» in coda) con separazione rigorosa del medium per riga (policy P2), ammissione controparti permissive a $\tau = 2.5\%$ e decoupling candidati serviti (tra 20 e 60 per riga).

**Realtà della memoria (misure effettive RSS con V45 standalone, non stime):**
- **Processo runtime V45 standalone**: con la rimozione totale di V10 (eliminando la matrice densa da ~118 MiB), il server HTTP carica come singleton unicamente `graph.runtime.Engine` (~34 MiB delta) e la matrice compatta `vicini-top100.npz` (~65 MiB delta).
- **Peak RSS misurato su 30 richieste sequenziali su `warnok` (476 semi)**: **323,41 MiB** (working set peak; RSS a riposo 299,1 MiB).
- **Margine di sicurezza**: **188,59 MiB** di headroom nel container Docker da 512 MiB (`mem_limit: 512m`), e **76,59 MiB** stabilmente sotto la soglia di guardia di 400 MB.
- **Latenze misurate su 30 richieste sequenziali warm su `warnok`**:
  - `/scaffali`: **p50 = 1,525 s**, **p95 = 1,698 s** (ampiamente entro il target <= 3,0 s per 8 scaffali con walk PPR e clustering).
  - `/raccomanda`: **p50 = 1,0 ms**, **p95 = 17,4 ms**.

### Politica del Medium e Scaffali (Policy P2 e Controparti)
Stremio impone cataloghi rigorosamente omogenei per tipologia (`movie` o `series`). Gli archi cross-medium nel grafo vengono preservati (rafforzano la camminata e catturano il gusto), ma le righe esposte applicano la politica **P2** con omogeneità assoluta:
1. **Nessuna commistione**: in ogni riga servita, tutti i semi membri (`semi_membri`), i semi rappresentativi e i candidati raccomandati appartengono al medesimo medium della riga. Non è ammessa alcuna deroga sui cluster piccoli.
2. **Quality Gate Controparti Permissivo ($\tau = 2.5\%$)**: ciascuno scaffale base genera una riga di controparte dell'altro medium se il rapporto tra lo score top-1 della camminata controparte e quello della camminata primaria soddisfa $\text{ratio} \ge 2.5\%$ (`TAU_CONTROPARTE = 0.025`). La soglia è deliberatamente permissiva («blocca solo ciò che è palesemente slegato»): scarta le aberrazioni come *Classici d'autore* $\rightarrow$ *The Confession Tapes / American Gigolo* (2.01%), preservando connessioni cross-medium desiderate come *Cinecomic* $\rightarrow$ *Peacemaker* (4.34%), *Animazione* $\rightarrow$ *Dragons* (18.12%), *Horror* $\rightarrow$ *Ash vs Evil Dead* (25.98%). Il costo misurato di inasprire la soglia a 4.5% o 5.0% è la perdita di Cinecomic su warnok.
3. **Profili minuscoli (GAP 3)**: quando l'intero profilo ha meno semi del floor di scaffali (`TINY_PROFILE_FLOOR = 8`, es. `carverclan` con 7 semi o cronologie mono-seme), un cluster di 1+ semi omogenei per medium viene regolarmente servito come riga, a patto che ogni membro e candidato sia del medesimo medium. Negli altri profili resta in vigore la soglia minima ordinaria (`adaptive_floor`).
4. **Candidati per riga (GAP 2)**: la stima di overlap Jaccard in fase greedy continua a usare i top-10, mentre ogni riga servita finale viene popolata fino a `cap` (default 60 candidati, con $\ge 20$ assicurati anche per scaffali generati da un singolo seme).

### Transizione potata: l'unico percorso adatto al container

Caricare il triangolo V45 e simmetrizzarlo a runtime costa **~1.435 MiB di picco RSS** con qualunque
valore di potatura (misurato: `pota=16` 1.434,9 MiB, `pota=None` 1.434,7 MiB), quindi non entra nei
512 MiB del container. La transizione va precalcolata offline una volta:

```bash
PYTHONPATH=services py -m graph.runtime.prepara --pota 16
# scrive services/graph/data/v45-transizione/transizione-pota16.npz (10 MB, prov tracciata)
PYTHONPATH=services py -m graph.runtime.bench   # la tabella memoria/latenza
```

```python
from graph.runtime import Engine
engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
engine.raccomanda([("movie:603", None, "loved")], cap=60, medium="movie", esclusi=esclusi)
```

Misurato sulla transizione precalcolata: **190,7 MiB** di picco, **1,05 s** di avvio, **134 ms** per
richiesta (p95 147 ms). `Engine.carica()` resta un percorso di laboratorio, non di servizio.
L'artefatto è generato e quindi gitignored: si rigenera con il comando qui sopra, e `prepara` rifiuta
di scrivere dentro `data/v45/` per non toccare il grafo congelato.

### Vicini top-100 per clustering: rispetto del limite container a 512 MiB

Calcolare l'affinità dei semi durante il clustering (`interessi.py`) caricando e simmetrizzando a runtime
il triangolo V45 non potato (74,4M archi) generava un picco di memoria di **1.007,6 MB**, portando all'OOM
immediato nel container Docker (`mem_limit: 512m` in `docker-compose.yml:74`). Poiché per ciascun seme
servono unicamente i suoi top-100 vicini nel grafo non potato, l'artefatto compatto viene precalcolato
offline con provenienza tracciata:

```bash
PYTHONPATH=services py -m graph.runtime.prepara --target vicini
# oppure
PYTHONPATH=services py -m graph.runtime.prepara --vicini
# oppure entrambi gli artefatti:
PYTHONPATH=services py -m graph.runtime.prepara --target entrambi
# scrive services/graph/data/v45-vicini100/vicini-top100.npz (43.5 MB, prov tracciata)
```

```python
from graph.interessi import carica_matrice_affinita, scaffali
W_vicini = carica_matrice_affinita()  # carica vicini-top100.npz (~418 ms, ~62 MB RAM)
```

Misurazioni scientifiche Resident Set Size (RSS psutil):
- **Runtime PPR puro (`Engine.carica_transizione`)**: **156,8 MB** peak RSS
- **Clustering completo `scaffali()` su `warnok` (476 semi)**: **307,1 MB** peak RSS (target <= 400 MB rispettato)
- **Clustering completo `scaffali()` su `pepsipex` (568 semi, caso peggiore)**: **305,9 MB** peak RSS (target <= 400 MB rispettato)

Entrambi i percorsi rientrano stabilmente sotto la soglia di 400 MB con oltre 110 MiB di headroom per il container.
È severamente vietato toccare `bolle-eterogeneo-V45-p1.0-triangolo.npz` nel modulo clustering. L'artefatto
risiede in `services/graph/data/v45-vicini100/`, è gitignored e rigenerabile dal comando documentato.

## Compatibilità storica

`services/graph_dense/` contiene i dati cache e shim temporanei per script di ricerca; i moduli
sperimentali sono archiviati in `.scratch/graph_dense-archive/`. Il prodotto importa il builder da
`graph.build`, non da `graph_dense` e non da `.scratch`.
