# 06 — Il probe rotto: tmdbId contro movieId (e come è stato smascherato)

**Status**: `resolved` · **Type**: `task` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: nessuno

## Il bug

`probe4-features.py` filtrava i voti MovieLens con i **tmdbId** invece che con i **movieId**:
`ratings[ratings["movieId"].isin(covered_mids)]` dove `covered_mids` conteneva id TMDB. Due namespace diversi
che **collidono per caso** sugli stessi numeri: la SVD veniva costruita su un insieme arbitrario di item.

Sintomo: il controllo del vettore medio crollava da **0,224 a 0,056**, e il probe misurava 0,044.

## Come è stato trovato (da tenere)

1. **Il controllo accanto alla misura** ha reso visibile l'anomalia: senza, 0,044 sembrava un risultato.
2. **Il confronto fra due implementazioni della stessa cosa** (`build-film-graph.py` vs il probe) che davano
   4× di differenza: due implementazioni che divergono indicano che una è rotta, non che il fenomeno è ambiguo.
3. **La diagnostica in una riga**: stampando le colonne vuote della matrice → `18.913 su 23.309`. Cioè: quasi
   tutte. Il numero che ha chiuso la questione.

## La regola

**Convertire una volta sola, al confine del namespace, e stampare la copertura.** E: nessun numero senza il
controllo del banale accanto.
