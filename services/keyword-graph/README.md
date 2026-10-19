# YACA Offline Graph Builder (`services/keyword-graph`)

Questo modulo è separato dal runtime core di YACA ed è il **costruttore offline** di `src/data/hierarchical_graph.json` (il Grafo Gerarchico delle keyword TMDB in formato JSON).
La pipeline esegue filtraggio del rumore, generazione della matrice PPMI, elaborazione di embedding densi (`BAAI/bge-small-en-v1.5`), clustering gerarchico con algoritmo Leiden e sparsificazione.

> **Natura del modulo**: è un **costruttore offline (manuale)**, non un servizio server.
> **Correttamente NON è incluso in `docker-compose.yml` e non ha workflow CI/CD**: è un tool pesante di calcolo una-tantum (come `scripts/erdb-builder` per i poster) che va eseguito a mano quando occorre rigenerare il grafo gerarchico.

---

## Artefatto Prodotto e Contratto Condiviso

Lo script `build_graph.py` (riga 520) esporta il risultato finale in:
```
src/data/hierarchical_graph.json
```

### Due Consumatori, Nessun Contratto Formalizzato
Questo file (~1.0 MB) vive nell'albero dei sorgenti dell'applicazione ed è un **file di dati condiviso** con due consumatori distinti:
1. **L'applicazione core Node.js** (`src/indice/HierarchicalGraph.js`): lo carica in RAM all'avvio per la navigazione gerarchica delle keyword nel catalogo. Il file è incluso direttamente nell'immagine container dell'app.
2. **Il servizio Grafo delle Raccomandazioni** (`services/graph/upstream/spazi-trakt.py:128`): lo legge all'avvio o in fase di ingestione spazi Trakt (`ROOT / "src" / "data" / "hierarchical_graph.json"`).

### Struttura del JSON Generato
Il file `hierarchical_graph.json` generato contiene:
- `metadata`: versione (`"2.0"`), conteggio keyword e conteggi dei cluster per livello (`L1_count` … `L5_count`).
- `kw_to_L1`: mappatura da ciascuna keyword TMDB normalizzata al relativo ID di micro-cluster L1.
- `L1`: dizionario dei cluster di primo livello con label e membri.
- `L1_adjacency`: lista di adiacenza sparsa pesata tra cluster L1.
- `L2`, `L3`, `L4`, `L5`: livelli superiori di astrazione gerarchica dei cluster.

> [!WARNING]
> **Output storico `graph_data.json` rimosso**: In versioni precedenti il README indicava come output `../src/data/graph_data.json` con chiavi `keyword_to_cluster`, `cluster_adjacency` e `cluster_members`. Quel file è stato rimosso dal repository il 23/07/2026 (commit `482fa3d`, *"clean unused files"*) e **nessun componente lo legge più**. La costante a riga 18 di `build_graph.py` è un retaggio del primo stadio; l'unico output finale vivo è `hierarchical_graph.json` (riga 520).

---

## Requisiti di Sistema
- **Linguaggio**: Python 3.10 o superiore.
- **VRAM / Memoria**: Almeno 1 GB di VRAM (il modello di embedding impiega < 500 MB) o esecuzione su CPU con sufficiente RAM.
- **Dataset**: `build_graph.py` è configurato per leggere il catalogo movies (di default `../movies.parquet` o dataset TMDB equivalente con colonna `keywords`).

---

## Setup ed Esecuzione

È fortemente raccomandato l'uso di un virtual environment dedicato:

```bash
# Entra nella cartella del builder
cd services/keyword-graph

# Crea e attiva il virtual environment
# Su Windows PowerShell:
python -m venv venv
.\venv\Scripts\Activate.ps1

# Su Linux/Mac:
# python -m venv venv
# source venv/bin/activate

# Installa le dipendenze
pip install -r requirements.txt
```

Lancia la pipeline:
```bash
python build_graph.py
```

Al termine, il file `src/data/hierarchical_graph.json` risulterà aggiornato. Se l'app o il servizio grafo sono in esecuzione, vanno riavviati per ricaricare la struttura dati in memoria.

