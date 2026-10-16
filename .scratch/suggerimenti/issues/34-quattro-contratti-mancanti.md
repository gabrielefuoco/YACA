Status: ready-for-agent
Type: task

# Quattro contratti da aggiungere a `canon.py`
Nati da errori reali, come gli altri. Ognuno trasforma un silenzio in un errore:
1. **`assert_stocastica(P, nome)`** — su `bolle.json` e su `Tr`: pesi >= 0 e finiti; per ogni bolla non
   isolata `|sum(P[b]) - 1| <= 1e-9` (avrebbe intercettato subito la deriva del ticket 17, invece di
   farmi **allargare una tolleranza**); mediana dell'auto-anello `P[b][b] > 0.10` (se una rigenerazione
   della mappa perdesse la diagonale, la ritenzione interna della bolla sparirebbe).
2. **`assert_split_temporale(eta_semi, eta_oro)`** — `eta` in giorni da oggi, quindi il passato ha eta'
   PIU' GRANDE: `np.median(eta_semi) > np.median(eta_oro)`. Chiude per sempre la classe del ticket 01
   (tempo invertito in `pesi.py`, taglio per medium in `intero.py`).
3. **`assert_lunghezza_canone(arr, nome)`** — dentro `metadati()` e `titoli()`: `len(arr) == N` e nessun
   `NaN`. E' la guardia del ticket 25.
4. **`assert_monotonia_lista(lista, nome)`** — in `motore.lista()`, prima di restituire: i punteggi di
   ogni lista ordinata devono essere **non crescenti**. Avrebbe fatto scattare subito `uscite_nuove`
   (ticket 19) e `un_passo_fuori` (ticket 20).
