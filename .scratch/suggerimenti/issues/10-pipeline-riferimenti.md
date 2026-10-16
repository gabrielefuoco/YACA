Status: resolved
Type: task

# `pipeline.py` rimanda ancora a `.scratch/`, che non e' piu' la fonte
**Prova**: `voti()` e `pesanti()` e la tabella `ARTEFATTI` citano `.scratch/eterogeneo/01-...`,
`02-v10.py`, `11-subclustering-voti.py`, `.scratch/mappa-pesata/05c-salva-v3.py` — script che sono
stati **estratti** in `graph/steps/00_...`-`06_...`. Chi legge `python -m graph.pipeline pesanti` viene
mandato a eseguire codice che non e' piu' quello che ha prodotto gli artefatti.
**Fix**: aggiornare `pesanti()` e `ARTEFATTI` perche' puntino solo a `graph/steps/`, e far chiamare a
`pipeline voti` la funzione di `graph/steps/03_divisione_voti.py` invece di stampare un promemoria.
**Chiuso quando**: `grep -n "scratch/" graph/pipeline.py` non trova piu' comandi da eseguire (le
citazioni storiche nei commenti possono restare, se dicono che sono storia).

---

RISOLTO il 16/10/2026: `pesanti()` elenca `graph/steps/00_...`-`06_...` e dichiara che NON e' un DAG; `voti()` indica `steps/03_divisione_voti.py` e rimanda al ticket 14. Le provenienze storiche nella tabella `ARTEFATTI` restano, perche' dicono dove l'artefatto e' stato deciso.
