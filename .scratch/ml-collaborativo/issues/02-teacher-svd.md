# 02 — Il teacher: la SVD collaborativa e il controllo del banale

**Status**: `resolved` · **Type**: `task` · **Aperto**: 08/10/2026 · **Chiuso**: 08/10/2026 · **Blocked by**: 01

## Cosa è stato fatto

`build-film-graph.py`: matrice utenti×item dai voti MovieLens (32M di 200.948 utenti) filtrata ai film coperti,
peso **anti-popolare** `1/log1p(n_item)`, `svds` a 64 componenti, `Zitem` normalizzato.

## Il numero che conta: **0,224**

E non è un risultato: è il **controllo del banale** — il coseno del *vettore medio* con i bersagli. Qualunque
modello che non batta 0,224 non ha imparato nulla. Va stampato accanto a ogni misura, sempre. Il primo probe
dava 0,044 e senza questo controllo sarebbe passato per un risultato: era un bug di namespace
([ticket 06](06-namespace-tmdbid-movieid.md)).

## Stato dello spazio

Prima componente: **42,5% di varianza**. 49.709 film hanno il teacher (su 71.298 film nel catalogo caricato).
Artefatti: `.cache/movielens/` (gitignorato). Riconciliazione dei due script: `reconcile-svd.py`.
