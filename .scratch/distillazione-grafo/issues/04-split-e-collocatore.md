Status: resolved
Type: task
Blocked by: 01

# 04 — Split cold-start e baseline collocatore

Split induttivo: 600 film + 600 serie (50/50 con/senza trama) + strato low-vote (VOT<20), con
almeno 2 membri di training per bolla; `holdout_mask`; bolla di ground truth dichiarata come
limite. Baseline `collocator.py` V1/V3 sulla stessa split, con la regola voti/medium e il
quartiere dalla mappa 6+2. `split.npz` + `collocator.json`.

Acceptance: i test sono ~1.600, stratificati; il collocatore gira e riporta propria bolla e
quartiere per film/serie/plot/low-vote.

## Esito
1.600 test (300×4 main + 200×2 low); nessuna bolla <2 training. Collocatore V1 own 78,6% /
quartiere 84,1%; V3 54,3% / 62,7%. `split.npz`, `collocator.json`.
