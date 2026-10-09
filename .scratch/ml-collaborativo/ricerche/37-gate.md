# 37 — Il gate: idea giusta, NON TESTABILE con questo strumento (e la terza lezione dell'isolamento)

**Data**: 08/10/2026 · verifica sulle sorgenti pari · soglia di nicchia: **2.000 voti TMDB** (assoluta, dichiarata)

## La misura descrittiva che sembrava promettere bene

Per ogni sorgente del set curato: quanti dei suoi collegamenti "peso 3" cadono nei primi 10 con
CIASCUNA componente **DA SOLA**, per fascia.

| fascia | n | contenuto | comportamento | saga | temi | vince |
|---|---|---|---|---|---|---|
| mainstream (molti voti) | 14 | **57%** | 36% | 23% | 21% | contenuto |
| classico (<1980) | 15 | **51%** | 32% | 12% | 7% | contenuto |
| **nicchia (pochi voti)** | 9 | **6%** | **15%** | 0% | 15% | **comportamento** |
| medio | 8 | 8% | **12%** | 12% | 8% | **comportamento** |
| serie | 8 | **28%** | 12% | 12% | 3% | contenuto |

Sembrava la prova del gate: **sulle query di nicchia il contenuto crolla al 6% e il comportamento vince**.
E il nostro assetto migliore ha il comportamento **a zero**: la correzione sembrava ovvia.

## Il test del gate (e l'esito)

| config | tutti p3@10 | **nicchia** | resto |
|---|---|---|---|
| **pesi FISSI (come oggi)** | **39,3%** (24/61) | **28,6%** (2/7) | 40,7% (22/54) |
| GATE FORTE (nicchia: contenuto 0,2 · comportamento 1,0) | 37,7% (23/61) | **14,3%** (1/7) | 40,7% (22/54) |
| controllo UNIFORME (0,2/1,0 su tutto) | 31,1% (19/61) | 14,3% (1/7) | 33,3% (18/54) |

**Il gate PEGGIORA la nicchia** (2/7 -> 1/7). E il controllo uniforme dice che il comportamento pesante
e' peggiore anche sul resto (33,3% contro 40,7%) — coerente con la calibrazione della fusione, che
metteva il comportamento **a zero**.

## Perche' la misura descrittiva ingannava

Misurava le componenti **in isolamento**. Ma la fusione non e' la somma dei poteri individuali: ci sono
anche anno, saga e temi, e **con quelli dentro il regime "contenuto" batte il regime "comportamento"
anche sulle query di nicchia**. E' la **terza volta oggi** che una misura in isolamento inganna:
1. la densita' dei vicini collaborativi (alta, ma tutta su titoli GIA' noti)
2. il multi-vettore da solo (11,3%, ma aggiunge dentro la fusione)
3. le componenti da sole (il comportamento "vince" sulla nicchia, ma perde nella fusione)

**Regola che ne esce**: una componente si giudica **dentro il sistema in cui vive**, mai da sola.

## E il problema vero: lo strumento non ha nicchia

**7 sorgenti di nicchia, 7 collegamenti.** Un link vale +-14%: la misura e' **puro rumore**. Il gate non
e' smentito — e' **non testabile** con questo set.

**Il motivo e' un bias del set curato**: i titoli li ho scelti **famosi** (per farli agganciare al
catalogo facilmente). Quindi il set **non puo' misurare la separazione mainstream/nicchia** — proprio la
domanda che il gate doveva rispondere.

## Cosa serve (concreto, ed e' lavoro di scrittura)

**Sorgenti di nicchia nel set curato**: film poco noti con i loro collegamenti — il pubblico che il
sistema serve male e che nessuna lista "migliori film" contiene. Servono ~40-50 sorgenti sotto i 2.000
voti perche' il gate diventi misurabile (a 50 link, un link vale +-2%).

Finche' non ci sono, il gate resta un'ipotesi non testata — e la fusione a pesi fissi resta la scelta
razionale, perche' e' quella che i dati disponibili sostengono.

## Stato complessivo della rotta

| | p3@10 (verifica) | punteggio |
|---|---|---|
| il nostro spazio (con temi in fusione) | 40,3% | 59,4 |
| scorer di produzione (quello che gira in src/) | 13,9% | 12,7 |

**Il risultato solido del filone resta il divario di 3x sulla produzione**, misurato su 270 collegamenti
curati a mano, meta' dei quali mai usati per calibrare.
