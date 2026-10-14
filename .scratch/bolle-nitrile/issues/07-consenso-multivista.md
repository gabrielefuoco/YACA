# consenso multivista

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 06

Il bonus di consenso multi-vista.

**Il difetto.** In `costruisci` i componenti si sommano **linearmente**. Ma un arco che esiste **solo
in KW** (due film con 3 keyword simili per caso) o **solo in CAST** e' molto piu' fragile di un arco
che compare in **due viste indipendenti** (CF+KW, TV+KW, DIR+CAST, B+KW).

**Fix**
- Per ogni arco `(i,j)` contare in quante viste distinte esiste: `N_ij = sum((C[nome] > 0) for nome in
  pesi)`, in `{1..8}`.
- Se `N_ij = 1` **e** quell'unica vista e' solo CAST o solo KW: **dimezzare** (x0.5).
- Se `N_ij >= 2`: **moltiplicare** per `1 + 0.5 (N_ij - 1)`.

**Perche' non penalizza la nicchia**: a un film di nicchia senza comportamento basta avere **DIR+KW**
o **CAST+KW** o **PROD+KW** per ricevere il bonus. Taglia i falsi positivi lessicali senza chiedere il
dato che la nicchia non ha.

**Criterio di chiusura**
- Banco sonda + distribuzione di `N_ij` (quanti archi hanno 1, 2, 3+ viste). Se quasi tutti gli archi
  hanno una vista sola, il bonus non fa nulla e va detto.

---

## Esito

PREMESSA NON VERIFICATA: solo l'8,6% degli archi ha due o piu' viste, fattore medio 0,992. Il bonus non premia quasi nulla, di fatto e' solo una penalita' su 1.161.496 archi.
