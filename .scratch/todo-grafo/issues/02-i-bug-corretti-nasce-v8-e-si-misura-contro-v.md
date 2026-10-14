Status: resolved
Type: task

# 02 — I bug corretti: nasce V8, e si misura contro V7

Correggere i quattro difetti e rigenerare la partizione (V8), poi **confrontarla con V7**.

Correzioni:
- `"genres"` in `COLS_M` e `COLS_T`
- `min_sim` coerente con lo shrinkage nel chiamante che serve la mappa
- `potatura_nucleo`: `fuori = (peso + peso.T).tocsr()` per la riassegnazione (la `versus` e' gia' giusta)
- restituire `RETE`, `PAE`, `COMP` da `costruisci_insiemi`, e lasciare che le usi chi serve

Il confronto V7 verso V8 va fatto **sulle metriche che contano**, non sul numero di bolle:
le 20 sentinelle (quante leggono un mondo nominabile), il banco dei 600 film (il 27,7% nella
propria bolla, lo 0,0% di scollegati), la mediana della dimensione, la purezza media, e il tempo.

Decisione esplicita alla fine: **V8 sostituisce V7, o V7 resta congelato?** L'esperto dice di
congelare V7 (RB 100), ma dice anche che la correzione dei bug va fatta: se V8 peggiora, si tiene
V7 **e si annota perche'**.

## Esito

V8 SOSTITUISCE V7. Ricetta identica, solo le correzioni. Componenti che cambiano di 47 volte (CAST da 35.684 a 1.662.368 archi) e la partizione che NON si muove: 1.617 -> 1.625 bolle, mediana 33 identica, la piu' grossa 590 -> 552, purezza 0,943 -> 0,946. La struttura delle bolle assorbe gli errori dei componenti, e ora lo sappiamo per misura. Tre artefatti noti riparati: Star Trek Into Darkness esce dalla bolla di Star Wars, Star Trek: Discovery passa da La mummia/MacGyver a space opera TV, La storia infinita perde Rambo III e i film coi delfini. Una regressione: l'iyashikei si scioglie dentro la commedia romantica. 18 sentinelle su 20 leggono un mondo nominabile, come V7. Vedi `ricerche/02-v8.md`.
