Status: resolved
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

---

RINVIATO CON UN'ANALISI MIGLIORE, il 16/10/2026. Qui non basta correggere una formula: `ricetta.py` misura una VARIANTE CHE NON ESISTE PIU'. La sua variante `fascia` **riordina** i mondi per voti mediani (`o.sort(key=lambda b: VOTMED[b])`), mentre il prodotto **modula** l'attivazione con lo slider (ticket 06 e 21): quindi le sue conclusioni sugli assi — «il cozy cambia un terzo dei titoli», «la fascia fa crollare la copertura allo 0,3%» — descrivono un comportamento che il motore non ha. La strada: far chiamare `Motore.modula()` (ora che `Motore()` costa 0,28 s, istanziarlo in un arbitro non e' piu' un problema), rifare la misura, e **riscrivere le conclusioni** — non solo i numeri.

---

RISOLTO il 16/10/2026 — e le CONCLUSIONI sono cambiate, non solo i numeri. L'arbitro ora istanzia `Motore`
(0,28 s: non c'e' piu' nessuna ragione per ricopiarne le formule) e usa `modula` e `scegli_mondi` veri.
Le varianti di FILTRO restano come **controprova**: sono l'esperimento che ha mostrato che filtrare
dentro i mondi svuota le liste, ed e' la ragione per cui il prodotto modula invece di filtrare.

    variante              prima (formula lineare + fascia che riordinava)   adesso (motore vero)
    + nicchia             Jaccard 0.00 · copertura 0.3% · 39 titoli         Jaccard 0.56 · 2.7% · 33
    + popolare            Jaccard 0.00 · 0.7% · 17                           Jaccard 0.37 · 1.9% · 26
    + impegn. pesato      Jaccard 1.00 («non cambia NIENTE»)                 Jaccard 0.67 (cambia)
    + cozy pesato         Jaccard 0.67                                       Jaccard 0.61

**TRE FRASI CHE ERANO FALSE, e ora sono corrette nella tabella dei parametri:**
 · «la fascia fa crollare la copertura allo 0,3%» — era il RIORDINO, non lo slider: col motore vero
   `canone -1` da' 2,7% dell'oro, sopra la base (2,6%);
 · «l'impegnativo NON cambia niente (Jaccard 1,00)» — cambia, eccome (0,67);
 · «le due liste di generi hanno prevalenze molto diverse e probabilmente vogliono pesi diversi» —
   l'asimmetria era un artefatto della formula lineare: adesso cozy 0,61 e impegnativo 0,67, simmetrici.
E la variante base e' passata da 2,4% a 2,6% (e qualche numero di poco): e' il `kind="stable"` nella
sostituzione di `storia` (ticket 30), che rende deterministico l'ordine a parita' di data — prima
dipendeva dall'ordinamento instabile di NumPy.
