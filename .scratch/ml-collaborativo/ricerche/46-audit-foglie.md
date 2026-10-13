# 46 — Audit delle foglie: sono tutte buone? quanto rumore? sono migliorabili?

**Domanda (utente)**: «le foglie sono migliorabili? o comunque i cluster in generale, sono tutti buoni? quanto rumore c'è?»

**Risposta in tre righe**: i cluster **sono buoni** — nessuna foglia è un raggruppamento finto, e solo il **3%** è vicino al caso. **Non sono migliorabili spezzandole**: il 4,7% guadagnerebbe qualcosa, il 28% niente. E il **miglioramento possibile è concentrato tutto in un punto solo**: le 164 foglie sopra i 40 titoli.

Script: `.scratch/ml-collaborativo/audit-foglie.py`, `audit2.py` (55 s).

---

## 1. Quattro misure, tutte con il proprio controllo

| misura | domanda | controllo |
|---|---|---|
| **A · Coerenza** | i membri si somigliano? | titoli presi a caso (0,004) |
| **B · Comunità** | la foglia ha archi suoi o è un contenitore vuoto? | densità attesa dal caso |
| **C · Migliorabilità** | guadagnerebbe se la spezzassi? | split casuale della stessa taglia |
| **D · Rumore** | i vicini di contenuto stanno con lei? | 10 × dimensione / 66.259 |

Il controllo di C è quello che conta: **spezzare una foglia aumenta sempre la coerenza** (gruppi più piccoli sono più stretti). Senza il nullo, la misura direbbe "tutte le foglie sono migliorabili" — che è vero per costruzione e non dice niente. C'è guadagno vero solo se la foglia è internamente **bipartita**.

## 2. A · La distribuzione (le medie non la mostrano)

| percentile | 1° | 10° | 25° | 50° | 75° | 90° | 99° |
|---|---|---|---|---|---|---|---|
| coerenza | 0,24 | 0,42 | 0,557 | **0,744** | 0,840 | 0,901 | 0,962 |

| soglia | foglie | quota |
|---|---|---|
| sotto 0,10 (quasi casuale) | **24** | **0,7%** |
| sotto 0,20 | **105** | **3,2%** |
| sotto 0,30 | 260 | 8,0% |

**La coda di spazzatura è sottile**: 105 foglie su 3.238 stanno sotto 0,20 — e anche quelle stanno 50 volte sopra il caso (0,004). Una foglia *davvero* casuale sarebbe a 0,004: non ce n'è nessuna.

## 3. B · Sono comunità vere, senza eccezioni

Archi interni alla foglia / archi attesi dalla densità globale (1,17·10⁻³):

| dimensione | foglie | lift mediano | sotto 1× | sotto 5× | sotto 20× |
|---|---|---|---|---|---|
| 2-5 | 165 | 598× | 0,0% | 0,0% | 0,0% |
| 6-10 | 594 | 513× | 0,0% | 0,0% | 0,0% |
| 11-20 | 1.264 | 415× | 0,0% | 0,0% | 0,0% |
| 21-40 | 1.051 | 321× | 0,0% | 0,0% | 0,0% |
| 41-80 | 124 | 365× | 0,0% | 0,0% | 0,0% |
| 81-150 | 33 | 273× | 0,0% | 0,0% | 0,0% |
| 151+ | 7 | 158× | 0,0% | 0,0% | 0,0% |

**Nessuna foglia ha meno di 20 volte la densità di archi attesa.** Anche nella fascia peggiore (le più grandi, dove il lift è per forza più basso) si sta a 158×. Non esistono foglie-contenitore.

## 4. C · Migliorabili spezzandole? Quasi mai

Guadagno di uno split spettrale **meno** il guadagno di uno split casuale della stessa taglia (2.845 foglie con ≥8 titoli):

| percentile | 10° | 25° | 50° | 75° | 90° | 99° |
|---|---|---|---|---|---|---|
| guadagno eccedente | +0,010 | +0,018 | **+0,032** | +0,049 | +0,075 | +0,148 |

| | foglie | quota |
|---|---|---|
| guadagnerebbero oltre **+0,10** | 134 | **4,7%** |
| guadagnerebbero oltre +0,20 | 4 | 0,1% |
| **non guadagnano niente** (<0,02) | **809** | **28,4%** |

**Le foglie non sono migliorabili spezzandole.** Solo 4 foglie su 3.238 hanno una vera struttura bipartita.

## 5. D · Quanto rumore: i vicini di contenuto

Per ogni titolo, quanti dei suoi 10 vicini di contenuto più stretti stanno nella **sua** foglia (atteso a caso: 0,01):

| vicini in foglia | titoli | quota |
|---|---|---|
| **0** | **15.079** | **22,8%** |
| 1-2 | 17.600 | 26,6% |
| 3-5 | 21.314 | 32,2% |
| 6-8 | 9.465 | 14,3% |
| 9-10 | 2.801 | 4,2% |

**Media: 3,01 su 10** (atteso a caso 0,01 → lift 553×). Cioè la foglia cattura **il 30% del vicinato di contenuto** di un titolo.

I 15.079 titoli con zero vicini in foglia stanno in foglie di coerenza media **0,437** contro **0,707** delle altre. Il che vuol dire: il titolo con zero vicini non è "un titolo spostato per caso" — **sta in una foglia più lasca**, e quella foglia è lasca proprio perché contiene titoli così.

*(Attenzione a non leggerla male: questa statistica è **distorta verso le foglie piccole** — se una foglia ha 5 titoli, il massimo possibile è 4 e lo zero è quasi garantito. Per questo non la uso come misura unica. Il "plurality" — dove sta la maggioranza dei vicini — è ancora più distorto: dà l'85% sulle foglie da 5 titoli e il 40% su quelle da 40, e quel gradiente è quasi tutto aritmetica, non rumore. Non lo riporto come risultato.)*

## 6. Il tetto: quanto è lontana una foglia da un gruppo "ideale"

Gruppo ideale = un titolo + i suoi 10 vicini più stretti (11 titoli, coerenza media 0,855). Confrontato con la foglia in cui il titolo effettivamente sta:

| la foglia dove sta il titolo | titoli | gruppo ideale | foglia | rapporto |
|---|---|---|---|---|
| 1-5 | 701 | 0,829 | 0,644 | 1,29× |
| 6-10 | 4.772 | 0,847 | 0,686 | 1,23× |
| **11-20** | 19.256 | 0,860 | **0,708** | **1,21×** |
| 21-40 | 29.647 | 0,864 | 0,679 | 1,27× |
| **41-80** | 6.842 | 0,837 | **0,453** | **1,85×** |
| **81-150** | 3.357 | 0,825 | **0,422** | **1,96×** |
| **151+** | 1.684 | 0,819 | **0,440** | **1,86×** |

**Qui sta tutta la risposta.** Fino a 40 titoli la foglia sta al **79-83%** del gruppo ideale: il residuo è l'effetto taglia (un gruppo più grande *deve* essere più lasco), non un errore. Sopra i 40 titoli il rapporto salta a **1,85-1,96×**: quelle foglie sono **gruppi di gruppi**, e ognuno dei loro membri ha un vicinato molto più stretto altrove.

Le 164 foglie sopra i 40 titoli contengono **11.883 titoli (18% del catalogo)**: lì sta tutto il margine.

E si riconcilia con il report 44: quelle foglie non si aprono perché la soglia di modularità le protegge — e le protegge a ragione, perché i legami che le tengono insieme sono comportamentalmente forti (120 co-occorrenze per coppia). Non sono sbagliate: sono **larghe**, e in content sono larghe davvero.

## 7. I cluster grossi (i livelli dell'albero)

Non sono unità di raccomandazione, sono famiglie — e la tabella dice esattamente quanto:

| livello | cluster | dimensione mediana | coerenza mediana | 10° percentile | sotto 0,20 |
|---|---|---|---|---|---|
| L0 | 1 | 66.259 | 0,003 | 0,003 | 100% |
| L1 | 12 | 5.034 | 0,229 | 0,107 | 50,0% |
| L2 | 159 | 210 | 0,422 | 0,221 | 8,2% |
| L3 | 750 | 63 | 0,621 | 0,256 | 5,7% |
| L4 | 1.869 | 23 | 0,742 | 0,363 | 2,4% |
| L5 | 1.251 | 13 | 0,775 | 0,448 | 1,2% |

La coerenza **sale monotonamente** scendendo: 0,229 → 0,775. I 12 cluster di L1 sono laschi per costruzione (sono "i generi del grafo"), e non vanno usati come unità. Da L3 in giù (63 titoli di mediana) la struttura è utilizzabile.

## 8. In una riga

**Le foglie sono buone e non sono migliorabili spezzandole.** Il rumore è piccolo e localizzato: ~3% di foglie lasche, 23% di titoli in foglie lasche (ma senza un'alternativa migliore dimostrabile), e un margine reale solo nelle **164 foglie sopra i 40 titoli** — che sono larghe di contenuto e forti di comportamento, quindi non vanno rotte: vanno **usate come pool dentro cui ordinare**.

## 9. Limiti dichiarati

- La coerenza è misurata nello **spazio Pc di contenuto** (64 dimensioni, keyword). Non misura l'accordo di *gusto*: due titoli possono essere lontani in Pc e piacere alla stessa persona. Infatti le foglie grandi hanno coerenza bassa e co-occorrenza alta: **le due cose sono diverse e questa è la prova**.
- Il gruppo "ideale" è un vicinato di contenuto, non un insieme che piace: è un tetto *di contenuto*, non un tetto di qualità.
- MovieLens non entra in questo audit: qui si misura la struttura, non il comportamento (quello sta nel report 44).
