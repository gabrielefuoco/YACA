Status: resolved
Type: task
Blocked by: 01

# 03 — Matrice teacher top-25 con floor row-adaptive

Dal triangolo V10, per ogni riga: top-25 per peso grezzo; peso
`log1p(w) * sqrt(min(VOT_i,VOT_j)/(min(VOT_i,VOT_j)+50))`; floor 5% del massimo **trasformato**
di riga + 0,02 assoluto (non il 2% sul grezzo); riga normalizzata L1; padding -1. Simmetrizzata
solo per l'ancora SVD. Statistiche: archi per riga (distribuzione, 6 seed, German bridge 674),
nodi senza teacher.

Acceptance: Spider-Man e Breaking Bad hanno 20-25 archi (non 7/8); il ponte Inkheart→674 è
tagliato; `teacher.npz` + `teacher-stats.json` scritti.

## Esito
Teacher 1.606.148 archi; 25/riga mediana; i 6 seed 25/25/25/25/25/23; Inkheart→674 = 0 (17 pieni).
Il 5% del trasformato non affama i hub. `data/teacher.npz`, `teacher-stats.json`.
