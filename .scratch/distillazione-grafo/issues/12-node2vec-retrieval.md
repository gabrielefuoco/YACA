Status: resolved
Type: research

# 12 — Il teacher per il retrieval: node2vec / LightGCN

Il collocatore resta il classificatore di bolla (78,6%); lo spazio denso serve per il retrieval
(recall@20 12,7%). Il teacher SVD è globale: provare node2vec/LightGCN (o SVD 512/1024) sulla
stessa split, con lo studente A1 256-d, e misurare recall@20 per film/serie/plot/low-vote.

Acceptance: confronto A0/A1 con il teacher nuovo sulla stessa split; se il recall non sale, il
teacher non è il collo di bottiglia e si passa all'ibrido (collocatore + denso).

## Esito (negativo)
LightGCN 2 layer sul teacher potato (1,6M archi, 50 epoche, 966 s): Ridge `nan` (problema
numerico `U`/`A`); l'A1 con il target LightGCN resta 0,195/0,384/0,127, identico all'SVD. Il
teacher non è il collo di bottiglia. La lettura empirica dei 6 titoli è nel report §9: il denso è
flessibile e a volte migliore del grafo, ma non riproduce il top-20. Prossimo: A5 sulle feature
(bge keyword graph, X_meta) e loss contrastiva.
