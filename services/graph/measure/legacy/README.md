# `graph/measure/legacy/` — le misure del passato

Qui stanno sei arbitri che **non verificano il sistema attuale**. Puntano a partizioni morte e a un
modulo che non esiste più in `graph/`, quindi oggi non si può distinguere a colpo d'occhio — scorrendo
`graph/measure/` — quali misure parlano del sistema e quali della sua storia.

Non si cancellano: sono l'**evidenza di perché** si è andati altrove. Ogni loro numero è un gradino, non
una misura del presente.

| file | cosa misurava | perché è qui |
|---|---|---|
| `banco.py` | il banco di collocazione per la partizione V8, e `import colloca` — un modulo che vive solo in `.scratch/inserimento/` | **non parte**: l'import non esiste più |
| `loo_esatto.py` | il leave-one-out esatto su `bolle-nitrile-V8` | la partizione non è più quella |
| `voto_diretto.py` | la regola dei voti nella prima versione | superata dal ticket 03 di `eterogeneo` e poi da `collocator` |
| `geometria.py` | la geometria dei centroidi V8 | idem: i centroidi sono su `subvoti` |
| `coerenza.py` | la coerenza delle bolle di V8 | idem |
| `sim_trama.py` | la similarità di trama sul triangolo V8 | idem (e la lezione è nel report 48: *«il modello sbagliato»*) |

**Cosa resta vivo** in `graph/measure/`: tutti gli altri. Se un giorno servono di nuovo, la strada è
allinearli a `canon.PARTIZIONE`/`canon.A(...)`, non ricopiarli qui.
