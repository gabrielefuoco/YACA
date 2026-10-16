Status: ready-for-agent
Type: task
Blocked by: 01

# 07 — Il motore diventa un servizio

## Perché

Il confine deciso in charting (decisione 2) è che il motore delle raccomandazioni sia un **servizio**: il
prodotto gli manda semi e opzioni, lui risponde con liste spiegate. Il contratto lo scrive il ticket 01; qui
il modulo impara a **rispondere**.

Oggi `graph/` è una pipeline offline guidata da comandi: `python -m graph.pipeline esporta|parita|build`
(`graph/pipeline.py` contiene anche il DAG: `PASSO`, `piano()`), e `motore.py` espone `deduci`, `modula`,
`scegli_mondi`, `lista`. Niente di tutto questo è raggiungibile dal prodotto: il ponte è un file.

## Cosa deve uscire

- **Un processo che risponde**, dentro il modulo: riceve una richiesta conforme al contratto 01, la esegue
  con il codice che già esiste (`motore.py`, `camminata.py`, `raccomanda`-equivalente lato Python), e
  risponde. Nessuna riscrittura del motore: la logica c'è, manca la porta.
- **L'artefatto letto dal modulo, non dal prodotto**: `graph/data/` (138 MB sul mate) è già la sua casa;
  `src/data/bolle.json` è la copia che il prodotto si è tenuto. **La casa dell'artefatto IN PRODUZIONE è una
decisione di questo ticket** — volume montato (come `/srv/yaca/modulo/` oggi) o dentro l'immagine? — perché è
ciò che il ticket **09** presuppone quando decide come si pubblica verso il prodotto: se le due risposte si
contraddicono, il servizio parte rispondendo su un artefatto vecchio, e senza un errore. Criterio: misurare
(138 MB in `graph/data/`, i parquet TMDB in `.cache/tmdb/`, ~20 s di caricamento del motore). Il lato prodotto
lo chiude il 09.
- **Il tempo di risposta misurato**, non stimato: quanto ci mette una richiesta tipica (una storia da ~100
  semi, 4 liste, cap 60) a caldo e a freddo, e quanto pesa in RAM il processo. Il prodotto lo chiama al
  cache-build, ma un tetto serve al contratto.
- **Il degrado**: cosa risponde quando l'artefatto non c'è, quando la storia è vuota, quando un id non è nel
  grafo. Il comportamento atteso è già scritto nel prodotto (*una riga vuota è meglio di un feed rotto*,
  `raccomanda.js`) e nel contratto 01.
- **I test**: `pytest` (3 s per 22 test) resta l'anello veloce. Un test del contratto — una richiesta
  d'esempio con una risposta asserita — vale più di dieci test interni.
- **L'immagine e la sua assenza**: il processo **non** entra in `docker-compose` in questo ticket (lo decide
  il 08, che è il primo a chiamarlo). Se entra, entra con il suo `Dockerfile` e i suoi volumi (gli artefatti:
  `graph/data/` è 138 MB sul mate, `.cache/tmdb/` sono i parquet TMDB).

## Come si verifica

Eseguendo il codice deployato, come sempre: il servizio risponde **la risposta vera** del motore per una
storia vera, e l'esempio del contratto 01 è quello che si ottiene. Il confronto con il prodotto è
`python -m graph.pipeline esporta` (l'artefatto resta rigenerabile in ~10 s) e `parita` per il fixture.

## Attenzione

`DELTA_FASCIA` è marcato **INVENTATO** in `graph/parametri.py`, e gli assi **modulano l'attivazione, non
filtrano** (mappa `suggerimenti` §13). Se il contratto espone gli slider, questo ticket deve dire cosa
risponde il motore per un valore che non è calibrato — e non nasconderlo dietro un default.
