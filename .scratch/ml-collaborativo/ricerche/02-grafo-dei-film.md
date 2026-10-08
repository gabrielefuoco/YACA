# 02 — Il grafo dei film: costruito, e i cluster emergono (08/10/2026)

**Mappa**: [../map.md](../map.md) · **Banco**: `build-film-graph.py` (Python, sklearn+igraph+leidenalg, nessun LLM/Transformer)

---

## La correzione di rotta (l'utente aveva ragione)

Il mio banco precedente misurava il **ranking** (recall sul leave-out) e concludeva sul **grafo**. Erano due
cose diverse: il grafo non l'avevo mai costruito. Con la struttura come obiettivo, la risposta cambia — e
cambia in meglio.

## Due errori grossolani trovati nei controlli (chiesti dall'utente)

1. **Collisione di id fra film e serie**: TMDB riusa gli stessi numeri (`862` = *Toy Story* **e** una serie;
   `238` = *Il padrino* **e** *Star Cops*). Il codice assegnava un movieId di MovieLens anche alle righe
   *serie* con id collidente: alcune serie ricevevano l'embedding di un film estraneo. **Corretto**: il
   mapping MovieLens si applica **solo alle righe `type = movie`**. Effetto: lo student è passato da
   coseno 0,403 a **0,431**.
2. **Grafo degenerato**: con k-NN *mutuale* k=12 il grafo si spezzava in **26.532 componenti** e Leiden
   produceva **26.645 cluster** (mediana 1 titolo): stava separando componenti, non trovando struttura.
   **Corretto**: archi = k-NN (k=12) **con soglia di coseno ≥ 0,45** → **1 sola componente connessa**,
   913.056 archi, zero nodi isolati.

## Il risultato

| misura | valore |
|---|---|
| Titoli proiettati | **87.848** (71.298 film + 16.550 serie), 64 dimensioni |
| Teacher | SVD della co-visione MovieLens, 51.061 film coperti, corretta per popolarità |
| Student (Ridge, standard) | coseno(predetto, vero) **0,431** su 9.941 film **tenuti fuori** · controllo banale 0,224 → **+0,207** |
| Grafo | 1 componente connessa · 913.056 archi (k-NN k=12, coseno ≥ 0,45) · 0 isolati |
| Leiden `res 16` | **254 cluster**, mediana **333** titoli, modularità 0,711 |
| Leiden `res 32` | 446 cluster, mediana 191 |
| Leiden `res 64` | 827 cluster, mediana 101 |
| Coerenza | coseno medio coi vicini **dello stesso cluster** 0,895 · con un titolo a caso 0,246 |
| **Indipendenza dalla gerarchia** | **ARI 0,055 · NMI 0,280** → struttura nuova, non una ricopiatura di L1-L5 |

## I film dentro i cluster (la prova che si guarda a occhio)

| cluster | titoli | esempi (per voto bayesiano) | lettura |
|---|---|---|---|
| 0 | 997 | Green Book · Chiamami col tuo nome · Bohemian Rhapsody · Tuo, Simon · Merlí · Noi siamo infinito · Sing Street | formazione, amicizia, LGBT, musica |
| 1 | 984 | Avatar Aang · One Piece · Arcane · L'attacco dei giganti · Demon Slayer · Fullmetal Alchemist · Death Note | il canone shonen |
| 2 | 813 | (topoi: gothic, murder, supernatural creature) | gotico/soprannaturale |
| 3 | 798 | (topoi: gunfight, post civil war, 18th century) | western/storico di conflitto |
| 4 | 759 | (topoi: giant monster, scientific experiment, neo-noir) | fantascienza mostruosa/noir |
| **127** | **333** | Samurai Jack · Black Lagoon · FLCL · Oddtaxi · Holly e Benji | **anime cult/sperimentali — un sotto-cluster DENTRO il 1** |
| **128** | **326** | Pinocchio del Toro · Loving Vincent · Mary and Max · La mia vita da Zucchina | **animazione d'autore per adulti** |

Il cluster 127 è la prova migliore: lo spazio denso separa il canone shonen mainstream dagli anime cult — una
distinzione che i topoi L2 della gerarchia non fanno (ARI 0,055). Ed è esattamente la granularità richiesta:
«micro-generi compatti da 50-150 film, non 10 macro-cluster generici».

## Cosa significa per il progetto

1. **Il filone resta aperto**, e il pezzo che serve c'è: tutti i titoli in un grafo denso, collegati, con
   cluster coerenti e navigabili (1 hop = i vicini, 2 hop = il micro-genere).
2. **Il task giusto per questo grafo non è battere lo scorer sul recall** (lì l'attuale DNA+gerarchia resta
   migliore): è **cambiare il modo di generare i candidati** — prendere il micro-genere di ciò che l'utente ha
   visto e pescare lì, invece di costruire il pool dai top-3 generi e dalle top-10 keyword. È una misura
   diversa, e non è stata ancora fatta.
3. **Prossimi passi, in ordine**: (a) etichettare i cluster (i `ui_name` L3/L4 e le keyword dominanti lo fanno
   già quasi da soli); (b) il test di retrieval **per cluster** (dal micro-genere dei titoli visti → top-50 →
   confronto col pool attuale, sul banco leave-out); (c) solo dopo, l'eventuale integrazione nel serving.

## Riproduzione

```bash
offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/build-film-graph.py
# artefatto: .cache/movielens/film-graph.npz (embedding 87.848×64 + assegnazione cluster)
```
