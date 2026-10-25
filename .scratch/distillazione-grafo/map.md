# distillazione-grafo — il modulo nuovo

## Destination

Un modulo **nuovo** (`services/graph_dense/`) che distilla il grafo V10 in uno spazio denso
256-d, addestra un modello dai metadati TMDB (trama qwen3 quando c'è, keyword graph, metadati
sicuri) e produce un artefatto con impronte. Il vecchio `services/graph/` resta **read-only**: non
si tocca né il codice né i suoi dati.

## Decisions so far

- **Modulo separato**: `services/graph_dense/` con `data/graph/` (copia read-only degli artefatti
  V10) e `data/` per i nuovi artefatti. Nessuna scrittura in `services/graph/`.
- **Teacher**: top-25 per riga dal triangolo V10; peso `log1p(w) · sqrt(min(VOT)/(min(VOT)+50))`;
  pavimento **relativo sul peso trasformato** (5% del massimo di riga) + assoluto 0,02, non il 2%
  sul peso grezzo (che affamava i hub: Spider-Man scendeva a 7 archi). Top-25 diretto per la loss;
  simmetrizzato solo per l'ancora SVD.
- **Spazio**: 256-d, `float16` (~32 MB). Studente gated two-branch: `EmbeddingBag` per i metadati
  sparsi (TF-IDF V3 + cluster L1/L2/L3 + strutturali), `Linear` per la trama; gate che si spegne
  quando `has_plot=0`.
- **Loss**: InfoNCE pesato sulla riga top-25 + ancora SVD + CrossEntropy sulla bolla; dropout di
  modalità (trama) e di feature (token); peso 1,5 sulle serie.
- **Cold start**: split induttivo con 600 film + 600 serie (50/50 con/senza trama) + strato
  low-vote (VOT<20); gli archi dei test sono azzerati nel teacher; bolla di ground truth dalla
  partizione completa (limite dichiarato); collocatore V1/V3 sulla stessa split come baseline.
- **Valutazione**: collocazione nella propria bolla/quartiere, recall@20 contro gli archi completi
  tenuti fuori, per film/serie, con/senza trama, low-vote; A0 (SVD+Ridge) vs A1 (gated MLP).
- **Artefatto**: `spazio-denso-v10.npz` con `Z`, dim, medie di centratura e impronte di
  partizione, triangolo, ricetta, TF-IDF/vocab, keyword graph, trama.
- **Keyword multi-vettore** (A5/A7): il grafo gerarchico serve a raggruppare le keyword di ogni
  film; il set di token (centroidi di cluster o embedding bge delle keyword) entra in un `SetPool`
  (PMA) e poi nel gate a 3 vie. Esito: **non sposta il recall** (12,4-12,6% vs 12,7%), perché i
  cluster sono già nel blocco L1/L2/L3 di `X_meta` e la co-visione non premia i sinonimi. Cambia
  però il carattere del vicinato (più semantico, meno franchise): meglio in 13/30 titoli letti.
- **Il teacher SVD non recupera il top-20** (recall@20 0,07%): non è un soffitto e non è il collo
  di bottiglia. Né la loss (softmax pieno multi-positivo, A6: 11,7%) né l'ancora SVD cambiano il
  numero.
- **Il collo di bottiglia è la bolla**: il 48,5% dei vicini top-20 sta nella stessa bolla; il
  denso la azzecca al 19,4%. **Ma il collocatore V1 è leaky**: i suoi centroidi includono il
  titolo di test, e un nearest-centroid onesto sullo stesso `X_meta` scende dal 40,9% (con il test)
  al **18,6%** (senza). Il 78,6% del collocatore non è capacità: **ibrido ritirato** (ticket 14).
- **Niente grafo a inferenza**: il modello è solo feature → vettore; il grafo è supervisione
  (distillazione), non lookup. Il kNN sul TF-IDF grezzo fa **11,0%** di recall@20: quello è il
  soffitto delle feature 05.
- **Feature nuove** (`data.extra_features`): collection (peso 49,8% dei vicini per i film in
  franchise), writers, lingua, rating, durata, stagioni. **A8: 20,2% own / 13,0% recall**.
- **Target pieno**: il teacher top-25 butta 11,6M archi deboli. A10 usa la **riga intera** del
  triangolo come target soft (softmax pieno, memory bank): **21,9% own / 15,2% recall**. È il
  modello di riferimento; le keyword sopra A10 non aggiungono (A11: 15,1%).

## Not yet specified

- La ricerca degli iperparametri (λ_svd, λ_bolla, τ, dropout) oltre ai valori di partenza.
- L'integrazione in `src/` (collocatore/`uscite`): interfaccia, non codice di prodotto.
- Il cambio della potatura della camminata (16→20/25): misurato, non deciso qui.
- Un secondo livello di bolla (le 2-3 bolle candidate del collocatore) per recuperare parte dei
  vicini cross-bolla: **scartato**, la premessa (collocatore 78,6%) è leaky.
- Negativi difficili per cluster in A5 (`--hard`): implementati, non eseguiti (la loss non è il
  collo di bottiglia).
- **Trame in inglese + gate per film** (ticket 17, **due risultati negativi**): le EN peggiorano
  grafo (12,8→10,3%) e curato (10,1/10,8→7,8/9,5 @10), whiten non recupera; il gate collassa sul
  meta (81% massa, grafo 14,6%, curato 5,5/9,0). Blocchi originali ripristinati.
  **Decisione**: b2 + pesi globali; `wm=0,35` similarità-prima (15,7% / 10,1/11,6).
- Il 50% di recall: **non raggiungibile con i metadati TMDB** (kNN 11,0%, modello 15,2%, bolla
  oracolo 32,3%). Servirebbe segnale comportamentale in input, non un'altra architettura.
- **Le raccomandazioni del senior non battono m1** (ticket 16): tabella libera come ancora/bank
  peggiora il test (13,6% vs 16,9%); le sinossi vere recuperate da TMDB (30.157, copertura 54% →
  99,7%) non spostano il metrico; token pg neutri; NDCG/teacher confermano la classifica.
  m1 resta la ricetta; **lc150 (100 epoche + 50 di coda) è il modello e l'artefatto: 20,9% recall /
  27,8% own / 45,4% quartiere**. La curva satura a ~100 epoche (train 52,2%, +0,2 di test nella
  coda): i 13 punti di train che mancano al tetto della tabella libera (65,7%) sono informazione,
  non addestramento.
- **Ensemble**: i modelli saturi hanno errori diversi. La fusione lineare di lc150+lc150s (seed 7)
  +t1+a10 (pesi 3:3:1:1) fa **24,5% recall / 31,6% own / 50,7% quartiere** con un unico vettore
  concatenato 1536-d (`spazio-denso-ensemble.npz`). La diversita' dei seed paga quanto quella
  architetturale; RRF e CSLS no. Le trame vere aiutano gli strati freddi (film no-plot
  9,7% → 15,0%; low-vote 9,5% → 13,3%).

## Out of scope

- Toccare `services/graph/` o `src/`.
- Il frontend, il prodotto, la camminata servita.
- La rigenerazione della trama con GPU dedicata: il job parte in background su CPU e riprende
  quando la GPU c'è (checkpoint ogni 500).
