Status: resolved
Type: research

# 13 — A5: feature keyword multi-vettore e lettura empirica

Il teacher non è il collo di bottiglia (A4). L'obiettivo era alzare il recall@20 e leggere il
vicinato reale. Provati: set di cluster keyword (PMA), keyword del film (bge), softmax pieno
multi-positivo, pesi della loss, e la lettura su 30 titoli.

## Cosa è stato fatto

- **`keywords.py`**: 6.125 keyword del `hierarchical_graph.json` → bge-small 384-d; centroidi
  L1/L2/L3; per film fino a 12 token per livello (peso TF-IDF) e fino a 12 keyword del film con
  etichetta del cluster L2. Output `data/kw-set.npz` (copertura 97,3%, 4,6+4,3+4,0 token medi).
- **`model.py`**: `SetPool` (PMA: `MultiheadAttention` con query appresa, maschera, pesi,
  embedding di livello/cluster) e gate a 3 vie metadati/trama/keyword. Retrocompatibile: A1-A4
  non cambiano.
- **`train_a5.py`** (`--tok cluster|film`, `--svd`, `--bolla`, `--hard`) e **`train_a6.py`**
  (softmax pieno con memory bank, 25 positivi, tutti i 66k come negativi).
- **Lettura**: `.scratch/distillazione-grafo/lettura-a5.md`, 30 titoli × 10 vicini × 3 sistemi.

## Numeri (stessa split, 1.600 test)

| modello | own | quartiere | recall@20 |
|---|---:|---:|---:|
| A1 riferimento | 19,4% | 38,8% | 12,7% |
| A5 centroidi | 18,1% | 36,7% | 12,4% |
| A5 senza SVD | 18,2% | 37,2% | 12,6% |
| A5 bolla ×1,0 | 19,3% | 38,7% | 12,6% |
| A6 softmax pieno | 17,7% | 35,5% | 11,7% |
| A7 keyword del film | 18,0% | 36,8% | 12,6% |

## Esito

- **Il multi-vettore di centroidi è ridondante**: i cluster L1/L2/L3 sono già in `X_meta`
  (`data.features`), quindi aggiunge la stessa informazione levigata.
- **Le keyword del film (A7) portano semantica nuova ma non recall**: la co-visione non premia i
  sinonimi. Però il vicinato **migliora alla lettura**: A7 meglio in 13/30 titoli, uguale in 12,
  peggiore in 5 (Inception, Matrix, Spider-Man, Silenzio, Titanic meglio; Mad Max, Toy Story,
  Fight Club, Trono di Spade, Rick and Morty peggio).
- **La loss non è il collo di bottiglia**: né togliere l'SVD (che da solo ha recall@20 0,07%,
  quindi non è un soffitto) né il softmax pieno spostano il numero.
- **Il soffitto è la bolla**: il 48,5% dei vicini top-20 è nella stessa bolla; il denso la azzecca
  al 19,4%, il collocatore al 78,6%. Vedi ticket 14.

Acceptance: soddisfatta (recall per strato + lettura + giudizio esplicito; collocatore non
sostituito).
