Status: resolved
Type: task

# Tre punti rileggono ancora i Parquet invece di `K.metadati()`
**Dove**: `pipeline.esporta` (per `VOT`), `collocator._mediane_voti` (per i voti) e `motore.carica_titoli`
(per `TIT`). Tutti e tre fanno ancora `pd.read_parquet` con cicli Python su ~117.000 righe, mentre gli
array sono gia' pronti, vettorizzati e **con l'impronta dei generi** in `graph/data/metadati-canone.npz`.
**Fix**: usare `K.metadati()`. Attenzione a `_mediane_voti`: la sua semantica e' la **mediana dei voti
per bolla** (che e' anche `VOTMED` in `motore`), quindi va confrontata prima di sostituire — e va tenuto
il fatto che restituisce `np.nan` per i titoli senza voto, mentre `metadati()` mette 0.

---

FATTO il 16/10/2026 in DUE dei tre punti: `pipeline.esporta` (i voti) e `motore.carica_titoli` (i titoli per la stampa) leggono `canon.metadati()` invece dei Parquet, che erano due letture complete con un ciclo Python su 117.000 righe.

**IL TERZO NON L'HO FATTO, e il motivo e' una differenza di semantica**: `collocator._mediane_voti` restituisce `np.nan` per i titoli SENZA voto, mentre `metadati()` mette 0. Sostituirla cambierebbe in silenzio come si calcola la mediana di una bolla con titoli non votati — e la mediana dei voti e' quella che decide il piano in cui un titolo nuovo atterra (la regola del ticket 09 di `eterogeneo`). Va prima deciso quale delle due e' giusta, poi si sostituisce.
