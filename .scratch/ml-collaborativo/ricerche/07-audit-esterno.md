# 07 — L'audit esterno: il grafo davanti a 32 milioni di voti veri

**Data**: 08/10/2026 · **Script**: `audit-adjacency.py` · **Teacher in cache**: `.cache/movielens/teacher-Z.npz`

## Il problema che risolve

Il grafo di adiacenza è sempre stato promosso **da sé stesso**: modularità 0,696, coerenza 0,618, ARI
contro i topoi L2. Sono tutti criteri *interni*: misurano se il grafo è coerente con le sue stesse
regole, non se è **giusto**. «Perfetto» era un aggettivo, non una misura.

Il teacher MovieLens è il giudice esterno che mancava: 32M di voti di 200.948 utenti dicono se due
micro-cluster sono vicini **per le persone**.

## Il metodo

1. **Teacher** (SVD collaborativa, 64 dim, `teacher-Z.npz`): 49.709 film.
2. **Cluster di ogni film**: dalle sue keyword → `kw_to_L1` → micro-cluster L1.
3. **Centroide collaborativo** di ogni cluster (media normalizzata dei suoi film col teacher):
   1.381 cluster su 1.382, mediana **100 film** per cluster.
4. **Le 67.510 coppie con arco** contro **coppie di cluster a caso** con la stessa distribuzione di grado.

## I numeri (con la correzione del mio errore)

| | |
|---|---|
| coseno collaborativo — coppie **CON arco** | **+0,570** (mediana +0,583) |
| coseno collaborativo — coppie **A CASO** | +0,490 (mediana +0,498) |
| **AUC = P(con-arco batte a-caso)** | **0,629** (0,500 = inutile, 1,000 = perfetto) |
| **Spearman fra PESO dell'arco e vicinanza reale** | **+0,087** |

Gradiente per peso:

| fascia | peso | vicinanza collaborativa |
|---|---|---|
| decile basso | 0,31 | +0,556 |
| mediana | 1,27 | +0,564 |
| **decile alto** | 4,32 | **+0,631** |

**Il bug che ho fatto**: la prima versione contava P(caso > arco) invece del contrario e stampava **0,371**.
A smascherarlo non è stato il codice ma la **contraddizione con le medie** (con-arco 0,570 > a caso 0,490:
un AUC di 0,371 non può esistere). Terza volta oggi che è un *controllo* a trovare l'errore, non la logica.

## La lettura

1. **Il grafo ha ragione, ma debolmente**: AUC 0,629 — gli archi portano segnale vero, non sono rumore.
2. **Il PESO quasi non ordina** (ρ = +0,087): solo il decile alto è informativo (+0,631 contro +0,556).
   La gran parte dell'adiacenza è piatta.
3. **Gli archi deboli non sono sbagliati: sono non misurati.** Il peso è 0 perché quella coppia di
   keyword non co-occorre **nel nostro catalogo**, non perché i cluster siano lontani. Esempi:

| coppia con peso ~0 | vicinanza collaborativa reale |
|---|---|
| northern england ↔ **sheep** | **+0,740** |
| steampunk ↔ business tycoon | +0,633 |
| college graduate ↔ bank heist | +0,479 |
| slaughter ↔ adult humor | +0,457 |

E le coppie forti sono forti davvero: `2nd century ↔ ancient rome` **0,908**, `medieval ↔ knights of the
round table` 0,856, `flight ↔ flight attendant` 0,822.

## Il salto di qualità (tre mosse, in quest'ordine)

**Il teacher diventa la funzione obiettivo del grafo.** Oggi l'adiacenza porta segnale al 63% e
l'ordinamento dei pesi vale l'8,7%: il margine è enorme e tutto dall'altra parte.

1. **Adiacenza appresa** — il peso di ogni arco si *impara* come predizione della vicinanza
   collaborativa fra i due cluster (bersaglio esterno, non PPMI). Feature disponibili a costo zero:
   PPMI, generi condivisi, dimensione dei cluster, similarità lessicale delle keyword, epoca/lingua/paese.
   Poi si ri-audita: **l'AUC deve salire**.
2. **Risoluzione scelta dal teacher** — la res 16 l'ho scelta a mano («276 cluster, mediana 299»). Ora
   il criterio è esterno: si spazza la risoluzione e si tiene quella che **predice meglio la co-visione**.
3. **Inserimento appreso** (l'idea dell'utente) — oggi un film entra nel grafo come somma di nodi
   one-hot. Con l'embedding di nodo (node2vec/deepwalk sul grafo **giusto**) l'inserimento diventa
   appreso. Farlo *dopo* la mossa 1: embeddare un grafo che descrive la realtà all'8,7% è buttar via
   l'idea.

**Conseguenza sul metodo**: il banco del filone (imbuto, coseno) diventa il cancello di *prodotto*;
questo audit è il cancello *strutturale*. Un grafo nuovo deve passare entrambi.
