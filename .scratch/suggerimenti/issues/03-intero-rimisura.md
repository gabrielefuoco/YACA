Status: resolved
Type: misura
Blocked by: 01

# `intero.py` va rimisurato: il 5,0% e 63x sono misurati su uno split rotto
**Prova**: `intero.py` usa `MO.da_trakt(u)` (ticket 01) e taglia `storia[:70%]`. Con l'ordine rotto, la
precisione 5,0% e il 63x sul pavimento 0,08% misurano «dai film indovina le serie», non «dal passato
indovina il futuro». **Il numero headline dell'handoff 6 e' quindi sospetto.**
**Fix**: dopo il ticket 01, rieseguire `python graph/measure/intero.py` (~1 min). Riportare il numero
nuovo **anche se e' peggiore**, e correggere `handoff-senior-6.md` §3 e §4 dove il 5,0% e' citato.
Attenzione: lo split cronologico e' piu' difficile di quello per medium per costruzione (il futuro
remoto e' piu' lontano del presente), quindi un numero piu' basso e' **atteso** e non e' una
regressione. Va confrontato con il pavimento ricalcolato allo stesso modo.

---

RISOLTO il 16/10/2026. Ristampato con lo split vero: precisione **6,4%** (era 5,0%), lift **76x** (era 63x), pavimento 0,08%. Un passo fuori 31% (era 38%), il tuo mondo 20% (era 21%), rango mediano 3, 58% entro le prime 4 posizioni, 147 ms a chiamata. La conclusione di prodotto NON cambia. E i fattori di tipo non spostano quasi niente: 6,4% -> 6,2%, Jaccard 0,81. Handoff 6 corretto (3, 4 e 6.2).
