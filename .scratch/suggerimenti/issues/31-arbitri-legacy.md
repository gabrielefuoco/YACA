Status: ready-for-agent
Type: task

# Sei arbitri puntano a partizioni morte, e uno importa un modulo che non esiste
**Prova**: in `graph/measure/` ci sono sei file (`banco.py`, `loo_esatto.py`, `voto_diretto.py`,
`geometria.py`, `coerenza.py`, `sim_trama.py`) che puntano cablati a `bolle-nitrile-V8.npy`,
`bolle-nitrile-V7-triangolo.npz` o `ML / "06c-voto.npz"`, e `banco.py` fa `import colloca as C` — un
modulo che **non esiste in `graph/`**, esiste solo in `.scratch/inserimento/`.
Quindi oggi, in `graph/measure/`, non si distingue a colpo d'occhio quali arbitri verificano il sistema
**attuale** e quali documentano un esperimento del passato.
**Fix**: spostarli in `graph/measure/legacy/` con un README di una riga ciascuno («misura di V8, non
verifica il sistema attuale»), oppure allinearli a `PARTIZIONE`. Non cancellarli: sono l'evidenza di
perche' si e' andati altrove.
