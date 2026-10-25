Status: resolved
Type: task
Blocked by: 05

# 06 — Studente A1: gated two-branch con EmbeddingBag

`EmbeddingBag` per i metadati sparsi, `Linear` per la trama, gate `has_plot`, embedding medium;
loss InfoNCE pesata sulla riga top-25 + ancora SVD + CrossEntropy bolla; dropout di modalità e
feature; serie ×1,5. 256-d, batch 512, 25 epoche, AdamW + cosine, gradient clip. Training su CPU.

Acceptance: A1 gira e produce `Z`; il ramo trama si spegne senza il file; le metriche sono
confrontabili con A0.

## Esito
A1 in 7 min: own 17,6%, quartiere 36,5%, recall@20 11,6% (meglio di A0, ma 61 punti sotto V1).
`a1.npz`, `a1-metrics.json`. La testa bolla è valutata sui centroidi, non sui prototipi.

## Esito (trama inclusa)
A1 con la trama: own 19,4%, quartiere 38,8%, recall@20 12,7% (senza: 17,6/36,5/11,6). Salvati
`a1.npz` (Z, mu, proto) e `a1-model.pt`. Resta 59 punti sotto V1.
