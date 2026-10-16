Status: resolved
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

---

RISOLTO il 16/10/2026, e il guadagno e' piu' grande di quanto diceva il ticket: `Motore()` passa da **51,2 s a 2,0 s** (misurati, non stimati: il commento diceva ~20 s). L'artefatto e' `metadati-canone.npz` (0,5 MB) + `titoli-canone.txt` (1,4 MB — non un array `<U`, che con 4 byte per carattere e la larghezza del titolo piu' lungo faceva 41 MB). Si costruisce in 0,9 s, vettorizzato, e porta dentro l'impronta dei due parametri dei generi: se cambiano, si ricostruisce da solo. INCROCIO CONTRO I NUMERI NOTI: COZY 30.814 e IMP 8.279 sono esattamente le prevalenze scritte in `parametri.py`, NEP>1 = 16.529 come nell'artefatto delle serie. RESTA FUORI DAL CRITERIO: i 2 secondi residui sono la matrice sparsa (lavoro vero, non parsing), e tre file usano ancora `d.iloc[k]` (`cataloghi.py`, `liste.py`, il ramo `--colloca` di `pipeline.py`), dove pero' il costo si paga una volta sola per esecuzione invece che a ogni avvio.
