Status: resolved
Type: task

# Salvare la transizione potata: l'avvio da 2,0 s a 0,08
**Dove**: `Motore.__init__` (e ogni arbitro) carica `bolle-eterogeneo-V10-p1.0-triangolo.npz` (6,6M archi),
fa `W + W.T` (13,2M) e `C.pota()` — che e' un ciclo Python su 66.259 righe con `argpartition`.
**Fix**: un artefatto `transizione-top16.npz` con `Tr` gia' potata e normalizzata (1,52M archi),
accompagnato dall'hash del triangolo e da `POTA_PER_RIGA`. Caricarla e' ~80 ms.
**Come si verifica**: `Tr` e' deterministica — l'artefatto si accetta solo se `Tr` ricostruita e `Tr`
salvata sono **identiche** (stesso sha del `.npz` o `np.array_equal` sugli array), e se l'hash registrato
del triangolo corrisponde. Va nel registro degli artefatti di `canon.py` e nel DAG (ticket 14).

---

RISOLTO E VERIFICATO il 16/10/2026. `camminata.transizione_pronta()` salva la transizione potata (9,4 MB, 1.529.390 archi — lo stesso numero che stampa `pesi.py`, incrocio involontario ma gradito) con le DUE impronte: l'hash del triangolo e il valore di `POTA_PER_RIGA`. Se una cambia, si ricostruisce da sola.

**E LA VERIFICA CHE CONTA**: la transizione letta dall'artefatto e' **identica** a quella ricalcolata da zero (`np.array_equal` su data, indices e indptr: True), e due letture consecutive sono identiche fra loro.

    Motore()   all'inizio della giornata   51,2 s
               dopo i metadati (ticket 08)  2,0 s
               dopo i membri e le quote (28) 1,15 s
               dopo la transizione (27)      **0,28 s**

