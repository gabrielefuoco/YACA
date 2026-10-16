Status: ready-for-agent
Type: task

# Un artefatto di metadati invece di 12 parsing dei Parquet (~20 s -> <1 s)
**Prova**: `Motore.__init__` legge due volte `movies.parquet` e `tv.parquet` iterando **riga per riga**
in Python (`for k in range(len(d)): d.iloc[k]`) su ~117.000 righe, ed e' il costo vero dei 20 secondi
di avvio (non la matrice). Lo stesso parsing di `VOT`, `VAVE`, `POP`, `ANNO`, `NEP`, `COZY`, `IMP`,
`TIT` e' copiato in piu' file (`motore.py`, `pipeline.py`, `cataloghi.py`, `liste.py`, e altri).
**Fix**: creare `graph/data/metadati-canone.npz` (7 array allineati alle 66.259 righe del canone),
generato **una volta** da uno step, e caricarlo in 15 ms. `TIT` (le stringhe) si tiene in un `.npy` a
parte. Il file va nel registro degli artefatti (`canon.py`) con il suo sha256.
**Chiuso quando**: `python -c "import time; t=time.time(); MO.Motore(); print(time.time()-t)"` da'
**meno di 1 secondo**, e nessun file di `graph/` legge piu' i Parquet con `d.iloc[k]`.
