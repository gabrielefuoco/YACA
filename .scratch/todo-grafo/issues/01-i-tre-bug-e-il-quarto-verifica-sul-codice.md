Status: resolved
Type: task

# 01 — I tre bug e il quarto: verifica sul codice

Verificare, una per una, le accuse di §0 di `todo grafo.md` **contro il codice vero**, non
contro la copia che l'esperto ha letto (i numeri di riga non tornano: il file e' cambiato).

Per ciascuna: il bug c'e' o no, e **quanto pesa**.

1. `genres` assente da `COLS_M`/`COLS_T`: confermato a lettura. Quanto pesa? Quanti titoli hanno
   `GEN` vuoto (atteso: tutti), e quanti archi `DIR`/`CAST` la maschera avrebbe lasciato passare
   **se** il genere ci fosse. La domanda vera: la maschera di genere, riparata, taglia di piu' o
   di meno di quella rotta?
2. `min_sim=0.12` con shrinkage: e' **nel chiamante** `10-vicinanza.py`, non nel default di
   `bolle.py` (0.02). Misurare il grado mediano di `CAST` a 0.02 e a 0.12, e quanti archi si perdono.
3. `potatura_nucleo` e il triangolo: confermato a lettura. Quanti nodi espulsi vengono riassegnati
   leggendo solo meta' degli archi, e in quante bolle cambierebbe l'esito usando `peso + peso.T`.
4. **Il quarto, non segnalato:** `costruisci_insiemi` legge `networks`, `production_countries` e
   `production_companies` e non le restituisce. Elencare cosa e' calcolato e buttato via.

Esito: `ricerche/01-bug.md` con i quattro verdetti e i numeri, e `01-bug.py` che li produce.
Non correggere niente: la correzione e' il ticket 02.

## Esito

TRE ACCUSE SU TRE FONDATE, e l'esperto aveva ragione anche sui numeri: la maschera taglia il 76,3% degli archi DIR (23,7% tenuti invece del 76,4%). Una accusa pero' punta al posto sbagliato: `min_sim=0.12` non e' nel default di `bolle.py` (0,02) ma nel chiamante `10-vicinanza.py` — e li' e' vero, il grado mediano di CAST e' 0 contro 30 a 0,02. Il bug della potatura e' GRAVE: su 6.132 membri espulsi, 3.042 (49,6%) ricevevano una bolla diversa leggendo meta' triangolo; uno leggeva 0 vicini invece di 51. Trovati DUE bug in piu': (4) `costruisci_insiemi` calcola networks/paesi/studi e non li restituisce; (5) `production_countries` e' una lista di STRINGHE e `leggi()` scarta tutto cio' che non e' un dizionario — 34.331 titoli con un paese non angloamericano e 44.279 firme `pg:` persi in silenzio. Vedi `ricerche/01-bug.md`, `01-bug.py`, `01c-paesi.py`.
