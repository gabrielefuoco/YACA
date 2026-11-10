Status: resolved
Type: task
Blocked by: 14, 15

# `graph_dense` non si archivia: è l'antenato della build

## Il titolo vecchio

«Archiviare `graph_dense` e liberare i 5 GB del venv».

## Cosa ho verificato oggi

| affermazione | verità |
|---|---|
| il venv da 5 GB | **già sparito** col ticket 15 |
| `services/graph_dense/data` duplica `services/graph/data` | **solo in parte**: i quattro file canonici (`spazi-trakt.npz`, `titoli-canone.txt`, `metadati-canohe.npz`, `05-tfidf.npz`) esistono in entrambe le cartelle, ma `trama-qwen3b.npy`, `kw-emb.npy`, `kw-emb.txt`, `05-vocab.json` e lo studente **esistono solo lì** |
| la build può fare a meno della cartella | **no**: `services/graph/build/config.py` ha `DATA = services/graph_dense/data` e `SRC = DATA/graph`; `pipeline.py:snapshot_inputs` elenca esplicitamente file di quella cartella |
| il runtime la raggiunge | **sì, e in silenzio**: `interessi.py` e `kids.py` ripiegavano su `graph_dense/data/graph/05-vocab.json` per la tassonomia |

Peso attuale: `services/graph_dense` **1,3 GB**, tutti in `data/`.

## Cosa è stato fatto

1. **Il runtime non ci ripiega più.** In `interessi.py` e `kids.py` il fallback verso i
   prototipi è stato tolto: se il canonico `services/graph/data/kw-tfidf` manca, lo si
   dichiara con un avviso e si prosegue. Il ripiego non falliva mai in modo visibile —
   serviva artefatti diversi dai canonici senza dirlo, che è il caso peggiore.
2. La docstring di `_risolvi_kw_tfidf` dice il vero.
3. Test del servizio: **95 passati, 5 saltati**.

## Cosa NON si fa, e perché

**La cartella resta.** Spostare `DATA` su `services/graph/data` significherebbe cambiare il
percorso di ogni input congelato, quindi ogni hash dentro `V45.lock.json`: la build
ripartirebbe con un'impronta diversa e non riprodurrebbe più V45 — esattamente il danno che il
ticket 15 ha già causato una volta perdendo `rrfstudent-norrfst.npz`. Un risparmio di 1,3 GB
non vale la ricetta.

Vale la lezione già scritta nel ticket 15: **l'elenco degli input lo detta `graph.build
--check`, non la memoria.** Finché quel comando elenca percorsi dentro `graph_dense/data`,
quella cartella è un input, non un residuo.

## Quando riaprire

Solo se si rigenera la ricetta da zero (cioè se si ricostruisce il triangolo V45 con uno
studente nuovo, ticket 17): in quel giro gli input si possono spostare insieme alla ricetta,
e la cartella sparisce come conseguenza, non come pulizia.
