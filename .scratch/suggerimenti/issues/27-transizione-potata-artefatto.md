Status: ready-for-agent
Type: task

# Salvare la transizione potata: l'avvio da 2,0 s a 0,08
**Dove**: `Motore.__init__` (e ogni arbitro) carica `bolle-eterogeneo-V10-p1.0-triangolo.npz` (6,6M archi),
fa `W + W.T` (13,2M) e `C.pota()` — che e' un ciclo Python su 66.259 righe con `argpartition`.
**Fix**: un artefatto `transizione-top16.npz` con `Tr` gia' potata e normalizzata (1,52M archi),
accompagnato dall'hash del triangolo e da `POTA_PER_RIGA`. Caricarla e' ~80 ms.
**Come si verifica**: `Tr` e' deterministica — l'artefatto si accetta solo se `Tr` ricostruita e `Tr`
salvata sono **identiche** (stesso sha del `.npz` o `np.array_equal` sugli array), e se l'hash registrato
del triangolo corrisponde. Va nel registro degli artefatti di `canon.py` e nel DAG (ticket 14).
