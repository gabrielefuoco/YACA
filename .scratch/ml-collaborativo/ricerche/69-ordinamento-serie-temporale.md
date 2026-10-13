# 69 — L'ordinamento serie in temporale: il verdetto è positivo

**La domanda che decideva tutto**: il report 68 ha mostrato che con lo split temporale **la camminata del catalogo serie perde contro la popolarità** (1,98% contro 2,13% al @10). L'ordinamento del catalogo serie (report 63-65) era misurato in **casuale**, dove il modello faceva 5,23% contro l'attivazione 1,87%. **Con l'oro nel futuro, il modello batte la popolarità?**

**La risposta: sì, e di molto.** 14,2× al @10 e 4,6× al @100. **Il valore del catalogo serie non è nel grafo: è nell'ordinamento.**

Script: `ordine-serie-temporale.py` (295 s). Profilo = il 60% più vecchio, oro = il 40% più recente. 1.062 utenti. Ricetta minima (`CFst`+`B`, `k`=30, `beta`=0,25, senza curatela). Modello addestrato su metà utenti, verificato sull'altra.

---

## 1. I numeri

| catalogo SERIE, split **TEMPORALE** | @10 | @100 | @500 |
|---|---|---|---|
| **popolarità** *(ordina il cesto)* | 0,24% | 3,29% | 25,96% |
| attivazione | 1,18% | 7,98% | 25,96% |
| una sola caratteristica: `covis` | 0,94% | 8,02% | 25,96% |
| una sola caratteristica: `cos_prof` | 0,84% | 7,25% | 25,96% |
| una sola caratteristica: `st_cent` | 0,54% | 5,70% | 25,96% |
| **MODELLO (13 caratteristiche)** | **3,36%** | **15,08%** | 25,96% |
| *oracolo dello stesso cesto* | *11,67%* | *25,96%* | *25,96%* |

| | @10 | @100 |
|---|---|---|
| **modello / popolarità** | **14,2×** | **4,6×** |
| **modello / attivazione** | **2,8×** | **1,9×** |
| modello / oracolo | 28,8% | 58,1% |

**E la doppia lettura**: il modello batte la popolarità **dentro il cesto** (0,24% → 3,36%) **e** batte la popolarità usata come recuperatore sull'intero catalogo (2,13% del report 68 → 3,36%). Vince su entrambi i fronti.

## 2. Cosa vuol dire

**Il report 68 diceva: sul lato serie il grafo non aggiunge niente alla popolarità. Vero — ma il grafo non è dove sta il valore.**

La catena del catalogo serie, valutata onestamente:

| anello | @10 temporale | cosa aggiunge |
|---|---|---|
| popolarità pura | 2,13% | — |
| **il cesto del grafo** | (l'attivazione dentro il cesto: 1,18%) | il grafo **trova** i candidati |
| **l'ordinamento** | **3,36%** | il modello **li ordina**: **+58% sulla popolarità** |

**Il guadagno del catalogo serie è tutto nell'ordinamento**, ed è l'unico pezzo che sopravvive al futuro. Coerente con il report 65, che diceva che il guadagno nasce nel **cesto** e non nel modello — ma in temporale il cesto da solo non basta più, e serve il modello.

**E il grafo allora a cosa serve?** A **restringere** i candidati a 500 da 16.550: è il suo mestiere, e in temporale lo fa meglio della popolarità (l'attivazione al @100 dentro il cesto è 7,98% contro 3,29% della popolarità). Serve, ma non è dove si vince.

## 3. L'adattamento, e il numero da citare

| | @10 | @100 |
|---|---|---|
| modello, calibrazione | 5,80% | 18,18% |
| **modello, verifica** | **3,36%** | **15,08%** |
| perdita | **−42%** | −17% |

**Il modello perde il 42% al @10 fra calibrazione e verifica.** Il banco serie è piccolo (531 utenti per metà) e le caratteristiche sono 13: **c'è adattamento**. Il numero da citare è quello di verifica, e il guadagno regge comunque (2,8× l'attivazione).

## 4. Cosa resta aperto

1. **Il divario calibrazione/verifica del 42%** è troppo. Meno caratteristiche, o più utenti (i fetch in corso lo faranno).
2. **L'ordinamento del catalogo FILM in temporale non è stato misurato.** Il lato film regge al futuro (3,0× la popolarità con `CF` da solo), ma il **modello** dell'ordinamento film è stato tarato in casuale. Va rifatto.
3. **L'ablation, i pesi, `k` e `beta`** sono tutti ottimi misurati in casuale: il report 68 dice che vanno rifatti.
4. **Il grafo conosce il futuro** (è costruito su cronologie complete): i numeri temporali sono **ottimistici**. Un test davvero onesto ricostruisce `CF` a tempo T.
5. **I fetch in corso** (il `related` delle serie, le cronologie complete, i follower) cambieranno `B` e il banco: **tutto va rimisurato quando finiscono**.

## 5. La conclusione per il prodotto, in due righe

**Catalogo film**: il segnale è il comportamento (`CF`), e regge al futuro (3,0× la popolarità). L'ordinamento va ritestato in temporale.

**Catalogo serie**: il grafo **non** batte la popolarità; **l'ordinamento sì, di 14× al @10**. Quindi sul lato serie l'investimento giusto è **l'ordinamento** — più caratteristiche buone, più utenti per addestrarlo, meno adattamento.
