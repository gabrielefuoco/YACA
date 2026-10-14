# il modello dello studente

**Status**: `ready-for-agent`
**Type**: `task`

Salvare il modello dello studente, e i vocabolari che gli servono.

**Il fatto**: la collocazione di un titolo freddo e' una **Ridge** `FX -> Cf` addestrata in
`cf-edges.py:95` con `alpha=10.0`, `solver='lsqr'`. Il modello **non e' salvato**: `cf-studente.npz`
ha solo `P` (66.259 x 128).

**Cosa fare**
1. **Estrarre la costruzione di `FX`** da `spazi-trakt.py` (righe ~117-197) in un modulo riusabile
   `features.py`, con la stessa identica logica. Non cambiarla: il modello e' addestrato su quella.
2. **Salvare i vocabolari**: generi, lingue (25), paesi (40), persone (3.000), collezioni (800),
   compagnie (600), sceneggiatori (1.500), lingue parlate (30), e il vocabolario delle keyword con
   i pesi IDF. Oggi sono tagliati sul catalogo con `most_common(N)`.
3. **Rifittare la Ridge** e salvare `coef_` (n_feature x 128), `intercept_` (128), e i parametri.
4. **Verifica**: la `P` ricalcolata deve coincidere con `cf-studente.npz`.

**Criterio di chiusura**
- `P` ricalcolata == `P` salvata (o la differenza e' dichiarata e spiegata).
- Un file `studente.npz` che contiene modello + vocabolari, e una funzione
  `proietta(metadati) -> vettore(128)` che gira in millisecondi.
