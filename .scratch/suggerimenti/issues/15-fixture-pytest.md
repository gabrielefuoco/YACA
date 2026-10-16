Status: ready-for-agent
Type: task

# Micro-fixture a 100 titoli e una suite pytest da 3 secondi
**Perche'**: nel §6.7 dell'handoff 6 sta scritto che il modulo non ha test, e il motivo e' che girare
`bubbles.py` o `motore.py` sul grafo vero chiede 422 MB di artefatti e minuti. Risultato: le
regressioni si scoprono leggendo il codice (o facendo revisionare un digest).
**Fix**: uno script che estrae **una volta** un micro-canone di 100 titoli (5 gruppi da 20: saghe
spaziali, seinen, fincher/nolan, k-drama, spaghetti western), salva `tests/fixtures/micro_graph/`
(~500 KB), e un `tests/test_graph_pipeline.py` che verifica: la miscela + chiusura + Leiden + nucleo non
crashano; `03`/`04` producono impronte valide; il collocatore mette il titolo giusto nella bolla giusta
e **solleva** se l'hash della partizione cambia; i contratti di `canon.py` si accendono sui casi corrotti.
**Chiuso quando**: `pytest tests/test_graph_pipeline.py` passa in meno di 5 secondi senza leggere
niente di `graph/data/`.
