# Ticket 07 — La mappa a 6+2, simmetrizzata

`Status: resolved` · 14/10/2026 · esito di `07-mappa-6-2.py` e `07b-simmetria.py`

**Fatto, e il controllo di §2.4 passa nei due versi.** Ma la misura ha portato a galla che sulla
mappa V8 la struttura a otto slot **non seleziona niente**: il grafo delle bolle è saturo.
La buona notizia è che il difetto è dell'adiacenza, non del peso.

---

## La simmetrizzazione: il mio primo tentativo era sbagliato

Avevo scritto: se `F` sceglie `S` come ponte cross-medium e `S` ha già due ponti, **sostituisci il più
debole**. La misura l'ha bocciato subito:

```
ponti aggiunti per simmetria: 0 · sostituiti (il piu' debole): 2.691
coppie ancora asimmetriche dopo la correzione: 2.264   <-- doveva essere 0
```

Sostituire **evince** un ponte che era già stato simmetrizzato, quindi il difetto si sposta invece di
chiudersi. L'esperto dice «**aggiungi** anche F ai ponti di S» — aggiungere, non sostituire. Con la
**unione**:

```
dopo la UNIONE simmetrica: coppie asimmetriche 0 · ponti per bolla: mediana 2 · media 3,7 · massimo 78
bolle con piu' di 2 ponti: 395/1.625 (24,3%)
```

**Zero asimmetrie**, e il prezzo è dichiarato: una bolla che molti scelgono come ponte ha più di due
ponti. La mappa salva la **relazione simmetrica completa** (`cross_lun` dice quanto è lunga) e ne
espone al prodotto una troncata a 4; sta al prodotto decidere quanti mostrarne. Gonfiare il numero di
slot per far stare tutti non è un'opzione: gli otto slot sono una promessa della UI.

## Il controllo di §2.4

```
bolla 1313 ( 17 titoli, film)  -- Guerre stellari, Star Wars: Gli ultimi Jedi, L'ascesa di Skywalker
bolla 1090 ( 23 titoli, serie) -- The Clone Wars, The Mandalorian, The Bad Batch

1313 vede 1090?  SÌ
1090 vede 1313?  SÌ
```

E i vicini hanno senso: i ponti cross-medium di 1090 sono 1313 (i film), **1424** (i LEGO Star Wars
Christmas e Holiday Special) e altri; gli intra-medium di 1313 sono 1449, 1424, 1320... Il difetto che
l'esperto descrive — «*The Mandalorian* non vede *Guerre stellari* perché ha altre 8 bolle-serie con
peso maggiore» — è riparato.

## La scoperta: la mappa è satura, e gli otto slot non selezionano

| | |
|---|---|
| adiacenze fra bolle | 1.249.858 su 1.306.536 coppie possibili = **95,7%** |
| grado di una bolla | mediana **798**, minimo 48, massimo 1.485 |
| bolle **senza** nessun ponte cross-medium | **0 su 1.625** |
| peso del 6° vicino / 7° | mediana **1,074** |
| salto fra il 6° e il 7° | 157% del peso medio degli archi |

Una bolla su due confina con oltre 798 altre. **«I 6 vicini» sono i primi 6 di 798**, e il rapporto fra
il sesto e il settimo è **1,074**: non c'è un ginocchio, il sesto vicino non è più importante del
settimo. La mappa a otto slot è **formalmente giusta e praticamente vuota**, e va detto prima che
qualcuno la usi per decidere cosa mostrare.

## Ma il difetto è dell'adiacenza, non del peso

Questa è la parte che salva l'idea. Sull'arco di §2.4:

```
peso dell'arco 1313-1090:      22,4
peso MEDIANO degli archi di 1313: 0,0     <-- la mediana è zero
peso MASSIMO degli archi di 1313: 66,8
```

**La mediana del peso è zero.** Il grafo è saturo di **adiacenze** (95,7% delle coppie ha un arco
`>0`) ma quasi tutte hanno peso trascurabile: le relazioni vere sono poche e pesanti, l'arco Star Wars
↔ Mandalorian vale il **34% del massimo**. Quindi la struttura a 8 slot diventa significativa appena si
**soglia per peso** invece che per esistenza — e questo è un lavoro da fare sulla mappa, non un difetto
della mappa.

**Raccomandazione concreta per il prossimo giro:** costruire i 6+2 sul grafo **pesato** (top-k per peso,
o soglia al percentile), non sull'adiacenza binaria. Il ticket 23 di `grafo-servibile` aveva già
misurato che il k-NN **mutuo** frammenta la mappa (143 componenti) mentre il k-NN **diretto**
simmetrizzato la tiene intera: la strada è il diretto simmetrizzato **sul peso**, che è esattamente il
caso in cui la simmetrizzazione di questo ticket serve.

## (purezza, pct_locale) ricalcolati su V8 — ticket 14

| | |
|---|---|
| purezza di medium | media **0,946** · monomedium 935/1.625 |
| pct_locale | mediana **0,159** · media 0,190 |

| purezza della bolla | titoli | pct_locale mediana |
|---|---|---|
| 0,5-0,7 | 6.991 | 0,196 |
| 0,7-0,9 | 7.524 | 0,172 |
| 0,9-1,0 | 51.744 | **0,149** |

Un titolo ha solo il **16% dei suoi vicini nella propria bolla**: è la stessa saturazione vista
dall'altro lato. E il `pct_locale` è **più basso** nelle bolle pure — controintuitivo a prima vista, ma
coerente: le bolle pure sono quelle grandi (51.744 titoli nell'ultima fascia), e più una bolla è grande,
più i suoi membri hanno vicini fuori. Non è un difetto della partizione: è il grafo che è troppo denso
rispetto a una partizione da 1.625 pezzi.
