Status: ready-for-agent
Type: task

# `ricetta.py` misura una formula diversa da quella del motore
**Prova** (`measure/ricetta.py`): `att_con_asse` usa ancora la **vecchia formula lineare**
`att * (1.0 + 0.5 * (quota - 0.5))` invece dell'esponenziale di `motore.modula()`
(`att * np.exp(P.ASSE_PESO * (quota_cozy - quota_imp))`), e per la fascia ordina ancora brutalmente
`o.sort(key=lambda b: VOTMED[b])` invece di chiamare `modula()`.
E' esattamente il difetto che il ticket 07 ha chiuso per la diffusione: **l'arbitro misura una variante
del motore credendo di misurare il motore**. L'ha visto il senior, non il mio refactor — perche' il
refactor ha guardato il ciclo della diffusione e non la modulazione.
**Fix**: far chiamare a `ricetta.py` direttamente `Motore.modula()`. Poi **ristampare**: le conclusioni
sugli assi (il cozy cambia un terzo dei titoli, l'impegnativo non cambia niente, la fascia fa crollare la
copertura) vanno riverificate con la formula vera.
