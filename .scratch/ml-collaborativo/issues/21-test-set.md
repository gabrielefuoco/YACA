# 21 — Il test set congelato: la linea di base per migliorie e regressioni

**Status**: `claimed` · **Type**: `task` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

## Fatto

`build-testset.py` → `.cache/movielens/testset.json` (v1.0, **congelato**, seme `20261008`):

- **200 utenti** MovieLens disgiunti (lista in `testset-users.json`), **400 trial**
- profilo = **3 semi**, verità = il resto dei titoli piaciuti (mediana 51/trial)
- **stratificato**: 100 utenti dal *fondo* della distribuzione (215 voti mediani) + 100 dal resto (6.922)
- limite dichiarato: MovieLens non sa dare vera nicchia (minimo assoluto: 45 voti mediani)

Regola d'uso: si misura **sempre qui**, mai ricampionato, risultati **per strato**.

## Da fare (il test set non è utilizzabile finché c'è il leakage)

| # | passo | costo |
|---|---|---|
| 1 | teacher **senza** i 200 utenti → `teacher-Z-heldout.npz` | ~4 min |
| 2 | grafo dei film su quel teacher → `film-graph-heldout.npz` | ~10 min |
| 3 | riesportare i candidati sui 400 trial | ~2 min |
| 4 | banco → **linea di base di riferimento** | ~15 min |

## Cancelli

1. La linea di base va registrata nella mappa **con i due strati separati**.
2. Da lì in avanti, ogni modifica si misura con gli stessi 4 passi sugli stessi 400 trial.
3. Se un miglioramento misurato sul banco vecchio (5 contesti di un utente) non si replica qui, **vince
   il test set**: il banco vecchio ha esaurito il suo credito.
