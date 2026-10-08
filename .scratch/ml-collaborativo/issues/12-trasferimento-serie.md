# 12 — Il trasferimento alle serie: 0%, e adesso?

**Status**: `needs-triage` · **Type**: `research` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

## Il problema aperto più grande

Le serie sono l'**80% delle cronologie reali** e MovieLens è **cieco al 100%** su di loro (`links.csv` rimanda
solo a `/movie/{id}`). Il valore del filone poggia quindi su un assunto mai verificato: che lo student,
addestrato sui film, sappia collocare le serie.

## Cosa è stato misurato (e non è una vittoria)

- **film → serie dentro il grafo: 0,0%** (i semi di soli film non raggiungono le serie).
- Con i topoi del sottografo la distanza si è **ridotta in testa**: lo student sulle serie 9,9% → **12,7% @50**,
  il blend 15,0% contro il baseline 13,0% @50.
- Ma **nessuna vittoria netta**: sulle serie @200 lo student fa 26,0% contro 41,7%, sui film 2,1% contro 5,4%
  @50. Vince un numero e perde su tutti gli altri.
- Riferimento Node (banco precedente): film→serie **18,2% @50 contro 4,1% del caso**.

## Cosa decidere

1. Serve un **teacher per le serie**, o basta il ponte topoi? Se basta, il ponte va reso esplicito (semi misti
   film+serie) e misurato a parità di budget; se non basta, il filone ha un tetto dichiarato all'80% dei casi
   d'uso — e va detto *ora*, non alla fine.
2. MAL/AniList coprono gli anime con mappatura per titolo: valutare **solo dopo** il punto 1.
3. Il transfer va misurato **senza leakage**: la verità deve restare su item che lo student non ha visto.

**Questo ticket è la priorità più alta fra gli aperti**: è l'unico che può ridimensionare tutto il resto.

---

## Aggiornamento (08/10/2026): il meccanismo c e, va misurato sulle serie

Dalla [ricerca 15](../ricerche/15-le-due-strade.md): la **propagazione sul grafo dei film** (la
posizione di un film = media pesata delle posizioni dei suoi vicini col teacher, normalizzata per
grado, leave-one-out) **batte i metadati da sola** (A->B 0,369 con 64 dimensioni contro 0,362 con
5.842) e sul **cold-start** fa 0,539 contro 0,494. Aggiunta ai metadati: cold-start **0,544** (+10%).

Per una serie il meccanismo e naturale: i suoi vicini nel grafo sono FILM, che il teacher ce l hanno.

**Prossimo passo di questo ticket**: misurare quante serie hanno almeno un vicino film con un teacher
e con quale qualita (la propagazione funziona per 49.650 film su 49.709: 99,9%). Se la copertura serie
e alta, il ticket si chiude con un meccanismo invece che con un 0%.

---

## MISURATO (08/10/2026): il meccanismo c e, la copertura no

[Ricerca 16](../ricerche/16-serie-grafo-ranker.md): 16.550 serie nel grafo, **78% con almeno un vicino
film**, **59% con una posizione stimata** (9.724), stabilita della stima **0,573** (contro 0,702 dei film).

**Il collo di bottiglia e la connettivita: una serie ha 2 vicini FILM di mediana, un film ne ha 16.** Le
serie stanno vicine alle serie perche il grafo e costruito sui metadati.

Cura: un grafo costruito sulle POSIZIONI PROPAGATE (collaborative) metterebbe le serie vicino ai film.
Il 41% scoperto non e un limite del metodo ma del grafo.
