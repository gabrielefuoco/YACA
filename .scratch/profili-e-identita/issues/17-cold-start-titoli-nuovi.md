# Un film nuovo non entra nel grafo: cold start senza studente

Status: ready-for-human
Type: grilling
Blocked by: —

## Il fatto

Il canone V45 è congelato a **76.497 titoli**. Un titolo che non è in quelle righe **non può essere un seme**, ed è scartato in silenzio:

```python
# services/graph/runtime/engine.py:412
if not key or key not in self.row_of:
    return None
```

Nessun log, nessun avviso: se l'utente guarda un film uscito ieri, quel segnale semplicemente non esiste. Le raccomandazioni restano corrette, ma ignorano la sua visione più recente — che è esattamente quella che pesa di più.

## Cosa esisteva, e non è collegato

- `.scratch/distillazione-grafo/cold-encode.py` — *«piazza un film NUOVO nello spazio di m1 e b10 senza addestrare»*: prende trama e keyword proiettate più le feature strutturali, le passa agli studenti (`GatedStudent`, `BlockStudentG`, `FieldStudent`) e ne ricava l'embedding. Lo cita solo un documento di handoff: **nessuna rotta, nessun job, nessun chiamante**.
- `estensione_bolle.py` (archiviato) — non era cold start: estendeva la partizione delle bolle da 66.259 a 76.497 una volta sola, per non invalidare gli ID.

## Cosa manca, oltre al codice

1. **L'artefatto dello studente.** `rrfstudent-norrfst.npz` è stato cancellato durante la pulizia dei dati (ticket 15) e non è recuperabile: pesava 1.0 nella fusione RRF di V45, e servirebbe identico per collocare un titolo nuovo **coerentemente** con il grafo che servi. Senza, un titolo nuovo verrebbe collocato da un altro studente, quindi in una posizione plausibile ma non coerente con i suoi vicini già nel grafo.
2. **La cucitura degli archi.** Anche avendo l'embedding, un titolo nuovo va collegato: cast, regia, keyword, trama, paesi, decennio. Il mixer sa fonderli per il canone intero; non esiste un pezzo che li calcoli **per una riga sola** contro le righe esistenti.
3. **La decisione**: un titolo nuovo può *entrare* nel grafo (modificando la matrice servita) o solo *essere pesato* come seme (una riga temporanea in memoria, che vive il tempo di una richiesta)? Sono due architetture diverse: la prima vuole un job di aggiornamento e una nuova versione del grafo, la seconda vuole un'estensione a runtime e nessuna scrittura.

## Le strade

1. **Rigenerare uno studente** dal triangolo V10 (il maestro esiste, `train_b1.py` è archiviato): costo in GPU, e il risultato **non è identico** all'originale, quindi il grafo ricostruito somiglia a V45 ma non lo riproduce.
2. **Collocare senza studente**: cucire gli archi del titolo nuovo da cast/regia/keyword/trama verso i nodi esistenti, e aggiungere la riga al grafo in memoria. Niente studente, niente training: si usa ciò che il mixer già sa fare, applicato a una riga.
3. **Non collocare**, e rendere rumoroso lo scarto: almeno un log con il titolo scartato, così il buco è visibile invece che silenzioso.

## Da decidere

- Quale delle tre strade, e se il titolo nuovo debba **entrare** nel grafo o solo **pesare** come seme per la richiesta corrente.
- Con quale frequenza i titoli nuovi arrivano (il daemon TMDB aggiorna il catalogo: quanti al giorno?), perché questo decide se serve un job o basta un'estensione a runtime.
- Cosa succede quando un titolo nuovo *non* si riesce a collocare — e oggi la risposta è "niente, sparisce".
