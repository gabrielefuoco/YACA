Status: resolved
Type: task

# Tre.497 scansioni di `MEM` e le quote ricalcolate a ogni chiamata
**Prova** (`motore.py:65`): `self.MEMBRI = [np.where(self.MEM == b)[0] for b in range(self.NB)]` — 3.497
scansioni su 66.259 elementi, ~231 milioni di confronti. Lo stesso file `collocator.py:105` usa gia' il
pattern O(N log N).
E alle righe 122-126 (`_quota_per_mondo`), 151 e 232 si ricalcola a ogni chiamata
`B.IS_TV[self.MEM == cb].mean()` e `maschera[m].mean()`.
**Fix**: `ordine = np.argsort(MEM, kind="stable"); confini = np.searchsorted(...)` per i membri, e tre
vettori **statici** precalcolati in `__init__` con `np.bincount`:
`QUOTA_TV = np.bincount(MEM, weights=IS_TV, minlength=NB) / np.maximum(SZ, 1)` (idem COZY, IMP).
**Come si verifica**: le quote devono venire **identiche** (confronto elemento per elemento), e il tempo
di `Motore.lista()` deve scendere da 147 ms verso i 25.

---

FATTO il 16/10/2026: i membri con `argsort`+`searchsorted` (somma 66.259, corretta) e le tre quote precalcolate con `np.bincount` (usate in `modula`, `scegli_mondi` e `lista`). MISURATO: `Motore()` da **2,0 a 1,15 s**, `lista()` da **147 a 105 ms**. **L'obiettivo di 25 ms NON e' raggiunto**: il costo che resta e' la diffusione vera (1,5M archi × 20 iterazioni) e le scansioni dei candidati, non le quote. Il grosso del guadagno sull'avvio e' nel ticket 27, che non ho fatto.
