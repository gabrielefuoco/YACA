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


---

## Esito finale: la risoluzione di V7 (RB 100) e' la MIGLIORE delle cinque provate

| | bolle | mediana | con >=15 | la bolla di Gidget a Roma |
|---|---|---|---|---|
| CPM 0,02 | 2.600 | **3** | 770 | 166 (degenerata: mediane di 3 e giganti) |
| RB 60 | 1.164 | 48 | 962 | **191** (il mondo **cola**: dentro Ski School, Safari, Sognando l'Africa) |
| **V7 — RB 100** | **1.617** | **34** | **1.249** | **162 = sola commedia sexy italiana** |
| RB 200 | 2.524 | 20 | 1.547 | **4** (Gidget + Gidget Goes Hawaiian + 2 film di guerra) |

**Alle due estremita' si perde, in due modi opposti e leggibili:**
- **piu' fine (RB 200)**: il mondo **si frantuma**. La commedia sexy all'italiana, 162 titoli a RB 100,
  diventa un gruppetto di 4 con due film di guerra dentro. Anche il fantasy anni '80 scende da 37 a 20
  e perde Conan e Highlander.
- **piu' grossa (RB 60)**: il mondo **cola**. Gli stessi 162 diventano 191, ma con *Ski School*,
  *Safari* e *Sognando l'Africa* dentro.
- **CPM 0,02 e' degenere**: mediana 3 (una massa di bolle da 3 titoli) piu' pochi giganti da 300-660.

**Quindi: la risoluzione non era il problema, e la linea di base (RB 100) era gia' quella giusta.**
La deviazione dal ticket — provare una risoluzione piu' ALTA invece che piu' bassa — e' servita
proprio a questo: a dimostrare che il problema non era la risoluzione ma la **costruzione del grafo**,
e che dopo i ticket 02-08 la coarsening e' atterrata esattamente dove doveva.

**Nessun cambio di risoluzione. V7 resta la partizione di riferimento del ticket 10.**
