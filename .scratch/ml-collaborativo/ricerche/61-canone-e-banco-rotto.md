# 61 — Il canone, e la scoperta che il metro curato è rotto

**Tre cose, in ordine di importanza.**

1. **L'implementazione canonica è validata**: riproduce **esattamente** i numeri di testa del prodotto (5,99 / 29,61 / 63,35 / 87,86) e quelli del curato (11,18 / 26,45 / 50,00 / 70,26). Le due varianti in giro davano 1,4 punti di differenza: confermato, e ora c'è una sola strada.
2. **Il metro curato è rotto**: le 249 sorgenti di test sono **due popolazioni strutturalmente diverse**, e la camminata va **28,53% @10** su una e **2,44%** sull'altra. Il numero aggregato non significa niente.
3. **Il riferimento del report 41 (18,90% @10 · 36,90% @100) è gonfiato** dallo stesso artefatto del report 58 — e ora si sa **quanto**: quasi tutto.

Script: `canone.py` + `canone-misure.py` (840 s) · `verifica-riferimento41.py` · `riferimento41-2.py`.

---

## 1. Il canone, validato

`canone.py` è l'unica implementazione. Scelte dichiarate:

- `correggi_hub` usa il grado **binario** (quanti vicini, non quanto pesano) e **normalizza la riga**;
- il mixing avviene fra componenti **già normalizzate** (senza, un componente a peso 5 domina anche dove è più rado);
- una sola normalizzazione finale, sulla somma.

**La prova che è quella giusta** — rifà i numeri di testa senza toccare niente:

| | @10 | @100 | @500 | @2000 |
|---|---|---|---|---|
| **prodotto, 1.000 utenti di verifica** | **5,99%** | **29,61%** | **63,35%** | **87,86%** |
| *(il numero del report 56)* | *5,99%* | *29,61%* | *63,35%* | *87,86%* |
| **curato, camminata non mascherata** | **11,18%** | **26,45%** | **50,00%** | **70,26%** |
| *(il numero del report 57)* | *11,18%* | *26,45%* | *50,00%* | *70,26%* |

E la differenza fra le due varianti, ora spiegata: la variante «grezza» dava 9,88% @10 sulla stessa camminata. **Il mascherino della sorgente non c'entra** (mascherata: 11,48%, non mascherata: 11,18%): era la costruzione del grafo.

## 2. Il metro curato è rotto: due popolazioni, non una

Il gold ha 499 sorgenti, metà nel grafo e metà di test. La domanda che non avevo mai fatto: **le sorgenti di test sono tutte uguali?**

No. **83 delle 246 compaiono come *bersaglio* dei legami delle sorgenti di train** (sono dentro il mondo curato); **163 compaiono solo come sorgenti.**

| popolazione | sorgenti | camminata @10 | @100 | @500 |
|---|---|---|---|---|
| **con un posto nel mondo curato** | 83 | **28,53%** | **49,28%** | 67,72% |
| **senza** | 163 | **2,44%** | **14,66%** | 40,76% |

**Dodici volte di differenza al @10.** Il numero aggregato (11,48%) è una media fra due cose che non hanno niente in comune — e **la media è dominata dalla popolazione difficile**, che è due terzi del totale.

**Perché conta**: qualunque metodo che «aiuta» sfruttando la struttura del gold viene premiato. Ed è esattamente quello che è successo.

## 3. Il riferimento del report 41: gonfiato, e ora si sa di quanto

Il teacher del report 41 è `SVD(PMI(curatela del train))`. Ricostruito:

| | @10 | @50 | @100 | @500 | @2000 |
|---|---|---|---|---|---|
| teacher report 41 **da solo** | 10,68% | 17,47% | 18,76% | 28,94% | 46,81% |
| CONTROLLO — ordine di indice | 1,10% | 3,39% | 5,49% | 20,86% | 45,11% |
| CONTROLLO — permutazione casuale | 0,00% | 0,00% | 0,20% | 0,60% | 2,50% |

**Il teacher è reale** (10,68% contro 1,10% dell'ordine di indice, e contro 0,00% del caso): **non è l'artefatto puro del report 58.** Ma **166 delle 249 sorgenti hanno vettore zero** in quello spazio — non compaiono in nessun arco del train — e per quelle il teacher degenera nell'ordine di indice.

**La fusione, decomposta:**

| | camminata @10 | teacher @10 | **RRF k=3000 @10** | RRF @100 |
|---|---|---|---|---|
| **83 con teacher VERO** | 28,53% | 29,39% | **30,84%** | **58,50%** |
| **163 con teacher NULLO** | 2,44% | 0,76% | **14,96%** | 31,91% |
| **tutte e 246** | 11,48% | 10,68% | **20,46%** | **41,12%** |
| *(il report 41 diceva)* | *10,4%* | — | *18,90%* | *36,90%* |

**Lettura:**
- Sulle 83 col teacher vero la fusione guadagna **+2,3 al @10 e +9,2 al @100** — un guadagno **reale**.
- Sulle 163 col teacher nullo la fusione porta il @10 da **2,44% a 14,96%** — **sei volte**, da un teacher che non contiene **niente**. È l'artefatto.
- L'aggregato (20,46 / 41,12) **riproduce e supera** il report 41 (18,90 / 36,90) — quindi il numero storico era proprio questo misto, e **la sua parte buona viene per la maggior parte dalle sorgenti dove il teacher è nullo**.

**Conclusione**: il riferimento del report 41 **non è un riferimento**. Va buttato, come il 22,65% del report 58. E il numero onesto sul metro curato è la **camminata sola: 11,48% @10 · 26,65% @100 · 50,10% @500 · 70,26% @2000**.

## 4. Quello che invece regge: il catalogo serie

Rifatto sul grafo canonico, il risultato buono **regge e migliora**:

| catalogo | camminata | **con la fusione** | delta @10 |
|---|---|---|---|
| **FILM** (semi film) | 4,68% | 4,73% | +1% *(neutro)* |
| **SERIE** (semi serie) | 1,84% | **3,26%** *(metadati, k=3000)* | **+77%** |
| **SERIE** (semi film) | 1,03% | **1,38%** *(metadati, k=3000)* | **+34%** |
| **FILM** (semi serie) | 0,59% | 0,65% *(CFst, k=3000)* | +10% |

**E la spiegazione è la stessa di prima, con una differenza cruciale.** Il teacher del report 41 era un teacher *vero* (la curatela) fuso con una camminata *cieca* alla curatela — e funzionava. Il teacher dei metadati sul catalogo serie è un teacher *vero* (i metadati) fuso con una camminata *cieca al comportamento* — e funziona. **Il teacher del report 58 era un teacher *nullo*, e il «guadagno» era l'artefatto.**

> **La regola, che ora ha tre conferme e una smentita: la fusione aggiunge dove il teacher vede qualcosa che la camminata non vede — e se il teacher non vede niente, la fusione non è neutra: è un bias.**

## 5. Cosa va fatto prima di qualunque altra misura

1. **Riparare il banco curato.** Due strade: (a) tenere solo le sorgenti **strutturalmente confrontabili** (quelle che compaiono nel mondo curato), dichiarando che il numero vale per quelle; oppure (b) costruire il teacher in modo che **ogni** sorgente abbia un vettore — cioè un teacher che non dipenda dal fatto che la sorgente sia un bersaglio della curatela. La (b) è più onesta e più vicina alla produzione.
2. **Buttare il riferimento del report 41** e ripartire dalla camminata sola (11,48 / 26,65 / 50,10 / 70,26).
3. **Rimettere in riga i report 56-57**: i loro numeri sono canonici e validati ✓, ma le loro conclusioni sul curato (la frontiera del 57) sono misurate su un banco rotto — vanno rilette.
4. **Il catalogo serie resta il lavoro vero**: la fusione lì vale **+77% al @10**, ed è un guadagno pulito (il teacher dei metadati non ha niente a che vedere col gold).
