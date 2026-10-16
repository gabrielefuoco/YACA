Status: ready-for-agent
Type: task

# Tre punti rileggono ancora i Parquet invece di `K.metadati()`
**Dove**: `pipeline.esporta` (per `VOT`), `collocator._mediane_voti` (per i voti) e `motore.carica_titoli`
(per `TIT`). Tutti e tre fanno ancora `pd.read_parquet` con cicli Python su ~117.000 righe, mentre gli
array sono gia' pronti, vettorizzati e **con l'impronta dei generi** in `graph/data/metadati-canone.npz`.
**Fix**: usare `K.metadati()`. Attenzione a `_mediane_voti`: la sua semantica e' la **mediana dei voti
per bolla** (che e' anche `VOTMED` in `motore`), quindi va confrontata prima di sostituire — e va tenuto
il fatto che restituisce `np.nan` per i titoli senza voto, mentre `metadati()` mette 0.
