# 68 — Lo split temporale: la misura onesta, e cambia tutto

**Il mandato**: tutte le misure della sessione usano uno **split casuale** — il profilo è un 60% a caso della cronologia, l'oro il 40% rimasto. Ma il prodotto non chiede «cosa ho già visto», chiede **«cosa guarderò dopo»**. E le date c'erano: `last_watched_at` su Trakt (100%) e il `timestamp` in `ratings.csv` (buttato via nella pulizia).

**L'esito**: **passando al futuro, la camminata perde metà del suo valore e il vantaggio sulla popolarità crolla.** Sul catalogo serie, al @10, **la popolarità batte la camminata**. Tutti i numeri della sessione sono gonfiati dallo split casuale.

Script: `temporale.py` (653 s).

---

## 1. I tre banchi, casuale contro temporale

**Trakt — catalogo FILM** (1.052 utenti)

| | @10 | @100 | @500 |
|---|---|---|---|
| camminata, split **casuale** | 4,27% | 20,29% | 43,01% |
| **camminata, split TEMPORALE** | **1,52%** | **10,15%** | **27,09%** |
| popolarità, casuale | 0,91% | 7,61% | 25,65% |
| **popolarità, temporale** | **0,88%** | **7,03%** | **25,01%** |
| **vantaggio della camminata** | **4,7× → 1,7×** | 2,7× → 1,4× | 1,7× → **1,08×** |

**Trakt — catalogo SERIE** (1.052 utenti)

| | @10 | @100 | @500 |
|---|---|---|---|
| camminata, casuale | 3,01% | 18,21% | 45,58% |
| **camminata, temporale** | **1,98%** | **14,06%** | **39,82%** |
| popolarità, casuale | 2,00% | 12,50% | 33,77% |
| **popolarità, temporale** | **2,13%** | **12,51%** | **33,27%** |
| **vantaggio della camminata** | **1,5× → 0,93×** | 1,5× → 1,12× | 1,35× → 1,20× |

**Al @10 la popolarità BATTE la camminata.** Sul catalogo serie, valutato onestamente, **il grafo non aggiunge niente**.

**MovieLens — il prodotto** (997 utenti)

| | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| camminata, casuale | 6,12% | 30,22% | 63,76% | 89,19% |
| **camminata, temporale** | **2,87%** | **18,21%** | **46,14%** | **77,93%** |
| popolarità, casuale | 1,68% | 10,17% | 30,44% | 59,55% |
| **popolarità, temporale** | **0,94%** | **7,36%** | **25,04%** | **53,94%** |
| **vantaggio della camminata** | 3,6× → **3,0×** | 3,0× → **2,5×** | 2,1× → **1,8×** |

**Qui il vantaggio tiene** (3,0× contro 3,6×): il comportamento MovieLens regge al futuro.

## 2. Quanto perde la camminata passando al futuro

| banco | @10 | @100 | @500 |
|---|---|---|---|
| Trakt film — camminata | **−2,75** | **−10,14** | **−15,92** |
| Trakt film — popolarità | −0,03 | −0,58 | −0,65 |
| Trakt serie — camminata | −1,03 | −4,15 | −5,76 |
| Trakt serie — popolarità | **+0,13** | +0,01 | −0,50 |
| MovieLens — camminata | **−3,25** | **−12,01** | **−17,62** |
| MovieLens — popolarità | −0,74 | −2,81 | −5,40 |

**La camminata perde il 50-64% al @10 e il 40-50% al @100. La popolarità non si muove.**

**Perché**: con lo split casuale il 40% di test è **intervallato** al profilo — sono le stesse cose, dello stesso periodo, dello stesso tipo. Il grafo li ritrova per similarità. Con lo split temporale l'oro è **il futuro**, e il futuro è fatto di titoli **nuovi e popolari**, che la similarità col passato non predice.

## 3. Cosa vuol dire per tutto il lavoro fatto

**1. Ogni numero della sessione è gonfiato di 2-3× dallo split casuale.** Non sono falsi — sono misure di una domanda più facile di quella vera. Il fattore di gonfiaggio, misurato: **@10 da 1,7× a 3,6×**, @500 da 1,2× a 2,4×.

**2. Sul lato serie, valutato onestamente, il grafo non aggiunge niente alla popolarità.** Il catalogo serie, il più debole dei due, è anche quello dove tutto l'apparato (`CFst`, `B`, i pesi, la fusione) **non batte "i titoli più visti"**. Al @100 aggiunge il 12%, al @500 il 20%: poco.

**3. Il lato film regge.** MovieLens: 3,0× la popolarità al @10 e 2,5× al @100, con lo split onesto. **Il comportamento è il segnale vero, e l'unico che sopravvive al futuro.** Coerente con l'ablation, che diceva che il catalogo film vuole `CF` e nient'altro.

**4. Le classifiche di componenti vanno rifatte in temporale.** L'ablation (report 66), i pesi (64), `k` e `beta` (67), l'ordinamento (63, 65): **tutti misurati in casuale**. Se il segnale è diverso, anche gli ottimi sono diversi.

**5. E l'ordinamento?** Il modello del catalogo serie (5,23% @10 contro 1,87% dell'attivazione) è un guadagno **relativo all'attivazione**, e l'attivazione in temporale è a 1,98% contro 2,13% della popolarità. **Se il modello non batte la popolarità in temporale, tutto il lavoro sull'ordinamento serie va rivisto.** È la prossima misura da fare.

## 4. Il limite da dichiarare

**Il grafo conosce il futuro.** `CF` è costruito sulle cronologie **complete** di utenti disgiunti — cronologie che arrivano allo stesso periodo dell'oro di test. Quindi il grafo sa già che un titolo è diventato popolare. **Un test temporale vero dovrebbe ricostruire il grafo a tempo T**, e non l'ho fatto: qui ho misurato l'effetto dello split, non l'effetto di un grafo onesto.

**Conseguenza**: il crollo misurato è **un limite inferiore** del crollo vero? No — è il contrario: il grafo che conosce il futuro **aiuta**, quindi i numeri temporali qui sono **ottimistici**. Il crollo vero sarebbe **peggiore**.

## 5. Cosa fare adesso

1. **Rifare l'ordinamento del catalogo serie in temporale** — è la misura che decide se il lavoro sull'ordinamento ha valore. Il modello batte la popolarità, con l'oro nel futuro?
2. **Rifare l'ablation in temporale** — i componenti che reggono cambiano.
3. **Rifare `k` e `beta` in temporale.**
4. **Ricostruire il grafo a tempo T** per un test davvero onesto: si costruisce `CF` solo dalle interazioni prima di T, e si valuta dopo T. È l'unico modo di chiudere il limite del §4.
5. **E la domanda di prodotto**: se la popolarità è così forte, **il grafo a cosa serve?** La risposta misurata è: sul lato film, a battere la popolarità di 2,5-3×; sul lato serie, a niente — **finché non si trova un segnale che il futuro non cancella**.
