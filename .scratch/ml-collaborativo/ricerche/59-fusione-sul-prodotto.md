# 59 — La fusione sul prodotto: neutra. E la ricetta si unifica

**La domanda**: il report 58 ha mostrato che la fusione per ranghi (RRF) **raddoppia il @10** sul metro curato. Ma il report 41 diceva «RRF 1,4% sul prodotto». Se fosse vero, la fusione servirebbe solo al ponte cross-medium e non ai due cataloghi — e servirebbero due algoritmi.

**La risposta**: **la fusione sul prodotto è neutra.** Pareggia la camminata su ogni profondità (6,03% contro 6,12% @10; 29,85% contro 29,89% @100) e guadagna **+0,58 al @2000**. Il «1,4%» del report 41 non si riproduce, e la causa è trovata: era un teacher costruito su **un solo seme**.

**La conseguenza**: **una sola ricetta per tutto.** La fusione non costa niente sul prodotto e raddoppia il giudizio esperto.

Script: `rrf-prodotto.py` (335 s). Protocollo del prodotto identico a `ottimizza-1.py`: utenti MovieLens, split 60/40, **catalogo film**, alpha 0,30, 500 utenti di calibrazione.

---

## 1. Il risultato

| | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| **camminata sola** (riferimento) | **6,12%** | **29,89%** | **63,96%** | 88,98% |
| **RRF + comportamento, k=60, pesi 3,0/0,5** | 6,03% | 29,85% | 63,95% | **89,56%** |
| RRF + comportamento, k=60, pesi 1/1 | 5,30% | 26,76% | 59,46% | 87,48% |
| RRF + comportamento, k=60, pesi 0,5/3,0 | 4,56% | 20,34% | 47,94% | 78,06% |
| RRF + comportamento, k=3000, pesi 3,0/0,5 | 5,63% | 28,00% | 63,02% | 89,54% |
| RRF + comportamento, k=20000, pesi 3,0/0,5 | 5,62% | 27,65% | 60,23% | 88,83% |
| RRF + metadati, k=3000 | 2,62% | 26,29% | 63,37% | 88,64% |

**La differenza al @10 è −0,09 punti** (6,03 contro 6,12), cioè dentro il rumore di 500 utenti. **Al @100 −0,04.** Al @2000 la fusione è **+0,58 avanti**.

E si vede la stessa cosa del report 58: **i pesi contano e i metadati non servono.** Con i pesi 1/1 si perde mezzo punto al @10; con i pesi ribaltati (0,5/3,0) se ne perde uno e mezzo. Col teacher dei metadati il @10 dimezza (2,62%).

## 2. Il "1,4% sul prodotto" del report 41: cos'era

Il `twostage.py` del report 41 misurava **solo il curato** — non conteneva nessun test sul prodotto. Quel numero veniva da un altro script, e non si riproduce. Ma l'ipotesi si può testare: nel protocollo curato ogni sorgente è **un titolo solo**, quindi il teacher è la similarità con quell'unico titolo. Sul prodotto un utente ha un **profilo di decine di titoli**, e il teacher va costruito — ed è lì che si sbaglia.

| come si costruisce il teacher | teacher solo @10 | teacher solo @100 | RRF k=60 @10 | RRF k=60 @100 | RRF k=3000 @10 | RRF k=3000 @100 |
|---|---|---|---|---|---|---|
| **centroide del profilo** | **4,33%** | **19,10%** | **6,03%** | **29,85%** | 5,63% | 28,00% |
| massimo sui semi | 3,60% | 14,56% | 6,10% | 29,82% | 5,63% | 27,80% |
| **un seme solo** | 1,69% | 6,71% | 6,00% | 29,82% | **4,03%** | **21,11%** |
| metadati (centroide) | 0,07% | 0,50% | — | — | 2,62% | 26,29% |

**Con un seme solo e `k=3000` la fusione crolla** (4,03% @10, 21,11% @100): il teacher è debole, e con `k` grande la fusione gli dà troppo peso relativo. **Non arriva a 1,4%, ma il meccanismo è quello**: un esperto debole dentro la fusione non si limita a non aiutare, **peggiora**.

**La lezione, che vale come regola**: la fusione per ranghi è **robusta ma non gratuita** — premia l'**accordo** fra gli esperti, quindi se un esperto è cattivo l'accordo porta nella direzione sbagliata. Il teacher va costruito bene (il centroide, non un seme) e va tenuto **sotto** il peso della camminata (3,0 contro 0,5).

## 3. La ricetta si unifica: una sola, per tutto

| metro | camminata sola | **con la fusione** | delta |
|---|---|---|---|
| **prodotto** — catalogo film @10 | 6,12% | 6,03% | −0,09 *(neutro)* |
| **prodotto** — catalogo film @100 | 29,89% | 29,85% | −0,04 *(neutro)* |
| **prodotto** — catalogo film @2000 | 88,98% | **89,56%** | **+0,58** |
| **curato** — @10 | 11,18% | **22,65%** | **2,03×** |
| **curato** — @100 | 26,45% | **39,72%** | **1,50×** |
| **curato** — @500 | 50,00% | **53,09%** | +3,09 |
| **curato** — @2000 | 70,26% | **70,36%** | +0,10 |

**Non c'è più nessun compromesso da sciogliere.** La fusione **domina**: a parità di prodotto, raddoppia il giudizio esperto al @10. Le due ricette che avevo separato (una per il volume, una per la qualità) diventano **una sola**:

```
grafo:  CF×5 · CFst · Kc · B · T  (k-NN 60) + curatela 0,60 · beta 0,50
serving: camminata (alpha 0,30 prodotto · 0,70 curato)
         + fusione per ranghi con il teacher del comportamento (centroide del profilo)
         pesi 3,0 (camminata) / 0,5 (teacher) · k = 60
```

## 4. Cosa resta aperto

1. **La fusione sul catalogo SERIE**: qui è misurata solo sul catalogo film. Sul lato serie il teacher del comportamento ha un problema — `CF` copre 49.041 film e **zero serie** — quindi va costruito via `CFst` (il pubblico previsto). È la prova che dice se la fusione unifica davvero i due cataloghi o solo il lato film.
2. **L'alpha**: il prodotto usa 0,30 e il curato 0,70 — due scelte storiche diverse per due metriche diverse. In produzione l'alpha è uno solo, e va scelto (o reso per-catalogo).
3. **I pesi e il `k` della fusione** vengono dal report 41 (3,0/0,5 e 3000) e non sono stati ritoccati sul grafo nuovo. Qui il `k=60` è **migliore** del 3000 sul prodotto: l'ottimo è cambiato col grafo.
