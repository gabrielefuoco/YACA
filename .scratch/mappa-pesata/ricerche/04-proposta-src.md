# Ticket 04 — Il collocatore in una funzione, e la proposta per `src/`

`Status: resolved` · 14/10/2026 · `colloca_finale.py` + questo documento. **Nessuna riga di `src/`.**

---

# A. Il collocatore

Una funzione, tre passi, nessun modello.

```
metadati TMDB -> token -> vettore TF-IDF (vocabolario congelato) -> coseno contro i centroidi
             -> regola di medium -> (bolla, confidenza)
```

In `colloca_finale.py`: `carica()`, `tokenizza(dd, tipo)`, `vettore(token, S)`, `colloca(dd, tipo, S)`.

**Costo misurato: 8,7 ms per titolo** (100 titoli, partizione e centroidi in memoria). È un prodotto
sparse-matrice per vettore: nessuna Ridge, nessun riaddestramento, nessuna dipendenza da sklearn in
produzione. I 7,7 ms dello studente dei film di `inserimento` erano confrontabili, ma quello aveva un
modello da riallenare quando cambia il grafo.

## Gli esempi, che sono il modo giusto di valutarlo

| titolo | bolla | dentro |
|---|---|---|
| The Tonight Show with **Jimmy Fallon** | 560 (65 tit.) | The Tonight Show, The Late Late Show, The Late Show with Stephen Colbert |
| The Tonight Show with **Johnny Carson** | **560** | gli stessi — un talk show del 1962 e uno del 2014 nella stessa bolla |
| **Spider-Man: Brand New Day** | 1098 | Spider-Man: No Way Home, Guardiani della Galassia, Doctor Strange, Thor: Ragnarok |
| **Resident Evil** | 1087 | Warm Bodies, Zombie 100, Little Monsters, Dead Rising |
| Renegade Immortal (film) | 749 | Hercules, Percy Jackson, La furia dei titani, The Last Witch Hunter |
| **Verity** | **820** | Inception, Fight Club, **L'amore bugiardo — Gone Girl**, Shutter Island |

L'ultima riga è la risposta alla domanda da cui è partita questa sessione, ed è arrivata **per una via
diversa**: nel primo effort `inserimento` *Verity* finiva con *Gone Girl* attraverso una Ridge
addestrata sullo spazio CF; qui ci arriva con un **coseno fra metadati**, senza modello. Due metodi
indipendenti, la stessa bolla.

## Le scelte, ognuna misurata altrove

| scelta | perché | dove è stato misurato |
|---|---|---|
| **coseno** e non prodotto scalare | 35,3% contro 29,7% | `todo-grafo` 05 |
| **pesi uniformi** dei membri | il grado interno peggiora (28,7% contro 29,7%) | `todo-grafo` 05 |
| **leave-one-out** solo nel banco | in produzione il titolo non è membro di nessuna bolla | `todo-grafo` 06c |
| **regola di medium simmetrica** col margine 1,0 | +1% misurato, e tiene i due cataloghi separati | `mappa-pesata` 03 |
| **confidenza = coseno** | i successi hanno coseni 0,11-0,46, gli errori 0,02-0,06 | `todo-grafo` 05 |

**La regola di medium era scritta a metà.** La prima versione la applicava solo alle serie, e un film
poteva atterrare in una bolla di serie — *Renegade Immortal* finiva in una bolla di 46 anime. Nel
prodotto i due cataloghi sono separati in **tutte e due** le direzioni: una regola a metà è peggio di
nessuna regola, perché non si vede. Corretta.

---

# B. La proposta per `src/`

**Da decidere, non da eseguire.** `src/` non è stato toccato.

## B1. Cosa serve portare

| artefatto | dimensione | note |
|---|---|---|
| **centroidi** | 1.525 × 122.314 **sparsi**, 893.290 valori ≈ **7 MB** | le somme delle bolle; le norme in un vettore a parte |
| **vocabolario + idf** | 122.314 termini ≈ **2 MB** | `04-vocab.json` ha i termini, **non** gli idf: vanno salvati insieme |
| **partizione V8** | 66.259 × int16 ≈ **130 KB** | più `sz` e `quota_tv` per bolla |
| **la funzione** | ~80 righe | `tokenizza` + `vettore` + `colloca` |

**Sette megabyte scarsi e nessun modello.** Questo è l'argomento principale: il collocatore è un file
di vettori, non un servizio.

## B2. Dove andrebbe

Un modulo a sé, con una superficie di tre funzioni — `carica()`, `colloca(metadati, medium)`,
`confidenza()` — e nessuna dipendenza dal resto. Il posto naturale è accanto a chi costruisce i
cataloghi (`src/catalog/`), perché è quello che fa: **mette un titolo nuovo nel posto giusto prima che
abbia comportamenti**.

## B3. Il caso d'uso vero

L'add-on ha bisogno di collocare un titolo **appena uscito**, che non ha né visioni né co-visioni. Il
numero che lo riguarda è quello del banco a freddo: **film 27,7%** nella propria bolla con **0,0%** in
bolle scollegate, **serie 35,3%** con **0,3%**. E il controllo di `inserimento`: **8 uscite 2026 su 8**
nel mondo giusto.

**Il collocatore dice *dove* va un titolo, non *cosa* raccomandare.** Sono due problemi diversi: il
secondo è la camminata sul grafo, che il prodotto ha già.

## B4. I rischi, in ordine di quanto farebbero male

1. **Il vocabolario va congelato e versionato insieme agli idf.** Se cambia, tutti i 1.525 centroidi
   vanno rifatti, perché i due lati del coseno non parlerebbero più la stessa lingua. È l'errore più
   facile da fare e il più silenzioso: nessun crash, solo punteggi che scivolano.
   C'è già un precedente in questo progetto — `genres` mai letto e `production_countries` scartato —
   e in tutti e due i casi l'ha trovato una lettura a mano, giorni dopo.
2. **I termini fuori vocabolario sono il 10-40%** di un titolo (misurato: 7 su 20, 11 su 23, 0 su 38).
   Un titolo con metadati molto nuovi — un franchise nuovo, nomi nuovi — entra con poco segnale. Va
   **misurato in produzione**, e la confidenza serve a questo.
3. **La dimensione della bolla decide la precisione**: 85,7% sotto i 10 titoli, 21% sopra i 120. Il
   coseno lo riflette (0,11-0,46 contro 0,02-0,06), quindi la confidenza **non è un'opzione**: senza
   soglia, un quinto delle collocazioni finisce in un minestrone con l'aria di essere una risposta.
4. **La partizione cambia, i centroidi vanno rifatti.** Ma cambiare la partizione **non** richiede di
   riaddestrare un modello: è il vantaggio del coseno, e vale la pena di non perderlo riempiendo il
   modulo di stato.

## B5. Cosa **non** portare

- **Il banco** (i 600 nascosti, il leave-one-out, le sentinelle): è strumentazione di laboratorio.
- **Il tentativo di rifare la partizione in produzione.** V8 è congelata, e il ticket 09 di
  `bolle-nitrile` ha già misurato che RB 200 frantuma e RB 60 cola.
- **Il ponte film→serie**: misurato e bocciato (`todo-grafo` 06). Non riprovarlo senza una ragione
  nuova.
- **I contratti come assert di produzione.** Tre erano per il laboratorio. Due valgono anche in
  servizio, e in forma più leggera: che nessuna classifica si calcoli su punteggi **costanti** (il
  teacher nullo del report 58), e che ogni percentuale di successo stampata abbia accanto il suo caso
  (l'adiacenza del 79,4% che valeva 1,2 volte il caso).

## B6. La domanda da fare prima di scrivere codice

**Serve un collocatore in linea, o basta un job offline?** Il catalogo TMDB si aggiorna in modo
prevedibile, e una collocazione richiede 8,7 ms: un lotto notturno che colloca i titoli nuovi e scrive
il risultato accanto alla partizione è più semplice, ispezionabile e reversibile di una chiamata in
richiesta. **La raccomandazione in linea non ha bisogno di questo modulo: ha bisogno della
partizione**, che è già precalcolata.
