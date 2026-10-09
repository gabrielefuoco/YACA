# 36 — I temi DENTRO la fusione: da soli valgono poco, combinati aggiungono

**Data**: 08/10/2026 · set curato raddoppiato (61 sorgenti, 270 collegamenti, 56 falsi amici)
Calibrazione sui dispari, **verifica sui pari** (sorgenti mai usate per calibrare).

## La correzione di metodo (dell'utente)

Il multi-vettore era stato misurato **da solo** (11,3% contro il 40,3% dello spazio) e chiuso. Ma la
fusione esiste proprio per sommare segnali deboli: contenuto 34,8% + comportamento 25,0% + anno + saga
= 40,3%. **Il modo giusto di valutare una componente e' dentro la fusione, non da sola.**

## Il risultato

Pesi degli altri componenti fissi al meglio attuale (contenuto 1,0 · anno 0,15 sigma 8 · saga 0,4);
si calibra solo il peso dei temi (bag di macro-temi L1 pesato con IDF + centroidi dei temi).

| verifica (sorgenti mai usate) | **senza temi** | **con temi** (bag 0,2 · cen 0,2) |
|---|---|---|
| p3@10 | 40,3% (25/62) | 40,3% (25/62) |
| **p2@20** | 27,0% | **30,2%** |
| p1@50 | 27,3% | 27,3% |
| falsi amici in top-10 | 11% | 11% |
| **PUNTEGGIO** | **56,2** | **59,4** |
| mainstream | 27,5% | 29,4% |
| niche | 27,0% | 27,0% |
| **auteur** | 35,3% | **41,2%** |
| franchise | 91,7% | 91,7% |
| era | 30,0% | 30,0% |
| medium | 12,5% | 12,5% |

**+3,2 punti di punteggio sulla verifica**, tutti sul secondo livello (il p2@20: 27,0% -> 30,2%), con
il top-10 **invariato** e i falsi amici **invariati**. Il guadagno si concentra sugli **auteur**
(+5,9 punti): i legami "stesso autore con poetica riconoscibile" — che le keyword gerarchiche non
colgono — sono esattamente cio' che un segnale a temi aggiunge.

**Onesta' sulla significativita'**: +2 collegamenti su 62 nella verifica. Con l'instrumento
raddoppiato (270 link) un link vale +-1,6% sulla meta': quindi +2 link e' **appena sopra il rumore**.
Non e' una vittoria schiacciante: e' un guadagno piccolo e coerente con la direzione attesa.

## Le due lezioni

1. **Una componente debole da sola puo' aggiungere in combinazione.** Il multi-vettore valeva 11,3%
   da solo e aggiunge +3,2 dentro la fusione. **Il modo giusto di giudicare una componente e' dentro
   il sistema, non in isolamento** — altrimenti si buttano via segnali utili perche' non vincono da soli.
2. **Il guadagno dice anche DOVE il segnale serve**: non sul top-10 (i legami forti li prendono gia'
   contenuto+saga), ma sul secondo livello e sui legami d'autore. Un segnale nuovo non deve battere
   il migliore: deve coprire cio' che gli altri non coprono.

## Stato della rotta

| | p3@10 (verifica) | punteggio |
|---|---|---|
| **il nostro spazio (con temi in fusione)** | **40,3%** | **59,4** |
| il nostro spazio (senza temi) | 40,3% | 56,2 |
| scorer di produzione (keyword gerarchiche) | 13,9% | 12,7 |

**3 volte lo scorer di produzione sui legami forti, 4,7 volte sul punteggio.**
