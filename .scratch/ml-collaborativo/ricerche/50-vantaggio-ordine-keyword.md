# 50 — Da dove viene il vantaggio, come si legge il @100, e le keyword come aggancio

Tre misure, ognuna su una domanda dell'utente. Script: `ordine-e-causa.py` (1.283 s), `titoli-nuovi.py` (696 s).

---

## 1. «Da dove derivano i vantaggi» — dal comportamento, e le keyword per ora sottraggono

Verifica, 1.000 utenti, grafo con massa non-curatela 0,40 divisa equamente e curatela 0,60.

| grafo | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| solo KEYWORD pulite (Kc+B+T+K) | 0,11% | 5,73% | 23,54% | 50,96% |
| **solo COMPORTAMENTO (CF+B+T+K)** | **0,65%** | **17,93%** | **53,16%** | **79,45%** |
| solo co-visione (B+T+K) | 0,07% | 5,66% | 24,25% | 51,43% |
| KEYWORD + COMPORTAMENTO | 0,59% | 16,19% | 49,37% | 77,12% |
| TUTTO tranne i temi (Kc+CF+B+K) | 0,67% | 17,40% | 51,03% | 79,27% |
| Pc contaminato (riferimento di ieri) | — | 12,56% | 42,12% | 70,41% |

**Il comportamento da solo batte ogni combinazione.** E non solo: il grafo attuale (contaminato) sta sotto il comportamento pulito su tutte le misure.

**Le keyword, aggiunte al comportamento, peggiorano** (17,93 → 16,19 a @100; 53,16 → 49,37 a @500). È la stessa regola del report 41 che si ripete: un componente più debole, fuso, trascina giù. **Ma questa misura vede solo film che hanno già comportamento** — e non è la popolazione di cui parla l'utente (§3).

**Sul grafo delle keyword nella ricetta finale: sì, c'è** (`Kc`, con peso 0,10 di 0,40). La misura sopra dice che per i film con comportamento **sottrae**. Non è però una ragione per toglierlo (§3).

## 2. «Il @100 è poco» — è ordinamento, e vale 3,5 volte

**Prima il chiarimento**: @100 è il **top-100 di una lista ordinata** su 66.259 candidati — non 100 cluster. La misura è il **recall**: quanti dei film che l'utente ha davvero visto (≈63 in media) finiscono nei primi 100.

Stesso cesto (il top-2000 dell'attivazione), quattro ordinamenti:

| ordinamento dello stesso top-2000 | @10 | **@100** | @500 | @2000 |
|---|---|---|---|---|
| attivazione (com'è ora) | 0,59% | 16,19% | 49,37% | 77,12% |
| popolarità | 2,60% | 15,58% | 43,39% | 77,12% |
| **misto attivazione + popolarità** | **3,89%** | **21,62%** | **53,19%** | 77,12% |
| **ORACOLO (ordine perfetto del cesto)** | **14,86%** | **57,13%** | **76,56%** | 77,12% |

Il cesto contiene **il 77,23% dei film veri** (in media per utente). Con un ordinamento perfetto finirebbero tutti nelle prime cento posizioni: **@100 = 57,13%**. Oggi ne prendiamo il 16,19%.

**Il divario è 3,5× al @100 e 25× al @10, ed è tutto ordinamento — non grafo.** E un misto di ranghi banale (attivazione + popolarità) ne recupera già un terzo: **+5,4 punti al @100, +6,6× al @10**.

Sul bersaglio «@2000 almeno al 95%»: oggi 77,12%. Il limite non è l'ordinamento (l'oracolo dà 77,12% anche lui) ma **cosa c'è nel cesto**: il restante 23% dei film veri non entra nel top-2000. Va misurato a quale N il recall arriva al 95% — è un'altra misura, non ancora fatta.

## 3. «Le keyword sono l'unico indicatore per chi non ha comportamento» — confermato, ma l'aggancio è spuntato

La misura precedente non poteva rispondere: il gold di MovieLens è fatto di film che MovieLens conosce, quindi **ogni film valutato ha comportamento**. Qui si simula un titolo nuovo per davvero.

5.000 film **con** comportamento: si cancellano loro CF, co-visione **e** curatela (un titolo nuovo non li ha) e restano loro **keyword e temi** — che si derivano dai metadati, e un titolo nuovo li ha.

| grafo | NUOVI @10 | NUOVI @100 | NUOVI @500 | NUOVI @2000 | nativi @500 |
|---|---|---|---|---|---|
| **tutti nativi (riferimento)** | 0,49% | **13,63%** | **45,95%** | **74,90%** | 49,71% |
| **5.000 fatti nascere · con keyword** | 0,00% | **0,61%** | **3,92%** | **15,61%** | 49,16% |
| 5.000 fatti nascere · **senza keyword** | 0,00% | 0,24% | 1,92% | 7,95% | 52,12% |

**Due letture, entrambe nette.**

1. **Le keyword sono l'aggancio, e sono l'unico**: senza di esse un titolo nuovo dimezza (3,92% → 1,92% @500, 15,61% → 7,95% @2000). La tesi dell'utente è **confermata in direzione**.
2. **Ma l'aggancio è spuntato**: lo stesso film, nativo, fa **45,95%** @500; fatto nascere, **3,92%**. **Un fattore 12.** «Ancorarsi a un cluster che ha già il suo storico» oggi recupera **un dodicesimo** di quello che serve. La tesi è **smentita in magnitudine**.

E la colonna dei nativi chiude il cerchio: nel grafo *senza* keyword i film nativi vanno **meglio** (52,12% contro 49,16%), mentre i nuovi vanno **la metà**. Cioè: **le keyword servono esattamente e soltanto a chi non ha comportamento, e per gli altri sono zavorra.** Questo è il motivo per cui non si tolgono, e il motivo per cui vanno migliorate.

## 4. Perché il contrastive è la mossa giusta (idea dell'utente)

Il difetto sta in **come** le keyword sono state mappate sul comportamento:

```python
Pc = Ridge(alpha=30).fit(FX, Zs).predict(FX)
```

Un Ridge minimizza l'**errore quadratico**. Il minimizzatore dell'errore quadratico è la **media condizionale**: per ogni configurazione di keyword, il Ridge predice il *baricentro* dei comportamenti compatibili. È un operatore di **lisciatura** — e infatti la correlazione fra quello spazio e le keyword pure è 0,169, e la sua capacità è tutta rivenduta dal comportamento.

**Un obiettivo contrastivo (InfoNCE) chiede un'altra cosa**: non «riproduci le coordinate giuste», ma «il bersaglio giusto deve stare *sopra* quelli sbagliati». Non c'è una media da indovinare, c'è un **ordine** da rispettare. Un encoder addestrato così:

- non collassa sul baricentro, quindi **conserva le direzioni che discriminano**;
- mappa le keyword di una serie nello stesso spazio del comportamento dei film, quindi **il ponte cross-medium diventa selettivo** invece che indiscriminato (i 200.727 archi dei temi oggi azzeccano solo ogni tanto);
- dà a un titolo nuovo una posizione **precisa** invece di un quartiere — che è esattamente il fattore 12 misurato sopra.

**Il disegno concreto**:
```
encoder  f : TF-IDF(7.934) -> 128   (MLP 2 strati)
bersaglio c_i : il vettore CF del film i (cf-spazio.npz), oppure i suoi top-k vicini CF
perdita : InfoNCE  -log  exp(sim(f(x_i), c_i)/τ) / Σ_j exp(sim(f(x_i), c_j)/τ)
dati    : i 49.041 film che hanno comportamento (negativi in-batch)
poi     : f applicata a TUTTE le keyword -> le 16.550 serie ricevono una posizione
```
**Le tre misure con cui si giudica sono già in piedi**: il test dei titoli nuovi (§3, oggi 15,61% @2000 con keyword, il riferimento nativo è 74,90%), l'inserimento del report 47 (oggi 47° percentile), e il recupero del grafo (report 49).

## 5. Stato della ricetta

```
CF   comportamento dichiarato (utenti disgiunti)     k-NN 15    <- è lui che porta il guadagno
Kc   keyword pulite                                  k-NN 15    <- zavorra per i nativi, unico aggancio per i nuovi
B    co-visione Trakt                                k-NN 15
T    temi                                            k-NN 15
K    curatela (metà pari)                            peso 0,60
CFst studente Ridge                                  ESCLUSO: diluisce
```
Il prossimo passo è **rifare `Kc` con un encoder contrastivo**, e misurarlo sulle tre cose che oggi sono in piedi: titoli nuovi, inserimento, recupero.
