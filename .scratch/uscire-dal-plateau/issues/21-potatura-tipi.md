Status: resolved
Type: task

# Potatura: PROD fuori, CREWPROP dentro DIR, rami morti via

## Proposte del senior (risp3.md §5), da decidere una per una

1. **PROD fuori dal mixer** (peso 0,3): collega qualsiasi film di Warner/Universal/Columbia — rumore
   industriale puro, 100 archi/riga di budget. La parte utile (A24, Neon) è già in LIST/LISTSEM.
2. **CREWPROP fuso dentro DIR/CAST a peso ≤ 0,15**, tenendo l'aggiunta degli sceneggiatori (oggi
   assenti da ogni tipo). Misurato: a 0,15 è indistinguibile da zero; a 0,35 costa SNIPS.
3. **Rimuovere `tone.py`, `critica.py` e i modi `adamic-adar`/`coseno` da `chiudi.py`.**
   ⚠️ Dissenso parziale: `tone.py` e `critica.py` sono la documentazione *eseguibile* di due ipotesi
   falsificate (con i numeri nei docstring). Cancellare il codice cancella la memoria del perché non
   si fa. Proposta: spostarli in `.scratch/falsificati/` con un README, non cancellarli.
4. **SNIPS da 120 a 1.828 utenti** (`trakt.py` ha già tutto in cache): dimezza l'MDE da 0,035 a ~0,012
   e rende conclusivi i confronti che oggi restano sospesi.

## Cosa fare

Misurare l'effetto di (1) e (2) da soli sul dev set, prima di toccare altro. Il punto 3 è una decisione
di casa, non una misura. Il punto 4 è puro guadagno: farlo subito.

---

## Esito parziale (misurato: PROD e CREWPROP fuori)

V26 = V23 senza `PROD` e senza `CREWPROP`: 27.696.856 archi (da 36,1M), grado mediano 370 (da 454).

| | R@5 | R@20 | MRR | >5k |
|---|---:|---:|---:|---:|
| V23 | 0,008 | 0,043 | 0,0083 | 66,5% |
| V26 | 0,009 | 0,041 | 0,0081 | 66,4% |

`ΔR@20 = −0,0012 [−0,0059, +0,0029]`, **rumore**. Toglierli **non costa niente e non guadagna niente**:
sono 8,4M di archi che non spostano la misura. Come potatura di manutenzione è sensata (meno archi, stessa
qualità); come leva no.

Non fatto: fondere CREWPROP in DIR (richiede aggiungere gli sceneggiatori a DIR, che oggi non li ha) e la
decisione su `tone.py`/`critica.py` — **contrario alla cancellazione**: il codice documenta i numeri del
perché due ipotesi sono false. Proposta: `.scratch/falsificati/` con un README.
