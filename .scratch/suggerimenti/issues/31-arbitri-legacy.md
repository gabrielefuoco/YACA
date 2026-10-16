Status: resolved
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

---

FATTO il 16/10/2026: i sei (`banco`, `loo_esatto`, `voto_diretto`, `geometria`, `coerenza`, `sim_trama`) sono in `graph/measure/legacy/` con `git mv` (la storia resta), piu' un README che dice per ognuno cosa misurava e perche' e' li'. Verificato prima che **nessuno li importa**. In `measure/` restano **19 arbitri vivi**.
