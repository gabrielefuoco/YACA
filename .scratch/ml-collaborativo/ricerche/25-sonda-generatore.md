# 25 — La sonda: il collaborativo come generatore (verdetto: no) e come lista semplice (sorpresa)

**Data**: 08/10/2026 · 100 account · posizioni collaborative su 85.810 titoli (64 dimensioni, 22 MB)

## La domanda e la previsione dichiarata

La posizione collaborativa oggi è una **feature**: riordina i candidati che il pool e il grafo hanno già
proposto. Può essere un **generatore**: proporre titoli che né il pool né il grafo hanno in lista?

**Previsione dichiarata prima di guardare**: perché l'idea valga la pena, il top-300 collaborativo deve
avere una densità di verità **≥ 2×** quella di un candidato medio (0,89%), cioè **≥ 1,78%**.

## Esito: la previsione passa, e il motivo per cui passa la condanna

| N | densità verità del top-N | controllo (N a caso) | rapporto | NUOVI (fuori dall'universo) | nuovi E giusti | sovrapposizione col 2 hop |
|---|---|---|---|---|---|---|
| 100 | 4,61% | 0,76% | **6,1×** | 12% | 0,12% (1,0% dei nuovi) | **88%** |
| 300 | 3,13% | 0,65% | **4,8×** | 17% | 0,09% (0,5% dei nuovi) | **82%** |
| 1000 | 1,98% | 0,73% | **2,7×** | 28% | 0,11% (0,4% dei nuovi) | **71%** |

| strato | N | densità verità | controllo | rapporto |
|---|---|---|---|---|
| fondo | 100 | 6,16% | 0,82% | 7,5× |
| fondo | 300 | 4,23% | 0,88% | 4,8× |
| resto | 100 | 3,06% | 0,70% | 4,4× |
| resto | 300 | 2,03% | 0,43% | 4,8× |

**Il top-300 ha una densità 4,8× il controllo: la previsione passa.** Ma il fallimento che avevo
dichiarato è esattamente quello che è successo:

1. **L'82-88% dei vicini collaborativi è GIÀ nel 2 hop** (88% a N=100). Lo spazio collaborativo è
   derivato dallo stesso grafo dei film: esprime la stessa informazione in un'altra lingua.
2. **La parte nuova è peggiore del candidato medio**: dei titoli fuori dall'universo, solo lo 0,5% è
   nella verità (contro 0,89% del candidato medio). Come generatore di candidati **nuovi** aggiunge
   diluizione, non valore — come il pool senza filtro.

**Verdetto sul generatore: morto.** E spiega perché la posizione collaborativa è una feature forte:
concentra in 100 numeri lo stesso segnale che il 2 hop porta in 10.000 candidati.

## La sorpresa: da sola, come lista, è forte

Sul fondo la densità a N=100 è 6,16% (7,5× il controllo) mentre il ranker fa 2,8% @50. Allora ho misurato
i vicini collaborativi **da soli, come lista su tutto il catalogo** (nessun ranker, nessun pool, nessun
2 hop: solo il coseno):

| strato | ordinamento | @50 | @200 |
|---|---|---|---|
| tutti | **collab top-N (85.810 titoli)** | **3,9%** | 9,6% |
| tutti | caso (200 dal catalogo) | 0,0% | 0,2% |
| **fondo** | **collab top-N** | **3,5%** | 9,5% |
| fondo | caso | 0,0% | 0,2% |
| resto | collab top-N | 4,3% | 9,7% |
| resto | caso | 0,0% | 0,2% |

Confronto con il ranker (stessi 100 account):

| | ranker (pool filtrato) | ranker (pool intero) | **collab da solo** |
|---|---|---|---|
| tutti @50 | 5,1% | 4,2% | **3,9%** |
| tutti @200 | 16,4% | 14,1% | 9,6% |
| **fondo @50** | 3,3% | 2,8% | **3,5%** |
| resto @50 | 10,0% | 7,5% | 4,3% |

1. **Su tutto il catalogo, senza ranker, il coseno collaborativo prende il 3,9% @50** — l'8% in meno del
   ranker completo (4,2%) e **2-3 volte lo scorer di produzione** (1,2-2,1%). Con 22 MB di numeri e una
   moltiplicazione di matrice.
2. **Sulla nicchia batte il ranker**: 3,5% contro 2,8-3,3% @50. Il ranker vince sul mainstream
   (7,5-10,0% contro 4,3%) e in profondità (@200: 14-16% contro 9,6%).
3. **Quindi il ranker serve per il mainstream, non per la nicchia**: esattamente il contrario di quello
   che tutto il lavoro di oggi sembrava suggerire. Sulla nicchia il segnale collaborativo è *tutto* quello
   che c'è, e un coseno lo estrae meglio di sette feature addestrate.

## Le lezioni

1. **Una densità non dice niente se non è separata in "nuovo" e "già noto"**: la previsione è passata
   (4,8×) e l'idea era comunque morta, perché tutta la densità stava in titoli che il sistema già vedeva.
   Da aggiungere agli errori da non ripetere: *misurare la densità marginale, non la densità*.
2. **La semplicità vince dove il segnale è debole**: sulla nicchia 22 MB di coseno battono 7 feature
   addestrate. Un modello non batte un segnale, lo sfrutta.
3. **Il verdetto sul generatore non cancella la scoperta sulla lista**: sono due usi diversi dello stesso
   oggetto, e il secondo funziona.
