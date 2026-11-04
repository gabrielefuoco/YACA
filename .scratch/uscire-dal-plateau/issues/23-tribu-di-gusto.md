Status: resolved
Type: task

# Tribù di gusto: il pubblico di nicchia dei film evento

## Perché

Un film evento come *Barbie* è visto da due popolazioni disgiunte: l'85% generalista (che guarda anche
*Pinocchio*, *La sirenetta*, *Avengers*) e il 15% cinefilo (che guarda *Povere creature!*, *The
Substance*, *The Love Witch*). La co-visione somma su tutti: la maggioranza schiaccia la minoranza.
Fattorizzando utenti×film in 64 segmenti di gusto, buttando i 4 più correlati alla popolarità e tenendo
per ogni film solo le sue 3 tribù più specifiche, la minoranza non viene mediata via.

## Cosa è stato fatto

`services/graph_dense/tribu_gusto.py`: SVD su utenti×film (pesi `1/sqrt(k_u)` e `freq^-0.65`),
64 segmenti, 4 buttati per correlazione con `log1p(voti)`, top-3 tribù per film, coseno top-100.
**2.767.000 archi · 36,2% del canone coperto.**

## Esito

Riga grezza di *Barbie*: *Harry Potter 20° anniversario · Wunderschön · King Richard · La parola ai
giurati · Palm Springs · Ocean's 8* — affinità comportamentale, non tono.

Nel grafo (V28, peso 1,0) sul dev set: `R@20 0,037` contro `0,043`, **−0,0058**; R@5 e R@10 migliori
(0,010 e 0,020 contro 0,008 e 0,017), MRR migliore, ma R@20/R@50 peggiori e quota >5k da 66,5% a 68,5%.

**Verdetto**: la segmentazione funziona come idea (il pubblico di nicchia emerge) ma ciò che emerge è
«persone con gusti simili hanno visto», non «film dello stesso tono». Migliora la testa della lista,
peggiora la coda: la tribù di nicchia di un blockbuster è comunque fatta di altri titoli visti.
