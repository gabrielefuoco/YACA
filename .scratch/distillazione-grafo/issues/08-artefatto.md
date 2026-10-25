Status: resolved
Type: task
Blocked by: 06

# 08 — Artefatto e impronte

`spazio-denso-v10.npz`: `Z` float16, `dim`, medie di centratura, impronte di partizione,
triangolo, ricetta, `05-tfidf`/`05-vocab`, `hierarchical_graph.json`, embedding trama. README
dell'interfaccia per collocatore/`uscite` (centroidi densi, regola voti/medium, no-plot, new
release). Nessuna scrittura in `src/`.

Acceptance: l'artefatto si carica e le impronte sono verificabili; l'interfaccia è scritta.

## Esito
`spazio-denso-v10.npz` (30 MB) con `Z`, `mu`, `proto`, `dim`, impronte (partizione, triangolo,
TF-IDF/vocab, keyword, teacher, split, ricetta; trama vuota finché il job non finisce). Il primo
giro non ha salvato `a1-model.pt`: `train_a1` è aggiornato per salvarlo; rilanciare A1.

## Esito (aggiornato)
`spazio-denso-v10.npz` riscritto con `mu`, `proto`, `trama_sha` e le impronte; `a1-model.pt`
presente. Il vecchio `services/graph/` resta intatto.
