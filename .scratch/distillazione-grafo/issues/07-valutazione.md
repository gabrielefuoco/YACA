Status: resolved
Type: task
Blocked by: 06

# 07 — Valutazione e ablazioni

Metriche comuni: propria bolla, quartiere, recall@20 archi completi, per film/serie,
plot/no-plot, low-vote. Ablazioni minime: top-20/25/30, floor, trama sì/no, ridge vs MLP,
λ_bolla 0 vs 0,3. `metrics.json` con i numeri e il seed.

Acceptance: tabella A0/A1/collocatore; le ablazioni che si possono girare in tempi umani sono
girate; le altre sono dichiarate.

## Esito
Fatta la tabella A0/A1/collocatore per 6 strati + recall. Ablazioni top-k/floor/λ_bolla non girate
(il primo giro è un baseline). `a0-metrics.json`, `a1-metrics.json`.
