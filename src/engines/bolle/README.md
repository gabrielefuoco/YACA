# `src/engines/bolle/` — i mondi del grafo, nel prodotto

Da una **storia** (i titoli visti da un profilo, coi loro segnali) a un **portafoglio**: i mondi accesi,
quanto sono accesi, e chi ci sta dentro.

```js
const bolle = require('./src/engines/bolle/Bolle');
const p = bolle.portafoglio([{ chiave: 'tv:314', plays: 3, tipo: 'loved' }]);
// → [{ bolla, attivazione, titoli, voti, vicini, membri }, ...]
```

## Da dove viene

Il grafo è costruito **offline**, in Python, in `graph/` — fuori dal prodotto, e senza mai modificarlo.
L'unica cosa che attraversa il confine è **un artefatto**:

```bash
python -m graph.pipeline esporta        # scrive src/data/bolle.json
```

`src/data/bolle.json` — **1,55 MB** — contiene tre cose e nient'altro:

| | |
|---|---|
| `titoli` | `{chiave: bolla}` per tutti i 66.259 titoli del canone |
| `bolle` | per ogni bolla: `{n, voti, vicini}` — taglia, mediana dei voti, i vicini sulla mappa 6+2 |
| `episodi` | `{chiave: n}` solo per le serie: serve al denominatore del loro peso |

Più `versione`, che porta **le impronte e i parametri**: `alpha`, `iterazioni`, i pesi, i fattori di
tipo. **L'engine non cabla nessun numero** — li legge da lì. Chi cambia un iperparametro in
`graph/parametri.py` lo ritrova nell'artefatto dopo aver riesportato, e l'impronta della ricetta lo
registra.

## Il confine, dichiarato

Questo engine **non** fa tre cose, e non sono dimenticanze:

1. **Non cammina sui titoli, cammina sulle bolle.** Nel modulo la diffusione gira sui **13,2 milioni** di
   archi fra titoli; qui sui **45.194** fra bolle. La conseguenza è una sola e va saputa:
   **l'attivazione per titolo non c'è**, quindi **l'ordine dentro una bolla lo decide chi invoca** — che
   ha il catalogo e può ordinare per voto, anno o popolarità. È una scelta di prodotto, non un limite
   tecnico da nascondere.
2. **Non colloca i titoli nuovi.** Un'uscita del 2026 non è nel grafo: la assegna a una bolla il **job
   notturno** (`graph/collocator.py`, ~11 ms per titolo, ~90/100 all'occhio). Finché non c'è, per questo
   engine quel titolo non esiste.
3. **Non compone le liste.** Restituisce il portafoglio; *il tuo mondo*, *un passo fuori*, *le uscite
   nuove* e *la nicchia di qualità* le assembla chi invoca, perché servono date, popolarità e voto medio
   — che stanno nel database del prodotto.

## Cosa c'è dietro, in numeri

| | |
|---|---|
| bolle | **3.497**, mediana 11 titoli |
| coerenza intra-bolla | **+0,942** |
| i mondi accesi sono 1 componente sulla mappa | 45.194 archi, 6+2 per bolla |
| la diffusione | α **0,60**, misurato su 120 utenti |
| il portafoglio, misurato sul motore intero | precisione **5,0%** contro un pavimento dello 0,08% (**63×**) |
| il quartiere porta più del mondo | **38%** del futuro trovato sta in *un passo fuori*, **21%** in *il tuo mondo* |
| questa chiamata | millisecondi (20 iterazioni su 3.497 bolle) |

## Cosa manca per usarlo davvero

1. **il job notturno** che riesporta l'artefatto e colloca i titoli nuovi (le decisioni ci sono, il
   codice pure: `graph/pipeline.py colloca`);
2. **la cache** delle liste per profilo, con la chiave `hash(storia) · versione artefatto · impronta
   ricetta · slider` (decisa, non costruita);
3. **la composizione delle liste** nel feed, che è una decisione di prodotto: i numeri dicono di
   mostrare **prima** *un passo fuori* e poi *il tuo mondo*.
