Status: ready-for-agent
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
