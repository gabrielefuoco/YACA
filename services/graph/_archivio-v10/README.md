# Archivio del motore V10

Qui dentro c'è il codice del motore V10 e degli esperimenti che lo hanno accompagnato. **Non è
raggiungibile dal servizio**: nessun modulo in `services/graph/` lo importa, e i test non lo toccano.

## Perché è qui e non è stato cancellato

Sono esperimenti documentati: le ricette che hanno prodotto le versioni del grafo, le misure che
hanno deciso i parametri, il motore che ha servito prima di V45. Alcuni numeri che stanno nei ticket
di `.scratch/` vengono da qui, e senza il codice non si potrebbero rifare.

## Cosa contiene

| percorso | cos'era |
|---|---|
| `motore.py` | il motore V10: caricava gli artefatti bubble in ~50 secondi e serviva con PPR densa |
| `pipeline.py` | la CLI offline del V10 (`lista`, `artefatto`, …): il comando `lista` parlava ancora di `largo`/`lontano` |
| `collocator.py` | la collocazione dei titoli nello spazio denso |
| `uscite.py` | l'estrazione delle uscite per i cataloghi editoriali |
| `bubbles.py` | lettura/scrittura degli artefatti «bolle» |
| `estensione_bolle.py` | estensione delle bolle ai titoli nuovi |
| `anime.py` | regole anime del V10 (sostituite da `tassonomia.py` + il flag `ANIME` del canone) |
| `steps/` | i sette passi che costruivano il grafo V10 (embedding trama → mappa) |
| `measure/` | le misure: freddo, diffusione, equilibrio, lettura, ricette, sonde |

## Cosa **non** è qui, e resta vivo

- `canon.py`, `parametri.py`, `provenance.py`, `camminata.py` — li importa il runtime V45.
- `interessi.py`, `tassonomia.py`, `assi.py`, `kids.py`, `servizio.py` — il servizio.
- `runtime/` — il motore sparso che serve oggi.
- `build/` — la pipeline **riproducibile** dai dati grezzi (`python -m graph.build`).
- `upstream/` — come le fonti (Trakt, voti, spazi) sono diventate canone: è la provenienza dei dati, non un esperimento.

## Come si riattiva

Non si riattiva: V45 è il grafo servito e il rollback è la release precedente, non il V10.
Se servisse rifare una misura storica, si importa da qui con
`PYTHONPATH=services py -m graph._archivio-v10.pipeline` — sapendo che i percorsi degli artefatti
dentro quei file puntano a `services/graph/data/`, dove le versioni sperimentali non ci sono più.
