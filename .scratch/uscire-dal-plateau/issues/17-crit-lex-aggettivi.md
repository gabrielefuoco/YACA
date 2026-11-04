Status: resolved
Type: task
Blocked by: 13

# CRIT_LEX: il lessico aggettivale delle recensioni (non il testo intero)

## Perché

Le recensioni full-text hanno densità di tono **0,13%** (193 parole di tono su 146.483): l'embedding
misura la trama raccontata. Ma gli **aggettivi estetici** ci sono, e sono addensati in poche frasi.
Invece di embeddare il documento, si costruisce un **lessico** e si pesa quanto ogni film ne è
descritto.

## Cosa fare

1. Da `recensioni.parquet` (già su disco, 2.061 film) estrarre il vocabolario aggettivale: filtrare per
   suffissi (-oso/-esco/-ico/-ale/-ivo/-ante/-ente/-astro in italiano, -ic/-ous/-ive/-al/-esque in
   inglese) e tenere i termini con df ≥ 20 e df ≤ 400.
2. TF-IDF sul solo vocabolario filtrato, poi SVD a 128 dimensioni → tipo `CRIT_LEX`.
3. Confronto sul dev set contro `TRAMA` e contro `LISTSEM`.

## Segnale di fallimento

Meno di 3 aggettivi di tono per film mediano, oppure *Povere creature!* e *The Substance* restano oltre
il rango 100 della riga di *Barbie* nello spazio `CRIT_LEX` puro: chiudere, la densità non basta.

---

## Esito: il miglior piazzamento di un segnale di contenuto, con copertura troppo bassa

`critica_lex.py`: 906 aggettivi (suffissi italiano+inglese, df 15-500) dalle recensioni, TF-IDF + SVD a
128 dimensioni. **205.459 archi** · **2,7% del canone** ha almeno un aggettivo.

Riga di *Barbie*: *Il grande Lebowski · Amore a prima svista · Jojo Rabbit · Bride Wars · Sister Act*, con
**Povere creature! al #21** — il miglior rango che un segnale di contenuto abbia mai dato a quel film
(TRAMA: #601; keyword: #122 nel grafo).

Ma il 2,7% di copertura lo rende inutile **come tipo d'arco**: tocca 2.061 titoli su 76.497. Vale come
**feature** per un punteggio denso, non come vista sparsa. Il ticket 16/20 non lo usano; va ricordato se
si riprende l'idea di una funzione addestrata — con la riserva dell'utente: quella funzione non si
addestra sul banco, che è test set.
