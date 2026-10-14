Status: resolved
Type: task

# 04 — Il collocatore in una funzione, e la proposta per `src/`

Due cose, nessuna delle quali tocca il prodotto.

**A. Il collocatore.** Una funzione sola, documentata, che dato un titolo nuovo restituisce la bolla:
il voto diretto (coseno, pesi uniformi, leave-one-out), la regola di medium decisa al ticket 03, e il
punteggio di confidenza. Con i numeri finali per film e serie, e il costo in millisecondi per titolo.

**B. La proposta per `src/`**, come **documento**: cosa servirebbe, dove andrebbe, quali sono i rischi,
e cosa si rompe se si sbaglia. In particolare:
- il voto diretto e' un **coseno** fra due vettori: nessun modello da riaddestrare, ma servono i
  **centroidi** (336 + 1.189 vettori da 122.314 termini, sparsi) e il **vocabolario** congelato;
- i tre contratti di `canone.py` non hanno senso in produzione cosi' come sono: dire quali dei tre
  valgono la pena e in che forma;
- l'indice dei termini di un titolo nuovo lo costruisce TMDB, quindi il vocabolario va **congelato** e
  versionato: se cambia, tutti i centroidi vanno rifatti;
- cosa **non** portare: il banco, i contratti di banco, e la tentazione di rifare la partizione.

Esito: `colloca.py` + `ricerche/04-proposta-src.md`. **Nessuna riga di `src/`.**

## Esito

Il collocatore in una funzione: metadati -> token -> TF-IDF con vocabolario congelato -> coseno contro i 1.525 centroidi -> regola di medium. 8,7 ms per titolo, nessun modello. Gli esempi sono la valutazione giusta: The Tonight Show con Jimmy Fallon E con Johnny Carson finiscono nella STESSA bolla (coi Late Show); Spider-Man: Brand New Day coi Marvel; Resident Evil coi film di zombie; e VERITY nella bolla 820 con Inception, Fight Club, L'amore bugiardo - Gone Girl e Shutter Island: la risposta alla domanda da cui e' partita la sessione, arrivata per una via diversa (coseno invece di Ridge). Corretta una regola scritta a meta': il medium valeva solo per le serie, e un film poteva atterrare in una bolla di serie. La proposta per src/ e' un documento (7 MB di centroidi, 2 di vocabolario, 130 KB di partizione, ~80 righe), con i quattro rischi e la domanda che conta: serve un collocatore in linea, o basta un job notturno? NESSUNA RIGA DI src/.
