# Calibrazione co-visione

Campione: 120 film + 80 serie con supporto Trakt>=5, piu 6 ancore.

Bolla = quota di vicini top-10 entro 365 giorni dalla release del seed (solo seed film).

Jaccard V10 = sovrapposizione top-10 con il triangolo V10 (riferimento comportamentale, non oracolo).

Fonti normalizzate sul proprio p99, non sul massimo del seed.

| alpha | kappa | minsup | bolla media | bolla mediana | Jaccard V10 fuse | solo MovieLens | solo Trakt |
|---|---|---|---|---|---|---|---|
| 0.0 | 0 | 1 | 0.169 | 0.000 | 0.056 | 0.075 | 0.044 |
| 0.0 | 0 | 2 | 0.174 | 0.000 | 0.060 | 0.076 | 0.051 |
| 0.0 | 0 | 3 | 0.188 | 0.000 | 0.063 | 0.078 | 0.058 |
| 0.0 | 3 | 1 | 0.205 | 0.100 | 0.073 | 0.088 | 0.056 |
| 0.5 | 0 | 1 | 0.221 | 0.100 | 0.078 | 0.105 | 0.050 |
| 0.5 | 0 | 2 | 0.266 | 0.200 | 0.082 | 0.106 | 0.054 |
| 0.5 | 0 | 3 | 0.299 | 0.200 | 0.081 | 0.107 | 0.053 |
| 0.5 | 3 | 1 | 0.295 | 0.200 | 0.086 | 0.114 | 0.053 |
