Status: resolved
Type: task
Blocked by: 03, 04

# 05 — Baseline A0: SVD + Ridge

SVD 256-d randomized del teacher simmetrizzato (holdout azzerato); target centrato per medium.
Ridge(alpha=30) su `X_meta` (TF-IDF V3 + L1-L3 + strutturali) + trama se disponibile; previsione
per tutti; centratura con le medie di training. Valutazione bolla/quartiere + recall@20 contro gli
archi completi tenuti fuori. `a0.npz` + metriche.

Acceptance: A0 gira su CPU in tempo ragionevole; le metriche sono per film/serie, plot/no-plot,
low-vote; il collocatore è il termine di paragone.

## Esito
A0 in 41 s: own 15,1%, quartiere 33,1%, recall@20 9,7%. `a0-test.npz`, `a0-metrics.json`.
