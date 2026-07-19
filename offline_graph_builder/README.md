# YACA Offline Graph Builder

Questo modulo è separato dal core di YACA e serve a pre-calcolare il Grafo Semantico delle keyword TMDB in formato JSON. 
La pipeline esegue filtraggio del rumore, generazione della matrice PPMI, elaborazione di embedding densi (`BAAI/bge-small-en-v1.5`), clustering con algoritmo Leiden e sparsificazione.

## Requisiti di Sistema
- **Linguaggio**: Python 3.10 o superiore.
- **VRAM**: Almeno 1 GB di VRAM (il modello di embedding impiega < 500 MB).
- Il dataset di partenza `TMDB_movie_dataset_v11.csv` deve essere presente nella directory root del progetto YACA (un livello sopra questa cartella).

## Setup
È fortemente raccomandato l'uso di un virtual environment.

```bash
# Entra nella cartella del builder
cd offline_graph_builder

# Crea e attiva il virtual environment (su Windows PowerShell)
python -m venv venv
.\venv\Scripts\Activate.ps1

# (Su Linux/Mac)
# python -m venv venv
# source venv/bin/activate

# Installa le dipendenze
pip install -r requirements.txt
```

## Esecuzione
Lancia la pipeline con:
```bash
python build_graph.py
```

### Note sul Dataset
Lo script cerca il file `../TMDB_movie_dataset_v11.csv`.
Assicurati che il file contenga almeno la colonna `keywords` formattata come lista di stringhe separate da virgola (es. `action, zombie, space`). Per alleggerire la memoria puoi rimuovere preventivamente le altre colonne dal CSV, ma lo script caricherà comunque solo la colonna necessaria.

### Output
Il risultato finale sarà generato in `../src/data/graph_data.json`.
Questo JSON contiene tre chiavi principali:
- `keyword_to_cluster`: Mappatura tra le stringhe delle keyword originali e il rispettivo ID del micro-cluster.
- `cluster_adjacency`: Lista di adiacenza sparsa. Per ogni ID cluster, la top K dei cluster vicini con il relativo peso (derivato dalla matrice PPMI fusa).
- `cluster_members`: Per ogni ID cluster, l'elenco delle keyword originali in esso contenute.

Se YACA è già in esecuzione, potresti aver bisogno di riavviarlo (o ricaricare la cache in RAM) per fargli leggere il JSON aggiornato.
