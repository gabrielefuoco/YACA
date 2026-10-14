# Ticket 01 — il modello dello studente, e i vocabolari

**Script**: `features.py` (la costruzione di FX, estratta) + `01-modello.py` (il refit e la verifica)
**Modello salvato**: `.cache/movielens/inserimento-modello.npz` (coef 128x7934 + intercept) e
`inserimento-vocabolari.pkl`.

## Il risultato

**Il modello e' riproducibile, e i vocabolari sono congelati.** Le tre verifiche:

| | |
|---|---|
| l'ordine delle righe di `cat` | **coincide** con `spazi-trakt.npz` (66.259, 49.709 film, 16.550 serie) — quindi lo studente **non** era disallineato |
| la matrice `FX` | **forma e nnz identici** (66.259 x 7.934, 1.660.603 archi), e la tfidf con **differenza massima 6e-8** (precisione float32) |
| il refit `FX -> Cf` | differenza massima dalla `P` salvata **0,0013**, e **99,3% dei vicini in comune** (mediana 50/50 su 40 titoli) |

**I vocabolari sono congelati**: gerarchia keyword 1.982 colonne, generi 19, lingua 25, persone 3.000,
collezioni 800, compagnie 600, sceneggiatori 1.500. Tre blocchi sono **vuoti per costruzione** e va
detto: **paesi 0** e **lingue parlate 0**, perche' il parquet TMDB ha `production_countries` e
`spoken_languages` come **liste di stringhe**, e `jids()` cerca dizionari. Succede **identico
nell'originale**: quei blocchi di colonne sono vuoti anche li'. Non e' un difetto introdotto qui.

## Gli errori miei, che vale la pena raccontare

Tre falsi allarmi in un giro solo, tutti smontati da un controllo:

1. **Offset dei generi**: nell'originale gli indici dei generi partono da `NT`, io partivo da 0 e i
   generi collidevano con la gerarchia keyword. Trovato dal `+163.625` non-zero in piu'.
2. **Zeri espliciti**: `csr_matrix(array_denso)` **scarta gli zeri**, io li scrivevo sempre. E' il
   grosso del +163.625 (le 3 colonne dense e le 5 numeriche).
3. **Addestrato sulla matrice sbagliata**: `Ridge.fit(FX[ha], ...)` invece di `fit(tfidf[ha], ...)`.
   E' l'errore che mi ha fatto sospettare un'instabilita' che **non esiste**: il modello dava
   correlazione 0,76 col vero e proiezioni con **0/50 vicini in comune**. Con la matrice giusta,
   correlazione **1,0000** e **50/50**.

**E una cosa che ho rischiato di dichiarare e che era falsa**: guardando lo 0,76 ho scritto che *«il
modello CFst e' instabile, quindi i suoi archi sono rumore»*. Me ne sono accorto dall'aritmetica: un
modello con `||coef|| = 11,39` non puo' amplificare una perturbazione di 1e-7 in 0,58 — sono tre
ordini di grandezza. **Il test giusto era confrontare i coefficienti**, e li' si e' visto che il
problema ero io.

## Cosa resta vero

- **La proiezione e' stabile**: perturbando la tfidf di 1e-8 i vicini restano **50/50**.
- **Il modello e' utilizzabile**: la differenza residua (0,0013) non sposta i vicini in modo
  misurabile (99,3%).
- **Il costo**: il refit e' 11-50 s, la proiezione di un titolo e' un prodotto scalare. La funzione
  per il titolo nuovo e' `features.costruisci_fx` su una riga sola.

## Cosa manca, e va deciso prima del ticket 02

**I vocabolari sono congelati sul catalogo**: una compagnia di produzione che nasce domani, o una
lingua che oggi non c'e', **non ha colonna**. Va deciso cosa farne (ignorarla, o mapparla alla piu'
vicina), e va dichiarato. E' l'unico punto in cui un titolo nuovo puo' differire dal catalogo in modo
strutturale.

E una nota per il ticket 02: **la proiezione non e' l'unico canale**. Il test di Verity ha gia'
mostrato che la regia e' il segnale piu' netto (sei similarita' di 1,0000 con i film di Michael
Showalter), mentre le keyword sono generiche. Il ticket 02 deve confrontare i due, non sostituirne uno.
