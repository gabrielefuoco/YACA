Status: resolved
Type: task

# 06 — Il ponte film-serie e la fusione dei due voti

Costruire il ponte e fonderlo col diretto (§1.B.2 e §1.B.3).

- `BB_film->serie`: la matrice di adiacenza fra le bolle-film e le bolle-serie, normalizzata come
  dice l'esperto (`BB~`, righe normalizzate) perche' una bolla-film con 40 archi non deve valere
  quanto una con 3.
- `S_ponte(s, b) = somma su b_film di P(b_film | s) * BB~(b_film, b)`, dove `P(b_film | s)` viene
  dallo studente dei film, che fa il 27,7%.
- Fusione: `S_diretto + lambda * S_ponte` sulle 349 bolle-serie, argmax. **Tarare `lambda`** su una
  parte del banco e verificarlo sull'altra, invece di scegliere il valore che fa piu' bella la
  tabella: se il `lambda` migliore e' 0 o infinito, la risposta e' che una delle due strade e' inutile.

Riportare anche le due popolazioni separate: dove il ponte esiste (il 58,7%) e dove il mondo e'
solo-serie (il 41,3%). Se il diretto risolve i solo-serie e il ponte porta il resto, l'esperto ha
ragione; se no, dire dove sbaglia.
Esito: `ricerche/06-ponte-fusione.md`.

## Esito

IL PONTE NON FUNZIONA, in nessuna delle due forme: 0,8% con lo studente dei film vero (la ricetta dell'esperto) e 2,5% con la mia versione, contro il 35,3% del diretto. La fusione peggiora sempre: lambda migliore 0. I due voti concordano su 6 serie su 600, e il ponte ha ragione dove il diretto sbaglia 3 volte su 600. Meccanismo: lo studente dei film predice lo spazio CF, e la proiezione recupera la struttura dei METADATI, non il comportamento (0,0% di vicini in comune con CF, ticket 02 di inserimento). Il ponte non porta un'informazione che il diretto non abbia.
