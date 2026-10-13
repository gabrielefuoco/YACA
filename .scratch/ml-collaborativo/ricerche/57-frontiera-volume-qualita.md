# 57 — La frontiera fra volume e qualità esperta

**Il mandato**: ottimizzare il grafo per il **metro curato** — l'unico obiettivo mai usato come bersaglio — e consegnare la **frontiera** fra volume (prodotto) e qualità esperta (i legami che un intenditore scriverebbe), così che la scelta sia dell'utente e non mia.

**L'esito**: la frontiera esiste, è **piatta fino a un ginocchio e poi precipita**, e l'**asse di scambio è il peso della curatela**. C'è un punto che compra **+1,0 punto di qualità esperta per −0,6 di volume**, e un altro che per **+0,4** di qualità ne paga **11,6**.

Script: `ottimizza-1.py` con `frontiera.json` (4.816 s, 15 configurazioni). k=60, β=0,50 fissi; 200 utenti di prodotto (il curato costa 5 secondi).

---

## 1. La frontiera

| configurazione | **VOLUME** cF@10 | cF@100 | cF@500 | cF@2000 | **QUALITÀ** cur@10 | cur@100 | cur@500 | cur@2000 |
|---|---|---|---|---|---|---|---|---|
| **wc 0,60 · CF5** *(il massimo per il volume)* | 6,03% | **29,01%** | **60,85%** | **85,38%** | 11,18% | 26,45% | 50,00% | 70,26% |
| wc 0,70 · CF5 | 5,95% | 28,47% | 60,31% | 85,28% | 11,18% | 27,54% | 50,40% | 70,76% |
| wc 0,80 · CF5 | 5,84% | 27,98% | 59,72% | 84,94% | 10,98% | 28,44% | 51,00% | 70,86% |
| wc 0,80 · CF3 | 5,59% | 27,16% | 58,42% | 84,22% | 11,08% | 28,44% | 51,00% | **72,26%** |
| wc 0,88 · CF5 | 5,66% | 27,43% | 59,05% | 84,71% | 10,88% | 29,24% | 51,50% | 70,56% |
| wc 0,80 · CF5 · **CFst3** | 5,68% | 27,38% | 58,38% | 84,01% | 11,18% | 29,44% | 51,30% | 71,66% |
| wc 0,80 · CF5 · **T3** | 5,56% | 27,07% | 57,70% | 83,72% | 11,18% | 29,34% | **52,10%** | 70,86% |
| **wc 0,80 · CF5 · T3 · CFst3** *(il ginocchio)* | 5,43% | 26,53% | 56,80% | 83,06% | 11,28% | **29,74%** | **52,59%** | 71,66% |
| wc 0,80 · CF1 | 4,43% | 21,85% | 50,11% | 79,33% | 11,08% | 27,64% | 51,30% | 72,36% |
| **wc 0,88 · CF1 · T3 · CFst3** *(il massimo per la qualità)* | 2,69% | 14,90% | 38,56% | 71,48% | 11,18% | **30,14%** | 52,50% | **72,65%** |
| wc 0,80 · CF5 · Kc2 | 5,71% | 27,69% | 59,19% | 84,50% | 10,98% | 27,45% | 50,10% | 70,66% |
| wc 0,80 · CF5 · B2 | 5,68% | 27,64% | 59,54% | 84,93% | 10,68% | 27,45% | 50,80% | 70,86% |
| wc 0,60 · CF5 · T3 | 5,79% | 28,07% | 59,07% | 84,36% | 10,88% | 27,84% | 50,60% | 70,76% |
| wc 0,60 · CF5 · CFst3 | 5,93% | 28,36% | 59,53% | 84,64% | 11,18% | 27,05% | 50,70% | 71,26% |
| wc 0,70 · CF5 · T3 · CFst3 | 5,59% | 27,07% | 57,58% | 83,38% | 11,38% | 28,74% | 52,50% | 71,36% |

## 2. Il tasso di scambio, che è la cosa da guardare

Punti non dominati su (volume @100, qualità @100):

| da → a | volume | qualità | **tasso** |
|---|---|---|---|
| CF5 wc0,60 → CF5 wc0,70 | −0,54 | **+1,09** | **2,0 qualità per 1 di volume** |
| CF5 wc0,70 → CF5 wc0,80 | −0,49 | **+0,90** | **1,8** |
| CF5 wc0,80 → +CFst3 | −0,60 | **+1,00** | **1,7** |
| CF5 wc0,80 → CF3 wc0,80 | −0,82 | 0,00 | **0** ← non conviene |
| wc0,80 ginocchio → wc0,88 CF1 T3 CFst3 | **−11,63** | **+0,40** | **0,03** ← precipizio |

**Tre letture:**

1. **Fino al ginocchio lo scambio è a favore della qualità**: si compra 1,7-2,0 punti di giudizio esperto con 1 punto di volume. La curatela costa poco perché pesa su 3.417 archi su 5 milioni: alzarla non toglie quasi niente alla camminata sui film.
2. **Dopo il ginocchio precipita**: l'ultimo tratto compra **+0,40** di qualità pagando **−11,63** di volume (tasso 0,03). Il massimo assoluto della qualità non è un buon punto — è il fondo di una scogliera.
3. **`CFst` è l'aggiunta più efficiente** (+1,00 di qualità per −0,60 di volume), e **i temi la seconda** (+0,90 per −0,91). Insieme sono **sub-additivi** (+1,30 per −1,45): si sovrappongono, entrambi portano informazione cross-medium.
4. **`Kc2` e `B2` non servono**: peggiorano entrambi gli assi o non muovono niente.

## 3. I due punti che valgono una decisione

**Il massimo per il volume — `wc 0,60 · CF5 · k=60 · β=0,50`**
`volume @10 6,03% · @100 29,01% · @500 60,85% · @2000 85,38%` · `qualità @100 26,45%`
È il punto su cui avevo chiuso il report 56. Massimizza il recupero sul catalogo film.

**Il ginocchio — `wc 0,80 · CF5 · T3 · CFst3 · k=60 · β=0,50`**
`volume @10 5,43% · @100 26,53% · @500 56,80% · @2000 83,06%` · `qualità @10 11,28% · @100 29,74% · @500 52,59% · @2000 71,66%`
Costa **2,5 punti di volume al @100** (−8,6%) e compra **+3,3 punti di qualità** (+12,5%), più **+2,6 al @500 dell'esperto**.

**In mezzo, se si vuole poco rischio: `wc 0,80 · CF5 · CFst3`** → volume 27,38 / qualità 29,44. Costa 1,6 di volume e compra 3,0 di qualità. **È il punto col miglior tasso assoluto** fra i due estremi.

## 4. Cosa significa, in una riga

**La curatela è l'unico componente che compra qualità esperta a buon mercato**, perché è piccola (3.417 archi su 5 milioni) e attraversa i medium per costruzione. Alzarla da 0,60 a 0,80 costa l'8,6% del volume sul catalogo film e compra il 12,5% del giudizio esperto. Oltre, non c'è più niente da comprare.

E il corollario che vale per il prodotto: **il ponte cross-medium non si ottiene sacrificando il volume** — si ottiene alzando la curatela e aggiungendo `CFst`, e il prezzo è sotto il 10%. Non è un trade-off doloroso, è un aggiustamento.

## 5. Limiti

- Il banco curato ha **246 sorgenti di test** e 1.002 legami: l'errore standard su questi numeri è di **±1,5 punti** al @100. Le differenze di 0,5 punti nella tabella **non sono distinguibili dal rumore**: valgono solo le differenze sopra il punto e mezzo, cioè il salto wc0,60 → wc0,80/0,88 e il crollo finale.
- Il volume è misurato su **200 utenti** di calibrazione (non i 1.000 di verifica): è il secondo asse, non il numero da citare. Il numero da citare resta quello del report 56.
- I legami curati sono **giudizio di un intenditore**, non verità: misurano "i legami che un esperto scriverebbe", che è esattamente il metro di *qualità* del report 41 — e l'utente ha detto di non volere la curatela come **metodo**. Come **metro** resta l'unico giudizio esperto disponibile.
- Il crollo finale (wc0,88 CF1) **non è un artefatto**: con la curatela a 0,88 e il comportamento a peso 1, il grafo è quasi tutto curatela, e il comportamento — che serve a recuperare i film — non ha più massa. È il motivo per cui il massimo della qualità non è il punto da scegliere.

## 6. La decisione

| se conta | scegli | volume @100 | qualità @100 |
|---|---|---|---|
| **il recupero** sul catalogo film | `wc 0,60 · CF5` | **29,01%** | 26,45% |
| **il compromesso** col miglior tasso | `wc 0,80 · CF5 · CFst3` | 27,38% | **29,44%** |
| **il giudizio esperto** (il ginocchio) | `wc 0,80 · CF5 · T3 · CFst3` | 26,53% | **29,74%** |

Non c'è un punto giusto: c'è **quanto vale per te un punto di giudizio esperto in punti di volume**. Misurato: fra 1,7 e 2,0 fino al ginocchio, 0,03 dopo.
