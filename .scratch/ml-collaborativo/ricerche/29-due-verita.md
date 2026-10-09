# 29 — Le due verita' discordano del 97% (e il pool conta piu' del "migliore")

**Data**: 08/10/2026 · 78 film confrontabili · stesso metro per tutte le configurazioni

## 1. Quanto discordano MovieLens e Trakt

| misura | valore |
|---|---|
| di Trakt dentro i partner ML (top-20) | **6,3%** |
| dei partner ML dentro Trakt | **5,7%** |
| Jaccard fra i due pool | **3,2%** |
| voti mediani: partner ML | **24.887** |
| voti mediani: related Trakt | **4.371** (5,7x meno) |

**Non sono due viste della stessa cosa: sono due cose diverse.** MovieLens = **consumo mainstream**
(film popolari, co-visione di massa). Trakt = **affinita' di contenuto/nicchia** (franchise, tema,
genere). Chi ottimizza su una **non sta ottimizzando sull'altra**, e non e' un problema di misura: e' che
le due verita' misurano fenomeni diversi.

## 2. Il pool, non "il migliore" (errore mio, corretto)

Nella metrica pairwise usavo come positivo il **singolo** partner piu' forte (`argmax`): **un film e' collegato
a 10-20 altri, non a uno solo.** Corretto: fino a 20 positivi per film.

E la valutazione ora misura **il pool**:
- **P@10** = quanto della MIA lista e' giusta (precisione del pool)
- **R@10 / R@50** = quanto della LORO lista trovo (richiamo)
- **Jaccard@20** = quanto i due pool **coincidono**

| config | P@10 | R@10 | R@50 | Jaccard@20 | rango med |
|---|---|---|---|---|---|
| A baseline (SVD64+gerarchia) | 27,6% | 15,7% | 37,1% | 12,9% | 125 |
| **B1 + keyword specifiche** | **27,6%** | 15,6% | **37,8%** | **13,4%** | **117** |
| B2 + metrica (positivi = pool) | 21,1% | 12,0% | 28,9% | 10,4% | 177 |
| B3 + pesi affidabilita' | 20,1% | 11,2% | 27,8% | 9,2% | 193 |
| C1 teacher PPMI k-NN | 23,4% | 13,1% | 27,7% | 11,1% | 293 |
| C2 PPMI + metrica | 26,2% | 14,5% | 30,8% | 12,2% | 179 |

**P@10 (27,6%) e' molto piu' alto di R@10 (15,7%)**: il pool di Trakt e' piu' grande (17) dei miei 10 posti,
quindi il richiamo e' limitato per costruzione. Il numero onesto per "quanto i pool coincidono" e' il
**Jaccard@20: 13,4%** — contro un controllo dello 0,1%.

## 3. Il confronto che dice tutto

| | Jaccard con Trakt |
|---|---|
| **il MIO spazio** | **13,4%** |
| **la co-visione di MovieLens** | **3,2%** |

**Il mio spazio assomiglia a Trakt 4 volte piu' di quanto gli assomigli il comportamento di MovieLens.**
Conseguenza: la mia rappresentazione e' uno spazio di **CONTENUTO** — e non cattura il consumo mainstream
di ML. Le due cose non si possono avere con una sola similarita': servono **entrambi i segnali**.

## 4. Le leve restano ferme

Le quattro leve del giro precedente restano non vincenti anche con i positivi a pool (la metrica migliora
da 29,6% a 28,9%... e resta sotto la baseline; il PPMI resta sotto). **L'unica che vince e' ancora la
keyword specifica** (+0,7 pt su R@50, rango mediano 125 -> 117, Jaccard 12,9% -> 13,4%).

## 5. La decisione che spetta al prodotto

"Simili" in che senso?

| se "simili" significa | il metro | lo spazio attuale |
|---|---|---|
| "sono lo stesso tipo di cosa" | Trakt (contenuto) | sulla strada: P@10 27,6%, Jaccard 13,4% |
| "si guardano insieme" | co-visione ML | la ignora quasi del tutto (Jaccard 3,2% e' il caso) |
| entrambi | **fusione** contenuto + comportamento | da costruire, e da misurare su DUE verita' |

Questa non e' una scelta tecnica: e' la definizione di cosa deve fare il motore. E finche' non e' decisa,
"alzare l'asticella" non ha un bersaglio.
