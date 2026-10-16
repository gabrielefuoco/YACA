Status: ready-for-agent
Type: bug

# Lo slider `canone` e' una retta verso l'estremo, non una fascia attorno al profilo
**Prova** (`graph/motore.py`, `modula`): l'esponente contiene
`abs(q - c) * abs(s) * np.sign(q - c) * s`. Ma `abs(x)*sign(x)` **e' identico a `x`**: quindi
l'esponente e' `-P.ASSE_PESO * (q - c) * s*|s|`, una **retta monotona**, non una campana centrata su
`c`. Con `s>0` premia i mondi mainstream in assoluto, con `s<0` premia `VOTMED = 0` — cioè esattamente
il riordino verso l'estremo che il commento due righe sopra dice di voler evitare (e che in
`ricetta.py` faceva crollare la copertura allo 0,3%).
**Fix**: `c_target = c + slider["canone"] * delta_fascia` e penalita' `exp(-P.ASSE_PESO * abs(q -
c_target))`. Lo slider **sposta la finestra**, non spinge all'estremo: `delta_fascia` va in
`parametri.py` (INVENTATO fino a calibrazione) e il centro resta il profilo dedotto.
**Chiuso quando**: `ricetta.py` ristampato: con `canone = +1` il `VOTMED` mediano dei mondi tenuti e'
**piu' alto** del profilo e con `-1` piu' basso, e nessuno dei due e' a 0 voti.

---

IL FIX C'E', manca la ristampa di `ricetta.py`. La formula e' ora `exp(-ASSE_PESO * |q - c_target|)` con `c_target = c + slider * DELTA_FASCIA` (nuovo parametro, INVENTATO, 1,0 in spazio log = un fattore e): la finestra si SPOSTA invece di spingere all'estremo. Prima `abs(q-c)*sign(q-c)` era identico a `(q-c)`: una retta che con s<0 premiava i contenitori a 0 voti.
