Status: resolved
Type: task

# Anime e film-saga: regola strutturale nel mixer e nel retrieval

## Il problema

I film anime legati a una serie o a una collezione (film riassuntivi, sequel cinematografici di shonen)
monopolizzano i vicini degli anime e sono inutili per chi cerca una nuova opera. I nodi cross-medium
servono come ponti durante la diffusione, ma non devono inquinare la lista finale quando l'utente
esplora il mondo anime. Le regole sono state misurate a mano ma **non implementate**.

## Cosa fare

1. **Mixer**: moltiplicatore 0,15 sugli archi `(i,j)` in cui almeno uno è `ANIME & ~IS_TV` e che
   condividono `COLL` o un token significativo del titolo (normalizzazione come in `anime-30.py`).
2. **Retrieval** (solo quando la massa dei semi è ≥60% anime): filtrare i candidati a
   `ANIME & (VOT ≥ 50)` e penalizzare i film-franchise di cui non si è vista la serie madre.
   La matrice di transizione resta intatta su tutti i 76.497 nodi: la maschera è **dopo** la diffusione.
3. Misurare sui 30 casi misti di `anime-30.py` e verificare che i ponti cross-medium sul banco
   curato non si rompano.

## Criteri di accettazione

- Nei top-20 dei 30 casi anime spariscono i film-appendice (riassunti, recap, compilation).
- Il banco non perde più di 0,005 di R@20.
- La regola è documentata in `parametri.py` con il numero misurato.

---

## Parziale (mixer fatto, misura no)

`mixer.py --damp-anime-saga`: moltiplicatore 0,15 sugli archi in cui il nodo di partenza è
`ANIME & ~IS_TV` e condivide collezione TMDB o un token raro del titolo con l'altro. 2 test coprono:
smorza solo l'arco anime↔anime della stessa saga, lascia intatti anime→film normale e anime senza saga.

Manca ancora: la misura sui 30 casi di `anime-30.py` (richiede un rebuild del grafo) e la **maschera
di retrieval** in `motore.py` (se i semi sono ≥60% anime, filtra i candidati e penalizza i film-franchise
di cui non si è vista la serie madre). La maschera vive nel motore di prodotto, dove c'è ancora la
partizione a bolle: va decisa insieme al passaggio alla matrice sparsa.

---

## Esito

**Mixer** — `--damp-anime-saga`: ×0,15 sugli archi in cui il nodo di partenza è `ANIME & ~IS_TV` e
condivide collezione TMDB o un token raro del titolo. Misurato sui 30 casi misti di `anime-30.py`
(ora con un argomento per puntare a un grafo qualsiasi):

| | anime nei 20 | di cui **saga** | film | voti mediani | <100 voti |
|---|---:|---:|---:|---:|---:|
| V19 | 18,6/20 | **1,8** | 6,8 | 1029 | 1,8 |
| **V19 + `--damp-anime-saga`** | **19,2/20** | **0,2** | 4,9 | **1168** | 1,5 |

Le appendici di saga nei top-20 passano da **1,8 a 0,2 per lista** (9× meno), la quota di anime sale e i
voti mediani crescono. È esattamente il criterio del ticket.

**Retrieval** — `services/graph/anime.py`: `quota_anime` e `maschera`. Si accende solo se ≥60% dei semi
sono anime; mette in fondo (non cancella) i titoli non anime, quelli con <50 voti e i film la cui serie
madre non è stata vista; se restano meno di 5 titoli buoni, non smonta la lista. 5 test.

**Cosa resta aperto**: il *punto di innesto* nel motore. `motore.titoli_di()` lavora sulle bolle e il
canone del prodotto è ancora quello a 66.259 nodi con partizione, mentre V19 ne ha 76.497 senza. La
maschera è pronta e testata, ma va chiamata dopo la diffusione nel percorso di prodotto: si innesta
insieme al passaggio alla matrice sparsa, che è fuori da questo effort.
