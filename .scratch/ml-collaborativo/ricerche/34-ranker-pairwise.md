# 34 — Il ranker pairwise: la classe del modello NON e' il collo di bottiglia (questione chiusa)

**Data**: 08/10/2026 · GBM (HistGradientBoosting, 300 alberi) su 17 feature di coppia precalcolate ·
training 120.000 coppie positive dalla co-visione MovieLens + 120.000 negative · test sul metro curato

## Prima: il tempo. Era il mio codice, non l'hardware

| | prima | ora |
|---|---|---|
| una iterazione | **~60 min** | **1 min 23 s** |

Tre cause, nessuna delle quali e' la GPU:
1. **`feats(i, [j])` chiamata una volta per coppia** (120.000 chiamate, ognuna con slicing di matrici
   sparse) -> vettorizzata su tutte le coppie in un colpo
2. **`X[:, col]` su matrice CSR** (O(nnz) per chiamata) chiamata 50.348 volte -> CSC + indici diretti
3. **timeout a 3300 s**: un bug costava 55 minuti prima di essere visibile -> ora 600 s

La GPU avrebbe aiutato solo l`svds`, che e' ~10% del tempo. **Il collo di bottiglia era il codice
per-elemento, non l'algebra lineare.**

## Il risultato del ranker

| | p3@10 (tutto il set) | p2@20 | verifica p3@10 | PUNTEGGIO verifica |
|---|---|---|---|---|
| **GBM con popolarita'** | 7,9% | 7,0% | 9,5% | 15,1 |
| **GBM senza popolarita'** | 5,3% | 9,3% | 9,5% | 4,0 |
| **la fusione (baseline)** | **50,0%** | **34,9%** | **57,1%** | **84,9** |

**Un modello piu' grosso sul bersaglio sbagliato e' PEGGIORE, non neutro.**

## Perche': l'importanza delle feature lo dice

| feature | importanza (permutazione) |
|---|---|
| **voti_cand** | **+0,4170** |
| n_keyword | +0,1370 |
| cos_comportamento | +0,1019 |
| diff_durata | +0,0122 |
| ... | ... |
| cos_contenuto | +0,0050 |

**`voti_cand` da sola vale tre volte la seconda**: il GBM ha imparato "ordina i film popolari", che e'
esattamente cio' che la co-visione MovieLens insegna (i voti sono iper-concentrati sui film popolari).
Togliendola, le importanze si riequilibrano (cos_feature, cos_comportamento, topoi_comuni) ma il
risultato resta disastroso: **il problema non e' quella feature, e' il bersaglio.**

## La conclusione che chiude la questione

La previsione dichiarata prima del test era:

| | se il collo di bottiglia e' IL MODELLO | se e' L'INFORMAZIONE |
|---|---|---|
| GBM sulle coppie | batte la fusione sul set curato | batte sul co-watch, NON sul curato |

**E' il secondo caso, in modo netto.** La classe del modello e' chiusa: nessun modello, per quanto
grosso, addestrato sulla co-visione produrra' la somiglianza che vogliamo — **perche' quella
somiglianza non e' nella co-visione.** Misurato: la co-visione e i related di Trakt hanno un Jaccard
del **3,2%**, e il set curato sta dalla parte di Trakt.

## Cosa serve, allora

Un modello grosso serve **solo con un bersaglio grosso della natura giusta**. Oggi abbiamo:
- un bersaglio grosso della natura SBAGLIATA (la co-visione: milioni di coppie, ma mainstream)
- un bersaglio della natura GIUSTA ma piccolo (il set curato: 87 collegamenti; Trakt: 79 film x 17)

**L'unico modo per far funzionare un modello grosso e' rendere grande il bersaglio giusto**: i
"related" di Trakt su scala (5.000-8.000 film/serie, ~30-40 minuti di fetch con cache), che sono
**la stessa fonte che abbiamo misurato 4 volte piu' vicina al nostro set curato della co-visione**.

## Previsione dichiarata per il prossimo test

Un GBM addestrato sui **related di Trakt** (bersaglio grosso e della natura giusta) **batte la fusione
sul metro curato**. Se non lo fa, la classe del modello e' chiusa per sempre anche con il bersaglio
giusto, e restera' solo il lavoro sulle feature.

## Nota di metodo

L'iterazione ora costa 1 minuto e mezzo: **20 iterazioni nel tempo che prima ne costava una.** Le tre
correzioni (vettorizzare, CSC, timeout corti) valgono piu' di qualunque GPU.
