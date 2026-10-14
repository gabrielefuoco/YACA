# CPM e risoluzione

**Status**: `resolved`
**Type**: `task`
**Blocked by**: 08

CPM contro RBConfiguration, e la risoluzione.

**Il difetto.** In `07-componenti.py:312` la partizione usa `RBConfigurationVertexPartition` con
`resolution_parameter=100`. Ma il modello nullo di RBConfiguration e' `gamma * k_i k_j / (2m)`, e **i
gradi dei film e delle serie sono distribuiti diversamente**: i film hanno CF (49.041 film, zero
serie), le serie hanno B. In piu' RBConfiguration **soffre del resolution limit**.

**E c'e' un'evidenza dalla nostra storia**: il ticket 08 ha scoperto che una nicchia di anime si
spacca in due perche' **gli anime hanno molti archi tra loro** — che e' esattamente il sintomo del
resolution limit di RBConfiguration.

**Fix da provare**
- **CPMVertexPartition** (Constant Potts Model): il `resolution_parameter` e' direttamente la
  **densita' interna minima** perche' una bolla resti unita. Non soffre del resolution limit e non
  spacca i cluster omogenei solo perche' hanno molti archi interni. Range: gamma in `[0.005, 0.02]`.
- Confronto con RBConfiguration a risoluzione **piu' bassa** (gamma in `[30, 60]` invece di 100), ora
  che la matrice e' simmetrizzata e ripulita dagli hub.

**Criterio di chiusura**
- Banco sonda su almeno 3 risoluzioni CPM + 2 RB: **le nicchie anime devono restare intere**, e il
  numero di bolle con >=15 titoli non e' il metro (anzi: se sale troppo, sospettare).

---

## Esito

DEVIATO DAL TICKET e dichiarato: il ticket proponeva risoluzioni piu' basse, ma gli interventi hanno reso il grafo molto piu' grosso (da 5.297 bolle con mediana 9 a 1.430 con mediana 39). Provate CPM 0,02 e RB 60 (del ticket) piu' RB 200 (piu' alta della base).
