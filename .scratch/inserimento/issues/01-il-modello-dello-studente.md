# il modello dello studente

**Status**: `resolved`
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


---

## Esito

**Fatto.** Modello salvato (`inserimento-modello.npz`) e vocabolari congelati
(`inserimento-vocabolari.pkl`). Report in `ricerche/01-modello-dello-studente.md`.

Le tre verifiche passano: l'ordine delle righe **coincide** (`cat` == `spazi-trakt.npz`), `FX` ha
**forma e nnz identici** (66.259 x 7.934, 1.660.603) con tfidf che differisce di **6e-8**, e il
refit riproduce la `P` salvata con differenza massima **0,0013** e **99,3% dei vicini in comune**.

Tre errori miei in un giro, tutti smontati da un controllo: l'offset dei generi, gli zeri espliciti
(`csr_matrix` li scarta), e **l'addestramento sulla matrice sbagliata** (`FX` grezza invece della
tfidf) — che mi ha fatto sospettare un'instabilita' inesistente. La proiezione e' **stabile**: una
perturbazione di 1e-8 lascia 50/50 vicini.

**Aperto per il ticket 02**: i vocabolari sono congelati sul catalogo, quindi una compagnia o una
lingua nuove **non hanno colonna**. Va deciso cosa farne. E la proiezione non e' l'unico canale:
il test di Verity ha mostrato che la **regia** e' il segnale piu' netto (sei similarita' di 1,0000
coi film di Showalter) mentre le keyword sono generiche.