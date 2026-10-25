Status: resolved
Type: task

# 11 — A3: testa di bolla ad alta capacità

`Linear(X_meta 81k → 2.922 bolle)` con il soft target del collocatore (V3 e V1), 20 epoche.
La capacità del collocatore, sulle feature dello studente.

## Esito
V3: **15,4% own / 32,2% quartiere** (798 s); V1: **15,4% / 31,9%** (784 s). Peggio di A1
(19,4%). La testa ad alta capacità **overfitta** i token del training e generalizza male sui
titoli tenuti fuori. `a3-v3-metrics.json`, `a3-v1-metrics.json`.
