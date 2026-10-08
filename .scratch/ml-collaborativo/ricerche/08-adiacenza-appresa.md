# 08 — L'adiacenza appresa: il grafo smette di essere un'eredità del builder

**Data**: 08/10/2026 · **Script**: `learn-adjacency.py`, `audit-matched.py` · **Output**: `.cache/movielens/l1-adjacency-learned.json`

## Il disegno (e le due accortezze che il catalogo di errori impone)

Il peso di ogni arco L1-L1 non è più "somma di PPMI": è la **predizione della vicinanza collaborativa**
fra i due cluster, cioè del bersaglio che l'audit misura. Le feature sono **tutte ricavabili dal catalogo
e dal grafo** (niente teacher) → l'adiacenza resta una proprietà del grafo e vale anche per le serie.

1. **Split sugli item**: i film di ogni cluster sono divisi a metà. Il bersaglio di addestramento viene
   dalla metà A, la valutazione dalla metà B. Senza, si misura la memoria del modello.
2. **Soffitto di rumore dichiarato prima**: `ρ(bersaglio A, bersaglio B) = +0,692` — è quanto del
   bersaglio è stabile fra due campioni di film. È il tetto di qualunque modello su questo bersaglio.

Materiale: 99.837 coppie (39.837 con arco PPMI + 60.000 negative), 10 feature, 1.338 cluster utilizzabili.

## Cosa predice davvero la vicinanza fra due micro-cluster

| feature | ρ col bersaglio | peso nel modello |
|---|---|---|
| **generi (coseno delle distribuzioni)** | **+0,498** | **+0,442** |
| dimensione dei cluster (log) | +0,252 | +0,095 |
| PPMI (il segnale di oggi) | +0,203 | +0,004 |
| esiste l'arco? (binario) | +0,202 | +0,025 |
| lessico delle keyword (Jaccard) | +0,101 | +0,107 |
| popolarità (log voti) | −0,099 | −0,024 |
| differenza di epoca | −0,083 | −0,204 |
| lingua condivisa | +0,059 | +0,037 |
| rapporto fra dimensioni | +0,017 | −0,008 |
| stesso NSFW | +0,007 | +0,048 |

**La feature dominante è la distribuzione dei generi** (+0,498, quasi il doppio di ogni altra): la
vicinanza fra micro-cluster è in gran parte **forma del genere**, e il grafo delle keyword — costruito
sulla sola co-occorrenza di parole — di questa forma tiene conto solo indirettamente. È esattamente
«l'informazione che le keyword non hanno», ora quantificata.

## Il confronto, su coppie mai viste e bersaglio mai visto

| | Spearman col bersaglio (meta' B) |
|---|---|
| PPMI (oggi) | +0,192 |
| **adiacenza appresa** | **+0,566** |

**+0,566 è l'82% del soffitto (0,692).** Cioè: il modello cattura quasi tutta la parte *stabile* del
bersaglio. Il resto non è recuperabile con questo bersaglio — è rumore di campionamento dei film.

## L'audit esterno

| | vicinanza media | AUC contro caso |
|---|---|---|
| PPMI di oggi | +0,527 | 0,610 |
| **adiacenza appresa** | **+0,565** | **0,677** |
| (a caso) | +0,461 | — |

**Il grafo cambia davvero**: solo il **60%** delle coppie è in comune con l'adiacenza PPMI → 40% di
vicinato nuovo. Non è un ritocco dei pesi, è un grafo diverso.

## Il controllo appaiato per taglia — il verdetto

La feature "dimensione" correla +0,252 col bersaglio e i cluster grandi hanno centroidi più centrali per
costruzione: senza controllo, il vantaggio potrebbe essere taglia travestita da gusto.

| quartile di taglia | coppie | AUC PPMI | **AUC appresa** | vicinanza PPMI | vicinanza appresa |
|---|---|---|---|---|---|
| Q1 (piccoli) | 10.475 | 0,624 | **0,719** | +0,511 | +0,564 |
| Q2 | 10.473 | 0,633 | **0,703** | +0,563 | +0,602 |
| Q3 | 10.475 | 0,638 | **0,697** | +0,591 | +0,625 |
| Q4 (grandi) | 10.472 | 0,628 | **0,679** | +0,613 | +0,643 |
| **media a parità di taglia** | | **0,631** | **0,699** | | |

**Il vantaggio sopravvive (+0,068) e cresce dove conta**: massimo sui cluster **piccoli** (+0,095 in Q1),
minimo sui grandi (+0,051). Se il modello stesse sfruttando la taglia, accadrebbe l'opposto — è la firma
di un guadagno reale.

## Verdetto

1. **L'adiacenza appresa batte quella del builder**: da 0,631 a **0,699** a parità di taglia, validata su
   film e coppie mai viste. È il primo miglioramento del filone misurato **contro la realtà** e non
   contro sé stesso.
2. **Il guadagno è sui cluster piccoli**, quelli dove il gusto si distingue e la popolarità non aiuta.
3. **Il soffitto è dichiarato**: 0,692. Siamo all'82%. Per andare oltre serve un **bersaglio migliore**,
   non un modello migliore.
4. **La leva più grossa è il genere**, non le keyword: l'adiacenza va resa genre-aware. E il genere è
   oggi *assente* dal segnale che l'adiacenza trasporta.

## Cosa manca (i cancelli aperti di questo ticket)

- **Cancello di prodotto (non ancora passato)**: ricostruire il grafo dei film sull'adiacenza appresa e
  rimisurare l'imbuto (2 hop ≥ 5,9% @50 e ≥ 9,2% @200). La struttura migliore deve arrivare alle liste.
- **Node2vec (ticket 09 braccio B)**: ora ha senso — il grafo su cui embeddare descrive la realtà al 70%,
  non al 63%.
- **Le serie restano fuori dal giudizio**: il teacher è film-only, quindi l'adiacenza appresa è
  *validata* solo sui film. Le serie ereditano i pesi (sono proprietà del grafo) ma nessuno li ha
  verificati per loro. Ticket 12 resta il tetto.
