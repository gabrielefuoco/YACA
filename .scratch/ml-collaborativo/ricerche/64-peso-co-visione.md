# 64 — Il peso della co-visione: due cataloghi, due pesature

**La domanda**: l'ordinamento del catalogo serie (report 63) ha trovato che la caratteristica più forte è la **co-visione Trakt** — l'unico comportamento che copre le serie. Nel grafo la co-visione pesa **1 su 9**. Quanto dovrebbe pesare?

**La risposta**: **per le serie di più, per i film di meno — e non è un compromesso, perché i due cataloghi si servono separati.**

Script: `serie-pesi.py` (1.962 s, 8 configurazioni).

---

## 1. Il catalogo serie vuole la co-visione

| configurazione | @10 | @100 | @500 |
|---|---|---|---|
| **CF5 · CFst1 · B1 · wc0,60** *(com'è ora)* | 1,84% | 16,07% | 41,85% |
| CF5 · CFst1 · B3 | 1,87% | 16,92% | 44,39% |
| CF5 · CFst1 · B5 | 1,94% | 17,16% | 44,56% |
| CF5 · CFst1 · B10 | **1,98%** | 17,26% | 44,26% |
| CF5 · CFst3 · B3 | 1,87% | 17,34% | 45,41% |
| **CF5 · CFst3 · B5** | 1,92% | **17,47%** | **45,74%** |
| CF1 · CFst1 · B3 *(meno comportamento-film)* | 1,93% | 17,20% | 44,74% |
| CF5 · CFst3 · B5 · wc0,80 | 1,84% | 16,94% | 45,25% |

**Guadagno della migliore: +4,3% al @10 · +8,7% al @100 · +9,3% al @500.** Piccolo ma **coerente su tutte le profondità** — e cresce con la profondità, che è dove il catalogo serie serve il volume.

**Anche `CFst` conta**: da 1 a 3 dà +1,5 punti al @100 (16,92 → 17,34 con B3). È il pubblico previsto delle serie, cioè l'unica cosa che dà loro una posizione nel mondo del comportamento.

## 2. Il catalogo film vuole il contrario

| configurazione | @10 | @100 | @500 |
|---|---|---|---|
| **CF5 · CFst1 · B1** *(com'è ora)* | **4,68%** | **21,27%** | 45,22% |
| CF5 · CFst1 · B3 | 4,52% | 21,08% | **45,52%** |
| CF5 · CFst1 · B5 | 4,25% | 20,16% | 44,66% |
| CF5 · CFst1 · B10 | 3,85% | 18,12% | 41,67% |
| CF5 · CFst3 · B3 | 4,44% | 20,84% | 45,36% |
| CF5 · CFst3 · B5 | 4,24% | 20,05% | 44,51% |

**Alzare la co-visione costa ai film**: −5,7% al @100 con B5, −14,8% con B10. Il motivo è chiaro: per i film il comportamento c'è già ed è **migliore** (`CF` = le cronologie MovieLens, 49.041 film); la co-visione Trakt è un segnale più debole e più rado, e spostarci massa peggiora.

## 3. La conclusione: due pesature, non un compromesso

**Il trade-off esiste** — la co-visione è ossigeno per le serie e zavorra per i film. **Ma i due cataloghi si servono separati**: Stremio ne restituisce due, e la camminata si può fare due volte con pesature diverse. Non è un compromesso da sciogliere: è **la stessa scoperta di sempre, un livello più su**.

| catalogo | configurazione | @10 | @100 | @500 |
|---|---|---|---|---|
| **FILM** | CF5 · CFst1 · **B1** · wc0,60 | **4,68%** | **21,27%** | 45,22% |
| **SERIE** | CF5 · **CFst3** · **B5** · wc0,60 | **1,92%** | **17,47%** | **45,74%** |

**E se serve un grafo solo**: `CF5 · CFst1 · B3` è il compromesso ragionevole — ai film costa **−0,9%** al @100 (21,27 → 21,08) e alle serie dà **+5,3%** (16,07 → 16,92). Un affare, se non si possono avere due grafi.

## 4. Il quadro completo del catalogo serie

Mettendo insieme ordinamento e pesi:

| | camminata @10 | **con l'ordinamento** | @100 camminata | **@100 ordinato** |
|---|---|---|---|---|
| serie, pesi attuali (B1) | 1,84% | **5,27%** *(verifica)* | 16,07% | **23,18%** |
| serie, pesi per le serie (B5·CFst3) | 1,92% | da misurare | 17,47% | da misurare |

**Il catalogo serie passa da 1,84% a 5,27% al @10** — **2,87×** — e da 16,07% a 23,18% al @100. E il margine che resta è **nel cesto**: l'oracolo dello stesso cesto è 12,19% al @10, e il modello ne prende il 61%.

## 5. Cosa manca

1. **Rifare l'ordinamento con i pesi per le serie** (B5 · CFst3): la camminata è migliore, quindi il cesto è migliore, quindi l'ordinamento dovrebbe salire. È l'esperimento ovvio che segue.
2. **La fusione col teacher dei metadati** (report 60, +77% al @10 sulla testa del catalogo serie) non è stata combinata con l'ordinamento. I due guadagni sono su assi diversi (la fusione sulla *testa*, l'ordinamento sul *cesto*) e potrebbero sommarsi.
3. **Il cesto è fisso a 500**: con un cesto più grande l'oracolo sale e il modello ha più margine.
4. **In produzione servono due camminate**, con due pesature. Da verificare che il costo di calcolo sia accettabile.
