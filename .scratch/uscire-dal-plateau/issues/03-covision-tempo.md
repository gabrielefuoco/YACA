Status: ready-for-agent
Type: task
Blocked by: 02

# COVISION: togliere `--semplice`, riattivare la finestra temporale, e il secondo ordine fuori finestra

## Il difetto

`build-v18.sh:59` invoca `covision.py build --semplice --minsup 1 --topk 20`. Con `--semplice` la
`score()` salta il fattore temporale (finestra `LAG=365` giorni dall'uscita) e la normalizzazione p99
fra le quattro fonti. Risultato: *Barbie* eredita l'intera co-visione congiunturale 2022-2023.

## Cosa fare

1. Rigenerare COVISION **senza** `--semplice` (con `LAG=365` e normalizzazione fra fonti) e con
   `--topk 150` invece di 20. Costo atteso ~25 minuti sui corpus in `.cache/`.
2. Costruire il tipo **COV2** (secondo ordine fuori finestra): matrice COVISION non troncata, si
   azzerano gli archi fra titoli usciti a meno di ±365 giorni (usando le uscite ordinali), poi
   `TruncatedSVD(n_components=256)` e coseno fra le righe. L'idea: per sapere se *Barbie* e
   *Oppenheimer* hanno lo stesso pubblico, si guarda **cosa hanno visto gli spettatori prima del 2022**.
3. Misurare: banco (IC), quota >5k, e la top-10 di *Barbie*, *Oppenheimer*, *Drive*.

## Criteri di accettazione

- *Oppenheimer* esce dalla top-10 di *Barbie* o scende oltre il rango 30 nella riga COV2.
- COVISION senza `--semplice` non perde più di 0,005 di R@20 sul banco.
- COV2 ha copertura ≥ 95% delle righe e grado mediano 100-200.

## Note

Il secondo ordine va calcolato **dopo** aver rimosso la finestra, non prima: sulla matrice troncata a
top-20 i profili di *Barbie* e *Oppenheimer* sono identici e la SVD li unisce ancora di più.
