Status: resolved
Type: bug

# Lo slider `canone` ha un gradino in 0: e' una MIA regressione di oggi
**Prova** (`motore.py:144-146`): `if slider.get("canone"):` e poi
`out = out * np.exp(-P.ASSE_PESO * np.abs(q - c))` — l'esponente **non e' moltiplicato per
`abs(slider["canone"])`**. Quindi a `canone = 0.0` non si applica niente e a `canone = 0.01` si applica
la penalita' **intera**: un gradino, dove l'utente si aspetta una curva.
Il ramo `cozy` fa la cosa giusta (`quota` e' moltiplicata per `slider["cozy"]`, righe 133-135).
**E la mia verifica di stamattina non poteva vederlo**: ho misurato i voti medi dei mondi a `-1`, `0`,
`+1` — tre punti, tutti lontani dal gradino. Un test che guarda solo gli estremi non vede le
discontinuita' interne: e' una lezione da tenere, non solo un bug da chiudere.
**Fix**: `out = out * np.exp(-P.ASSE_PESO * abs(slider["canone"]) * np.abs(q - c))` — e un test che
confronti `canone = 0.0` con `canone = 1e-6` (i due output devono essere quasi identici).

---

RISOLTO il 16/10/2026: aggiunto `abs(slider["canone"])` all'esponente. Verificato: |canone 0.0 - canone 1e-6| = 3,45e-06 (era la penalita' INTERA), e la curva si muove |0.0 - 0.9| = 0,97. Il ramo `cozy` era gia' corretto.
