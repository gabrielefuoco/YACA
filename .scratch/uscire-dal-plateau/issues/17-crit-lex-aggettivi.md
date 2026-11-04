Status: ready-for-agent
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
