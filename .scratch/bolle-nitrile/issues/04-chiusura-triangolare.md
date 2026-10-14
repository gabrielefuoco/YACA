# chiusura triangolare

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 03

La chiusura triangolare: `S.multiply(S @ S.T)`.

**L'idea** (dall'esperto, ed e' la piu' elegante del lotto): *i triangoli non mentono mai*. Un arco
singolo `(i,j)` puo' sempre essere un incidente. Ma se `i` e `j` appartengono davvero allo stesso
micro-mondo, **non hanno solo un arco: hanno gli stessi vicini**.

    S_irrobustita = S .multiply(alpha_0 + (S @ S.T))

**Perche' risolve i casi patologici**: Star Trek Into Darkness e Star Wars hanno un arco DIR, ma i
vicini di Star Trek (gli altri titoli di Star Trek) e i vicini di Star Wars (gli altri di Star Wars)
hanno intersezione quasi nulla: l'arco-ponte viene abbattuto. Dentro una vera bolla (iyashikei,
poliziottesco, Fassbinder) tutti i membri si rimpallano gli stessi vicini: l'arco esplode e la bolla
si blinda.

**Costo**: su matrici sparse con grado <= 30 e' un prodotto matrice-matrice, secondi.

**Criterio di chiusura**
- Banco sonda: i **ponti casuali** devono sparire e le **bolle vere devono stringersi**, non sparire.
  Se una nicchia si svuota, la chiusura e' troppo aggressiva e va ammorbidita (dirlo).

---

## Esito

L'intervento piu' efficace. L'intruso esce: Star Wars resta solo con i suoi 14 film. Il meccanismo e' quello previsto, i triangoli non mentono. Il criterio del ticket 03 attribuiva questo esito allo shrinkage: era qui.
