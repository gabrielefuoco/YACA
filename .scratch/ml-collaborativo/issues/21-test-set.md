# 21 — Il test set congelato: la linea di base per migliorie e regressioni

**Status**: `resolved` · **Type**: `task` · **Aperto**: 08/10/2026 · **Blocked by**: nessuno

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

---

## Fatto: la linea di base (08/10/2026)

Report: [`ricerche/11-linea-di-base.md`](../ricerche/11-linea-di-base.md)

Teacher e grafo de-leakati (200 utenti esclusi), 400 trial su 200 utenti indipendenti.

| | recall@50 | recall@200 | solo popolarita |
|---|---|---|---|
| graph 2 hop | **4,3%** | **9,6%** | 6,1% |
| POOL VERO | 1,8% (75 candidati) | 3,2% | 2,8% |
| caso | 1,2% | 2,2% | 1,6% |

Il vantaggio del grafo **si replica** (2,4x @50 e 3,0x @200 sul pool; 3,6x e 4,4x sul caso):
la direzione regge, i numeri si sono rivisti. Nuove letture: per i profili freddi il pool di
produzione da **75 candidati** (fame); e **il ranker e il punto debole** — ordinare per
popolarita batte lo scorer a @50 (6,1% contro 4,3%, e 8,5% contro 5,0% sulla fascia mainstream).

Comando d uso: `CAND_FILE=graph-candidates-testset.json node bench-graph-funnel.js`
