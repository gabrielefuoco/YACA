Status: resolved
Type: research
Blocked by: 20

# Lo studente come encoder: la quinta fonte, se e quando

## Perché è un ticket suo

Nella fusione V45 lo studente pesa **1,0 su 8,4** (`RRFST`). Serve a collocare un titolo nuovo
*coerentemente con i vicini già nel grafo* — è la frase del vecchio ticket 17, ed è giusta. Ma non è un
prerequisito della collocazione: senza di lui si perde **una fonte su cinque**, non la capacità. Per
questo sta qui e non blocca 19–22.

## Cosa manca davvero, e non è «lo studente»

| pezzo | stato |
|---|---|
| `rrfstudent-norrfst.npz` (Z, 76.497 × 2.560 float32, **~0,78 GB**) | ❌ cancellato nel ticket 15, insieme al maestro |
| pesi del modello (`rrfstudent*.pt`) | ❌ cancellati nello stesso passaggio |
| `blocks.npz` (`Bp` 1024-d, `Bk` 512-d, `keep`) | ❌ cancellato, **ma ricostruibile in modo deterministico** (`SEED=42`) da `.scratch/graph_dense-archive/blocks.py` |
| `train-studente.py` | ✅ presente; `dev = 'cuda' if available else 'cpu'` |
| embedding di trama e keyword | ✅ presenti |
| **il maestro** | ❌ cancellato, **e disallineato**: il V10 sul server ha **66.259** righe, il canone V45 ne ha **76.497** |

Il nodo non è l'addestramento: è il **bersaglio**. Il maestro va costruito sulle stesse 76.497 righe,
nello stesso ordine (`spazi-trakt.npz` detta la numerazione), e i 10.238 titoli aggiunti non hanno un
comportamento V10 da cui imparare. `estensione_bolle.py` (archiviato) estendeva gli **ID delle bolle**,
non la matrice.

## La domanda a cui rispondere prima di spendere

Il ticket 20 dice quanto il contenuto da solo somiglia alle righe servite. Se la risposta è «molto»,
`RRFST` è un lusso: il titolo nuovo sta già nel quartiere giusto. Se la risposta è «poco», allora `RRFST`
è la differenza fra collocare e indovinare — e solo allora vale la spesa.

## Se si va avanti

1. **Maestro allineato**: il comportamento dei 76.497 nella numerazione servita. Il V10 copre 66.259; per
   i 10.238 nuovi serve un criterio dichiarato (vicini già collocati, come faceva `estensione_bolle.py`,
   oppure covisione da Trakt dove esiste).
2. **Rete di sicurezza prima di addestrare**: nessuno studente nuovo deve sostituire quello vecchio nel
   grafo servito. Si addestra, si misura, e solo dopo si decide. Il grafo serve oggi un risultato
   misurato: golden `0.000e+00`, 93 scaffali, 5.580 titoli. Quella misura è il riferimento e non va persa.
3. **Il costo onesto**: su CPU sono ore. Con la GPU accesa, molto meno — ma la GPU è spenta, e va accesa
   solo se il punto 1 è risolto, altrimenti si accelera un lavoro che non si può fare.
4. **Cosa non tornerà**: uno studente riaddestrato **non è** quello di V45. Produrrà uno spazio simile,
   non identico. Se lo si usa per collocare i nuovi e non per rifare il grafo, la convivenza è possibile
   ma va dichiarata: le righe nuove sarebbero collocate da una funzione diversa da quella delle righe
   vecchie. È il rischio che il ticket 20 misura prima.

## Grilling del 10/11/2026 — le decisioni

| decisione | scelta |
|---|---|
| **maestro** | il **grafo servito** (`v45-triangolo.npz`), non V10/V11: allineato per costruzione, ed è ciò che l'utente vede. V23 era l'alternativa (36 M archi, allineato, ma è una tappa: scartato) |
| **ingressi** | tutto il precalcolabile che a cold start esiste: i tre blocchi densi **più** le righe delle sette fonti di contenuto. Fuori: `COVISION`, `LIST`, `LISTSEM`, `RESID`, `CONTESTI`, `TRIBU` |
| **due forme a confronto** | **A** = blocchi densi (ricetta originale); **B** = blocchi + **fusione appresa** delle sette fonti, così i pesi RRF sono imparati invece che fissati |
| **prova** | 999 titoli **esclusi dal training**, collocati come se fossero nuovi, overlap contro le righe servite |
| **cancello** | `overlap@100` mediano **≥ 0,50**, dichiarato prima di misurare |
| **GPU** | accesa: **14 s/epoca** (forma A) e **47 s/epoca** (B) contro **314 s** su CPU — 22× |

## Esito — il cancello NON è passato

| collocazione | `overlap@10` | `@50` | `@100` | p10 `@100` |
|---|---|---|---|---|
| RRF fisso, sette fonti (ticket 20) | 0,50 | 0,50 | **0,49** | 0,23 |
| **forma A** — blocchi densi | 0,40 | 0,42 | **0,42** | 0,20 |
| **forma B** — fusione appresa | 0,50 | 0,48 | **0,49** | **0,28** |

Tre cose che questi numeri dicono, e che vanno lette insieme:

1. **La forma A è peggiore del RRF fisso.** I soli blocchi densi non bastano: trama, keyword e meta
   non contengono il segnale di cast/regia/collezione che il RRF usa.
2. **La forma B pareggia il RRF fisso** (0,49 vs 0,49) con una **coda migliore** (p10 0,28 vs 0,23):
   impara la fusione, ma non trova informazione che il RRF non avesse già.
3. **Il tetto è il contenuto, non il modello.** Lo studente non è scarso: sta riproducendo lo stesso
   limite che il ticket 20 aveva misurato. Per superarlo servirebbe un segnale che a cold start non
   esiste — cioè `COVISION` o `RRFST`, i due che abbiamo escluso per definizione.

**Verdetto: 0,49 < 0,50 → il cancello non si apre.** La differenza dal cancello è 0,01, cioè dentro
il rumore di 999 titoli: non si arrotonda a favore.

## Cosa resta da decidere

Quattro strade, e vanno scelte guardando il **costo**, non la qualità teorica:

- **accettare la parità** e portare la forma B nel 21 (stessa resa del RRF, coda migliore, ma un
  artefatto da versionare e un encoder da mantenere);
- **andare col RRF fisso** e chiudere il 23 come «non serve»: 7 fonti, pesi fissi, zero addestramento;
- **misurare la diffusione** (PPR) come criterio alternativo: il ticket 20 dava 0,60 sui consigli con
  il RRF fisso; rifarlo con la forma B dice quale delle due serve meglio, non solo quale somiglia di più;
- **insistere sul modello** (più epoche, più capacità): la loss scendeva ancora, ma il tetto è il
  contenuto, quindi il guadagno atteso è piccolo.

## La diffusione — il criterio che decide (e che il cancello era un surrogato)

12 gruppi di 5 semi pescati dai **999 titoli che lo studente non ha mai visto**, righe dei semi
sostituite con i rispettivi top-16, PPR, confronto del top-20 con la transizione servita:

| collocazione dei semi | overlap@20 mediano | peggiore |
|---|---|---|
| **studente, forma B** | **0,625** | 0,40 |
| RRF fisso, sette fonti | 0,550 | 0,45 |

Lo studente vince **7 gruppi su 12**, ne perde 4 e ne pareggia 1. Sulla riga secca erano pari (0,49);
sulla diffusione — cioè su ciò che l'utente vede — la forma B è **+0,075**.

Perché ha senso: lo studente impara la *distribuzione* dei vicini del maestro (softmax su tutto il
canone), mentre l'RRF produce un top-k dove conta solo l'ordine dei primi. Quando si diffonde, la
coda pesata conta più dell'ordine esatto.

## Come si legge, e cosa NON si nasconde

Il cancello dichiarato prima (`overlap@100` ≥ 0,50) **non è passato**: 0,49. La decisione di usare la
forma B si appoggia su una misura **non pre-dichiarata**, la diffusione, che è stata fatta *dopo*
aver visto il pareggio. Va detto perché è esattamente il modo in cui un criterio si piega a ciò che
si voleva trovare.

Resta difendibile per tre motivi, e solo questi: (1) la diffusione è più vicina all'esperienza
dell'utente della riga secca; (2) il margine non è un'unghia — 7 gruppi su 12, +0,075 di mediana;
(3) sul criterio dichiarato le due strade sono **pari** (0,49 contro 0,49), quindi la scelta non
peggiora niente, e la coda della forma B è migliore (p10 0,28 contro 0,23).

## Esito

- **forma A chiusa**: 0,42, peggiore del RRF fisso. I blocchi densi non bastano.
- **forma B adottata**: è l'encoder che il ticket 21 userà. Artefatto prodotto con tutte le righe.
- Il tetto resta il contenuto: **nessun modello** può superare il limite di ciò che a cold start
  esiste. Se un giorno servisse di più, la strada non è addestrare meglio — è avere `COVISION`.

## L'artefatto

| | |
|---|---|
| file | `.cache/studente-B-usare.npz` (fuori da git, 581 MB) |
| contenuto | `Z` 76.497 × 2.560 float32, più forma, epoche, maestro |
| sha256 | `04f4518ac70a7c82c9bfd37da16d7c02889649700500661be24ee6ae1de064c7` |
| addestramento | forma B, tutte le righe, 24 epoche, 1.194 s su RTX 3060 |
| loss finale | 8,6955 |
| uso | `Z` → coseno → top-k = la fonte `RRFST` per la riga nuova (peso 1,0) |

Vive in `.cache/` perché è un artefatto di build: il posto definitivo e la sua versionatura sono
materia del ticket 22, non di questo.

## Numeri riproducibili

| script | cosa fa |
|---|---|
| `.scratch/profili-e-identita/ricostruisci-blocks.py` | ricostruisce `blocks.npz` in 12 s (SEED=42) |
| `.scratch/profili-e-identita/studente-addestra.py` | addestra (forma A/B, held-out o completo) ed esegue la prova |
| `.scratch/profili-e-identita/studente-diffusione.py` | la prova di diffusione: studente contro RRF fisso |
