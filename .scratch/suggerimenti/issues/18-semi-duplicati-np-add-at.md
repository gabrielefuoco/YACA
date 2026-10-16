Status: resolved
Type: bug

# `e[seme] = w` perde la massa quando `seme` ha indici duplicati (difetto latente)
**Prova**: in NumPy l'assegnamento indicizzato con duplicati sovrascrive, non somma: `e = [0,0];
e[[0,0]] = [3,7]` da' `[7,0]`, non `[10,0]`. `camminata.ppr` fa esattamente questo, e a valle
`normalizza=True` maschera la perdita (divide per `r.sum()`), `normalizza=False` no.
**MA LA SPIEGAZIONE DEL SENIOR NON REGGE, e va detto**: lui collega a questo il residuo dell'1% in
`pesi.py`. **Verificato: su 60 utenti e 19.218 righe di storia i duplicati sono ZERO.** Una storia di
Trakt ha una voce per titolo, e `storia_trakt` cicla `movie` e `show` che sono insiemi disgiunti. Quindi
il meccanismo e' vero come **difetto latente**, ma **non spiega** quel residuo, che resta senza causa.
**Fix lo stesso** (costa nulla ed e' difensivo): `np.add.at(e, seme, w)` e poi `e /= max(e.sum(), 1e-12)`.
Il giorno che un titolo finisse due volte in una storia — per un tipo di segnale doppio, per un merge di
liste, per una storia costruita a mano con `--file` — il peso sarebbe giusto invece che arbitrario.

---

FATTO il 16/10/2026: `np.add.at(e, seme, w)` e poi `e /= e.sum()` (anche nel caso uniforme). **Resta un residuo senza causa**: il difetto e' latente (zero duplicati su 60 utenti e 19.218 righe) e quindi NON spiega l'1% di `pesi.py`, che va cercato altrove.
