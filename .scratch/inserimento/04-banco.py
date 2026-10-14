"""04-banco.py — TICKET 04: il banco di prova. Non solo Verity.

Il ticket 04 chiedeva 10-15 titoli recenti e **un controllo misurabile**. Il controllo c'e', ed e' il
test giusto dopo quello che ha misurato il ticket 02: **togliere titoli dal grafo, ricollarli coi
soli metadati, e vedere se tornano nella bolla da cui vengono**.
Il ticket 02 ha mostrato che confrontarsi con lo spazio CF e' sbagliato (0,0%): quello che la
proiezione recupera e' la struttura dei metadati, quindi il test giusto e' **semantico**.

Attenzione a un dettaglio che il ticket 02 ha reso evidente: i film e le serie sono due cataloghi
separati nel prodotto, e la similarita' strutturale li mescola. Qui si impone il medium.
"""
import pathlib
import sys

import numpy as np
import pandas as pd

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import colloca as C

s = C.carica()
TIT, VOT = s["TIT"], s["VOT"]
mem, sz = s["mem"], s["sz"]
IS_TV = s["B"].IS_TV
print("=" * 100)
print("TICKET 04 — il banco di prova")
print("=" * 100, flush=True)

# ============================================================ A. il controllo misurabile
print("\n### A. IL CONTROLLO: 600 titoli tolti e ricollocati ###")
print("  Si toglie il comportamento a 600 titoli, si nasconde il loro contributo al modello, si")
print("  proiettano dai soli metadati, e si guarda in che bolla cadono rispetto a quella di partenza.")
print("  Il test e' SEMANTICO: la bolla di partenza e' un mondo, ci devono tornare.")
print(flush=True)

from sklearn.linear_model import Ridge
rng = np.random.default_rng(11)
ha = s["ha"]
cand = np.where(ha)[0]
tolti = rng.choice(cand, 600, replace=False)
Sf, Cf, P = s["Sf"], s["Cf"], s["P"]
mask = np.ones(Sf.shape[0], bool)
mask[tolti] = False
m = Ridge(alpha=10.0, solver="lsqr", max_iter=600).fit(Sf[ha & mask], Cf[ha & mask])
P_cieco = m.predict(Sf[tolti]).astype(np.float32)
P_cieco /= (np.linalg.norm(P_cieco, axis=1, keepdims=True) + 1e-9)

Pn = s["Pn"]
Pn = np.where(ha[:, None], Pn, 0.0)
# la mappa delle bolle: per dire se una bolla "sbagliata" e' almeno una VICINA
import scipy.sparse as sp
q = np.load(C.ML / "bolle-nitrile-V7-triangolo.npz")
Wt = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(s["P"].shape[0],) * 2).tocsr()
S1 = sp.csr_matrix((np.ones(s["P"].shape[0], np.float32), (np.arange(s["P"].shape[0]), mem)),
                   shape=(s["P"].shape[0], len(sz)))
BB = (S1.T @ (Wt + Wt.T) @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
vicini_di = {b: set(BB.getrow(b).indices.tolist()) for b in range(len(sz))}
print(f"  (mappa delle bolle: {BB.nnz:,} adiacenze)", flush=True)

stessa, vicina, lontana = 0, 0, 0
for k, i in enumerate(tolti):
    v = Pn @ P_cieco[k]
    v[tolti] = -9                      # non si puo' trovare se stesso
    if IS_TV[i]:
        v[~IS_TV] = -9                 # il medium si rispetta
    else:
        v[IS_TV] = -9
    top = np.argsort(-v)[:10]
    b_vera = int(mem[i])
    b_trovate = {int(mem[x]) for x in top}
    if b_vera in b_trovate:
        stessa += 1
    elif b_trovate & vicini_di.get(b_vera, set()):
        vicina += 1                    # non la sua, ma una bolla ADIACENTE sulla mappa
    else:
        lontana += 1
print(f"\n  ** torna nella PROPRIA bolla:                {stessa:>4}/600 ({100*stessa/600:.1f}%) **")
print(f"  ** cade in una bolla ADIACENTE sulla mappa:  {vicina:>4}/600 ({100*vicina/600:.1f}%) **")
print(f"  ** cade in una bolla non collegata:          {lontana:>4}/600 ({100*lontana/600:.1f}%) **")
print(f"  ** nel QUARTIERE giusto (propria+adiacente):  {stessa+vicina:>4}/600 "
      f"({100*(stessa+vicina)/600:.1f}%) **")
print("     caso per la propria bolla: 1/1.617 = 0,06%")

# ============================================================ B. i titoli patologici
print("\n\n### B. I CASI PATOLOGICI, letti ###")
dv = pd.read_parquet(C.F.PQ / "movies.parquet")
tv = pd.read_parquet(C.F.PQ / "tv.parquet")
dv["data"] = pd.to_datetime(dv["release_date"], errors="coerce")
ris = []


def prova(d, tipo="movie"):
    riga = C.riga_da_tmdb(d, tipo)
    p = C.proietta(riga)
    v = Pn @ p
    if tipo == "movie":
        v[IS_TV] = -9
    else:
        v[~IS_TV] = -9
    v[~ha] = -9
    top = np.argsort(-v)[:12]
    conta = {}
    for x in top[:10]:
        conta[int(mem[x])] = conta.get(int(mem[x]), 0) + 1
    b, n = max(conta.items(), key=lambda z: z[1])
    return b, n, top


casi = []
# 1-2. i titoli 2026 piu' votati non nel grafo
ric = dv[(dv["data"] >= "2026-01-01") & (dv["vote_count"] >= 5)]
fuori = ric[ric["id"].map(lambda x: s['B'].ROW_OF.get(f"movie:{int(x)}") is None)]
for r in fuori.sort_values("vote_count", ascending=False).head(6).itertuples(index=False):
    casi.append((r._asdict(), "movie", "uscita 2026 molto votata"))
# 3. il caso che ha aperto tutto
casi.append((dv[dv["id"] == 1283515].iloc[0].to_dict(), "movie", "VERITY"))
# 4. un titolo di nicchia con pochissime keyword
magri = dv[dv["keywords"].map(lambda x: isinstance(x, str) and len(x) < 40)]
magri = magri[magri["vote_count"] > 50].sort_values("vote_count")
for r in magri.head(2).itertuples(index=False):
    casi.append((r._asdict(), "movie", "nicchia con pochissime keyword"))
# 5. una serie TV recente
tvr = tv[pd.to_datetime(tv["first_air_date"], errors="coerce") >= "2026-01-01"]
tvr = tvr[tvr["id"].map(lambda x: s['B'].ROW_OF.get(f"tv:{int(x)}") is None)]
for r in tvr.sort_values("vote_count", ascending=False).head(3).itertuples(index=False):
    casi.append((r._asdict(), "tv", "serie TV 2026"))

for d, tipo, perche in casi:
    try:
        b, n, top = prova(d, tipo)
    except Exception as e:
        print(f"\n  {str(d.get('title') or d.get('name'))[:44]:<46} !! {type(e).__name__}: {e}")
        continue
    nome = str(d.get("title") or d.get("name"))
    print(f"\n  {nome[:50]:<52} [{perche}]")
    print(f"     bolla {b} ({n}/10 voti, {int(sz[b])} titoli) · "
          f"{str(d.get('genres') or '')[:52]}")
    print("     vicini: " + " | ".join(str(TIT[x])[:26] for x in top[:6]))

print(f"\nFINE")
