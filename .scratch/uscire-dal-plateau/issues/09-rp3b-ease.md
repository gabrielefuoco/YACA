Status: needs-triage
Type: research
Blocked by: 01, 02

# RP3β / EASE^R al posto della COVISION euristica

## L'ipotesi

La COVISION attuale è `npmi × log1p(cw)` con opportuni tagli: il termine `log1p(cw)` reintroduce il
bias di popolarità perché cresce con i marginali. Un estimatore lineare regolarizzato con forma chiusa
batte l'euristica a parità di dati, e gira in pochi secondi su CPU.

## Cosa fare

1. **RP3β** sparso: `P ∝ D_β^{1/2} (D_U^{-1} X^T D_I^{-1} X) D_β^{1/2}` con `β ≈ 0,65`, dove `X` è la
   matrice utenti×titoli dei log Trakt. Confrontare con la COVISION attuale su banco (IC), quota >5k,
   copertura della coda media e tempo di build.
2. **EASE^R** a blocchi sui top-15.000 titoli più visti (matrice 15k×15k, inversione a blocchi).
3. Tenere il migliore come sostituto di COVISION; se nessuno dei due vince, **dichiararlo** e chiudere
   il filone (l'euristica resta).

## Criteri di accettazione

- Build in < 5 minuti su CPU.
- Confronto su tre assi (banco, SNIPS, surprise) con IC, non solo R@20.
- Se il guadagno è sotto l'MDE, il ticket si chiude come "non conclusivo" e non entra in produzione.

## Nota

Non è una migrazione architetturale: il resto del grafo, il motore e lo studente restano identici.
