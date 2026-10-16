Status: resolved
Type: bug

# `03_divisione_voti`: il pezzo principale e' escluso dal calcolo dello spread finale?
**Affermato dal senior**, e **non l'ho ritrovato**: nella mia copia la riga 125 e'
`NUOVA[m_[part == 0]] = b` (il primo sottocluster conserva l'id del genitore), e la riga 115-116 assegnano
gli altri con `prossimo`. Il `np.setdiff1d(np.unique(NUOVA[MEMBRI[b]]), [b])` che lui cita **non l'ho
trovato** in `steps/03_divisione_voti.py`: o e' in una posizione diversa da quella che ho guardato, o e'
in una versione che ha letto dal digest.
**Cosa serve per chiuderlo**: guardare il calcolo dello spread che DECIDE se una bolla va divisa (il
verdetto, non il resoconto `SP2`), e stabilire se il pezzo con `part == 0` conta. Se non conta, una
suddivisione che non migliora lo spread del pezzo principale viene accettata — e il verdetto e' troppo
generoso. **Si chiude misurando**: ricalcolare lo spread p90/p10 dei pezzi finali della partizione
`bolle-eterogeneo-subvoti.npy` e vedere quanti superano ancora `VOTI_SPREAD_MIN`. Se sono pochi o zero, il
verdetto funziona e il ticket si chiude senza modifiche.

---

CHIUSO SENZA MODIFICHE: era gia' a posto. In `steps/03_divisione_voti.py` la riga 141 e' `pezzi = [SP2[p] for p in np.unique(NUOVA[MEMBRI[b]])]` — **senza** `setdiff1d(..., [b])` — e il commento li' sopra spiega proprio quel bug e perche' e' stato tolto. La revisione citava una riga che contiene la correzione: o ha letto una copia vecchia, o ha letto il commento al contrario. Da qui in poi il verdetto sullo spread include anche il pezzo che tiene l'id del genitore.
