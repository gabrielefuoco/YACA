Status: resolved
Type: task

# Simmetrizzazione incrementale per i titoli nuovi

## Il problema

L'artefatto è diretto e append-only. Se si aggiunge solo la riga `i_new`, la colonna di `i_new` resta
vuota e `min(W, Wᵀ)` azzera tutti gli archi del nuovo titolo. Per questo `aggiorna.py` esiste ma il
timer notturno non è mai stato attivato.

## L'idea

Per un titolo nuovo gli archi uscenti provengono da tipi **intrinsecamente simmetrici** (coseno dello
studente, TRAMA, KWSEM, CAST, DIR, COLL). La mancata reciprocità dipende **solo** dal troncamento
top-k delle righe dei vecchi nodi. Quindi:

1. Salvare insieme al grafo un vettore `kth_weight[N]` float32: il peso del k-esimo vicino di ogni riga
   (300 KB).
2. Per ogni arco nuovo `(i_new, j, w_ij)`: se `w_ij ≥ kth_weight[j]`, l'arco reciproco sarebbe
   matematicamente nella top-k di `j`, quindi si inietta sia in riga sia in colonna al caricamento di
   `transizione_pronta()`.
3. `aggiorna.py` scrive un delta `delta-edges.npz` con le triple nuove; il caricamento fonde base + delta.

## Criteri di accettazione

- Con un delta di 200 titoli simulati, la transizione costruita in modo incrementale è **identica**
  (stessi archi e pesi) a quella ricostruita da zero — test di uguaglianza esatto su 200 righe campione.
- Il tempo di caricamento resta sotto 3 secondi.
- `ops/yaca-grafo.timer` può essere abilitato solo dopo che questo test passa.

## Nota

Dipende dalla decisione sul traversal: se il prodotto resta su `pota((W+Wᵀ), 16)`, la condizione di
ammissione va espressa sul peso **simmetrizzato**, non su quello diretto.

---

## Esito

`services/graph_dense/delta.py`: `paia`, `kth_pesi`, `aggiungi`, `carica_con_delta`. L'incremento
riproduce **esattamente** la ricostruzione da zero (test di uguaglianza su matrice sintetica), con
sfratto del vicino più debole (senza sfratto le righe crescono di uno a ogni aggiornamento).

Limite dichiarato: il bersaglio è `topk(W + Wᵀ, k)` **senza** la risimmetrizzazione finale di
`camminata.pota`. Con quella, una riga dipende anche dalle righe dei vicini, quindi l'incremento
esatto richiederebbe di ricalcolare a due passi di distanza. Chi vuole la matrice del motore fa
`D + D.T` al caricamento: è una somma, non una potatura, e non cambia l'ordine delle righe.
