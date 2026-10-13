# 48 — Il componente "contenuto" del grafo non è contenuto: è comportamento MovieLens

**Trovato per caso, verificato in `contaminazione.py`, e vale più di tutte le ottimizzazioni che stavo per fare.**

## 1. Che cos'è davvero `Pc`

In `spazi-trakt.py`, righe 84-105 e 250-255:

```python
X  = csr_matrix(...)          # matrice utente × film di MOVIELENS (31,6M voti, 200.948 utenti)
Xw = X.multiply(1/log1p(c_i))
U, S, Vt = svds(Xw, k=64)
Zs = Vt.T / norma            # embedding dei FILM nello spazio della co-occorrenza MovieLens
...
Yc[i] = Zs[row_svd[tmdb2mid[cat["id"][i]]]]     # il bersaglio: il posto del film in quello spazio
Pc = Ridge(alpha=30).fit(FX[trs], Yc[trs]).predict(FX)   # le KEYWORD addestrate a predirlo
```

**`Pc` è un Ridge che impara a predire la co-occorrenza MovieLens a partire dalle keyword.** Non è "contenuto": è contenuto **piegato dal comportamento**, come il report 41 aveva già intuito a proposito di `film-emb.npz` («non è semantica: i suoi archi vengono dall'adiacenza appresa da MovieLens»).

E `boot-C.npz` — **1,6 milioni di archi, il componente più grande del grafo** — è il k-NN di quello spazio.

## 2. Quanto pesa

Lo spazio pulito si costruisce dal TF-IDF delle keyword (`spazi-trakt-tfidf.npz`, 66.259 × 7.934, nessun MovieLens dentro), SVD a 128 componenti (48,8% di varianza), centrato per medium. **Correlazione fra le due matrici di similarità: 0,169** — sono quasi due cose diverse.

Poi tutto identico: stessi co-visione, temi, curatela, stesso protocollo (1.000 utenti MovieLens, split 60/40, attivazione alpha 0,30).

| grafo | @10 | @50 | @100 | @500 | @2000 | testa riordinata per popolarità @10 |
|---|---|---|---|---|---|---|
| **Pc (contaminato, l'attuale)** | 0,25% | 4,55% | 11,40% | **39,21%** | **68,45%** | **2,89%** |
| **spazio pulito (solo keyword)** | 0,11% | 1,92% | 5,26% | **22,86%** | **51,05%** | 2,23% |

**Il contenuto contaminato vale 1,72× a @500 e 1,34× a @2000.** Metà del potere di recupero che ho misurato in tutta la sessione non viene dal contenuto: viene dalla struttura di co-occorrenza di MovieLens, che è **la stessa cosa su cui misuro**.

## 3. Cosa significa esattamente (e cosa no)

Va detto con precisione, perché è facile esagerare in entrambe le direzioni.

**È un leak, in senso stretto?** Gli utenti valutati (1.000) sono un sottoinsieme dei 200.948 che hanno costruito l'SVD. Il loro contributo a 64 componenti su 200.948 utenti è trascurabile, quindi il leak **non è "il modello ha visto le risposte dell'utente X"**. È un leak **di popolazione**: le keyword di un film sono state mappate sul *pubblico* di quel film.

**Ma le conseguenze pratiche sono tre, e sono serie:**

1. **La frase del report 41 non è più sostenibile.** «Il contenuto trova il quartiere, non l'indirizzo (68,6% @10.000, 2,8% @10)» — quel 68,6% *è* la co-occorrenza MovieLens recuperata. Il contenuto puro trova il quartiere molto meno: **51,05% @2000 contro 68,45%**.
2. **Tutte le conclusioni del filone "contenuto" vanno rilette.** L'ablation, la curva di recall, il ruolo "generatore di candidati, non ranker". Il ruolo resta (il recupero è comunque il pezzo buono), ma **il merito non è del contenuto**.
3. **Il ponte cross-medium si regge su una predizione di comportamento.** Per le 16.550 serie `Pc` non ha alcun dato MovieLens: è il Ridge che *estrapola* alle serie una mappa keyword → pubblico, imparata solo sui film. Gli archi di contenuto cross-medium (6%, 48.168 archi) non sono "serie e film con le stesse keyword": sono "serie a cui il modello attribuisce il pubblico dei film". **È una previsione, non un contenuto** — ed è la ragione per cui esistono.

E una cosa che **non** significa: che il grafo sia da buttare. Significa che il grafo **contiene già collaborative filtering**, in forma implicita e non dichiarata. Se il segnale comportamentale serve (e serve: 1,72×), va messo dentro **come tale**, con un tipo di arco dichiarato e costruito su utenti **disgiunti** da quelli di valutazione.

## 4. Cosa ne segue per "il grafo migliore possibile"

Il programma diventa chiaro, e onesto:

1. **Contenuto pulito**: gli archi di contenuto dallo spazio delle keyword, senza MovieLens dentro. E' l'unico modo per sapere quanto vale il *contenuto* davvero (22,86% @500).
2. **Comportamento esplicito**: un tipo di arco di co-occorrenza (PPMI) costruito sui 199.948 utenti **non** valutati. È la versione legittima di quello che `Pc` fa di nascosto, e con il vantaggio di essere misurabile in ablazione.
3. **Il resto invariato**: co-visione Trakt, temi (puliti: tassonomia scritta a mano), curatela.
4. **Ottimizzare la composizione** su una metrica che dichiara il suo scopo: il **recupero** (@500-2000), perché l'ordinamento della testa è un pezzo separato (report 47: popolarità, 12×).

Il passo 2 è anche quello che risponde al requisito dell'utente: un titolo nuovo ha le keyword (contenuto pulito) **e** nessun comportamento — ma la mappa keyword → pubblico, imparata sui 199.948 utenti non valutati, gli dà il pubblico *previsto*. È l'inserimento del report 47, ma con la parte comportamentale dichiarata invece che nascosta in `Pc`.

## 5. Numeri riproducibili

`contaminazione.py` (357 s) · cache dello spazio pulito in `.cache/movielens/spazio-pulito.npz`.
Sorgente della contaminazione: `spazi-trakt.py` righe 84-105 (Zs) e 250-255 (Pc).
