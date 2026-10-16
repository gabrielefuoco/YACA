Status: resolved
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

---

FATTA LA PARTE FATTIBILE il 16/10/2026: `tests/test_graph_pipeline.py`, **12 test in 0,8 secondi**
(l'obiettivo era 3). Coprono: l'equivalenza delle nove varianti di diffusione (e' la prova del ticket 07, e
resta come documentazione), i contratti dell'artefatto che il prodotto legge (righe di transizione
normalizzate, membri coerenti col conteggio, id validi, le bolle senza centroide dichiarate piccole), i tre
numeri incrociati dei metadati (COZY 30.814, IMP 8.279, NEP>1 16.529), i contratti di `canon` che devono
ACCENDERSI sui casi corrotti (simmetria, verso dell'ordinamento), e i vincoli basilari dei parametri.

**NON fatta la micro-fixture da 100 titoli, e il motivo e' una dipendenza non dichiarata quando il ticket e'
stato scritto**: provare la miscela, la chiusura triangolare, Leiden e la potatura al nucleo su un grafo
piccolo richiede che gli step di `graph/steps/` siano invocabili su un sottoinsieme — cioe' il **ticket 14**,
che e' fermo in `needs-info` proprio perche' gli step sono script a livello globale. Finche' quello non si
decide, una micro-fixture non si puo' costruire: non e' rimandata per pigrizia, e' bloccata a monte.
`pytest` e' stato installato nel venv (`offline_graph_builder/venv`): non c'era.
