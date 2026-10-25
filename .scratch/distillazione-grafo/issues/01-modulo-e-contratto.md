Status: resolved
Type: task

# 01 — Il modulo nuovo e il contratto

Creare `services/graph_dense/` separato da `services/graph/`: `config.py`, `data.py`, `README`,
`data/graph/` read-only (copia degli artefatti V10), `data/` per i nuovi artefatti, `.gitignore`.
Nessuna scrittura in `services/graph/`.

Acceptance: `python services/graph_dense/run.py stato` carica canone, triangolo, partizione,
metadati, bolle e stampa N, archi, bolle; il vecchio modulo è intatto (`git status`).

## Esito
`services/graph_dense/` creato con `data/graph/` read-only; vecchio modulo intatto.
