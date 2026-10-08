# 14 — L'idea degli embedding appresi: risultato negativo

**Data**: 08/10/2026 · **Script**: `embed-keywords.py` + `fix-puntuali.py` sezione 5 · protocollo pulito (A→B) e cold-start

## L'idea testata (ticket 09, braccio B)

Al posto di 1.982 nodi one-hot (più le feature estese): un **vettore appreso per keyword** e per titolo
la **media** dei suoi. Il grafo per l'embedding è costruito **comportamentale** — keyword nello stesso
micro-cluster + keyword di cluster collegati dall'**adiacenza appresa** (calibrata su MovieLens) — perché
`cosine_f5_t0.75.npz` esiste in cache ma il pickle che ne definisce l'ordine **è assente** (usarlo
sarebbe stato il terzo errore di namespace della giornata).

Embedding: **SVD spettrale** del grafo pesato (1.238.170 archi, grado mediano 216) → 6.125 × 64.
Sanità semantica verificata: `rape → attempted rape · male rape · rape and revenge`,
`racing → car racing · drifting · grand prix`, `superhero → masked superhero · magical girl · precure`.

## Il risultato

| feature | dim | A→B | B→A | cold-start | controllo |
|---|---|---|---|---|---|
| **topoi one-hot (oggi)** | 5.842 | **0,362** | 0,357 | **0,494** | 0,507 |
| **EMBEDDING appresi** | 64 | **0,227** | 0,204 | 0,303 | 0,306 |
| one-hot + embedding | 5.906 | 0,363 | 0,357 | 0,494 | 0,507 |

1. **Gli embedding da soli valgono il banale**: 0,227 contro i 0,224 del vettore medio. Cioè: **non
   portano quasi nulla.**
2. **Aggiunti alle feature one-hot non cambiano niente** (0,362 → 0,363, cold-start identico): la loro
   informazione è **già contenuta** nei topoi — com'è ovvio, perché sono una *compressione* dello stesso
   grafo.
3. **L'ipotesi dichiarata prima è falsificata**: prevedevo che l'embedding generalizzasse *meglio*
   (feature dense e levigate), soprattutto sul cold-start. È **peggiore ovunque** (0,303 contro 0,494),
   e senza alcun margine sul proprio controllo (0,303 vs 0,306).

## Perché (due cause, entrambe strutturali)

1. **La media uccide l'informazione**: un film ha ~15 keyword, e la loro media in 64 dimensioni è un
   *bag-of-embeddings* — una sintesi molto lossy. Il one-hot tiene le singole keyword e lascia che il
   Ridge pesi ciascuna: con 40.000 film di addestramento, la rappresentazione sparsa è **più
   informativa** di una media densa.
2. **Lo spettro del grafo è piatto**: le prime 5 componenti spiegano solo il 13% della varianza
   spettrale (un grafo denso con grado mediano 216 è quasi completo). Un embedding così è poco
   discriminante: ecco il 0,227 ≈ banale.

## Lo scope della falsificazione (onestà)

- Ho usato l'**SVD spettrale**, non node2vec vero (gensim non installato). node2vec campiona cammini
  casuali e cattura struttura di ordine superiore: *potrebbe* fare meglio. Ma **il collo di bottiglia
  della media resterebbe** — e la causa 2 (grafo quasi completo) non cambierebbe.
- La versione "giusta" dell'idea sarebbe un vettore per keyword *concatenato* invece che mediato: ma
  quella è una riparametrizzazione del one-hot, non un guadagno.

## Cosa significa

**La rappresentazione non è il collo di bottiglia.** I topoi one-hot sono già la rappresentazione
giusta per questo compito, e il margine residuo (56% → 100% del soffitto) **non** si recupera cambiando
come descriviamo i film. Si recupera — se mai — cambiando *cosa* chiediamo al modello o *come* lo
valutiamo.

È coerente con tutto il resto della giornata: il modello è a metà del massimo, la struttura è stata
misurata e migliorata, e **il pezzo debole resta il ranker** — dove la popolarità batte lo scorer.
