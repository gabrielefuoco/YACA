# 17 — Le serie nello stesso spazio: il tentativo fallisce, e spiega perché

**Data**: 08/10/2026 · `build-film-graph.py` (pseudo-target per le serie) → `film-graph-typeclean.npz`

## L'idea (giusta) e il tentativo

L'utente: «non si può embeddare la serie col classificatore, nello **stesso spazio** dei film? così
abbiamo **un solo criterio**, non due classificatori o due ranker». È l'architettura corretta — ed è
**già quella che abbiamo**: lo student proietta tutti gli 87.848 nodi (film e serie) nello stesso spazio.
Ma lo spazio ha un **asse "tipo"**: un classificatore lineare sulle posizioni predice film/serie con
**AUC 0,979**, e le serie sono stipate fra loro (coseno 0,405 contro 0,153 fra i film).

**Tentativo**: dare alle serie un **pseudo-target** — la posizione propagata dai loro vicini film col
teacher (stabilità 0,573, validata) — e addestrare lo student su film *e* serie insieme, peso 0,5 per i
pseudo-target (bersaglio più debole).

## Il risultato: peggio su tutte le assi

| | prima | dopo |
|---|---|---|
| AUC del tipo sulle posizioni | 0,979 | **0,995** ↑ |
| coseno serie↔serie | +0,405 | **+0,502** ↑ |
| **serie↔film** | +0,157 | **+0,095** ↓ |
| vicini film di una serie (mediana) | 2 | **1** |
| serie senza alcun vicino film | 22% | **43%** |
| coseno dello student sui **film** (held-out) | ~0,43 | **0,419** ↓ |

## Perché è fallito (due cause, entrambe strutturali)

1. **La propagazione propaga ciò che i vicini contengono — e i vicini erano già tipo-correlati.**
   I 2 vicini film di una serie sono, nel grafo attuale, i film **metadata-simili a una serie** (anime,
   film con struttura da serie). Quindi il pseudo-target ha spostato il grumo *verso i film serie-simili*,
   **non** verso i film mainstream: il ponte non si è aperto, si è chiuso di più. È un **rinforzo
   circolare**: la struttura che dovrebbe correggere l'asse è essa stessa organizzata da quell'asse.
2. **Il bersaglio è diventato 30.881 righe** (9.724 serie + **21.157 film senza teacher**, che hanno
   ricevuto lo pseudo-target per la stessa condizione): il 44% della massa di addestramento con peso 0,5.
   Il rumore aggiunto ha **degradato anche i film** (0,43 → 0,419).

## Cosa significa (e cosa resta)

**L'asse "tipo" è strutturale**: i metadati *determinano* il tipo (stagioni, durata, keyword, popolarità).
Il modello lo usa come scorciatoia, e senza target reali per le serie le mappa tutte in una regione.
Togliere quell'asse richiede una di queste tre, e nessuna è un giro di parametri:

| strada | costo | nota |
|---|---|---|
| **debiasing avversariale** (il modello non deve poter predire il tipo) | medio | tecnica standard, non un LLM; il vincolo si aggiunge alla perdita |
| **dati serie veri** (MAL/AniList per gli anime) | alto | l'unica sorgente *genuina*: darebbe un target reale invece di uno pseudo |
| **TMDB recs come segnale serie** (peso basso) | basso | l'utente l'aveva già detto: «vanno pesate poco, forse sono rumore reale» |

**E una considerazione che ridimensiona tutto**: l'asse "tipo" **non è un problema per il prodotto**. La
produzione filtra già per tipo (`resolveTypeSelectors`), quindi la classifica avviene *dentro* un tipo: un
asse che separa film e serie non fa danno. Il problema è solo il **ponte** — l'eredità del segnale
collaborativo sulle serie — e per quello servono le tre strade sopra, non un grafo ad hoc.

## Registrato

Il tentativo è nel codice (`build-film-graph.py`, blocco `POSF`): **da disattivare o correggere** prima
di ricostruire il grafo, altrimenti resta il peggioramento. Il file `film-graph-typeclean.npz` **non va
usato**: è la prova del fallimento, non un artefatto.
