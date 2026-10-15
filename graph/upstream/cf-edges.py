"""cf-edges.py — IL COMPORTAMENTO, DICHIARATO E PULITO.

`Pc` fa collaborative filtering di nascosto: keyword addestrate a predire un SVD della
co-occorrenza MovieLens. Vale 1,72x sul recupero (report 48). Ma lo fa su TUTTI gli utenti,
compresi quelli su cui si misura — e non e' dichiarato, quindi non e' ne' misurable in
ablazione ne' controllabile.

Qui si rifa' la stessa cosa, per bene:
  CF    = svds della co-occorrenza (utente x film) costruita sui soli utenti DISGIUNTI
          da quelli di valutazione. E' un tipo di arco dichiarato, e si puo' testare da solo.
  CFst  = Ridge(keyword -> CF) addestrato sui film e applicato a tutto: da' alle SERIE un
          pubblico PREVISTO, che e' l'unica cosa possibile per loro (nessuna cronologia).

Split: 2.000 utenti di valutazione (1.000 calibrazione + 1.000 verifica, seed 9 su chi ha
>=20 film). Gli archi usano tutti gli altri ~199.000.
"""
import json, pathlib, time
import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, load_npz
from scipy.sparse.linalg import svds
from sklearn.linear_model import Ridge

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
DIM = 128

z = np.load(K.A("spazi-trakt.npz"), allow_pickle=True)
tmdb, tipo = z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")

links = pd.read_csv(ML / "ml-32m" / "links.csv")
m2r = {}
for mid, tid in zip(links["movieId"], links["tmdbId"]):
    if pd.isna(tid):
        continue
    r = row_of.get(f"movie:{int(tid)}")
    if r is not None:
        m2r[int(mid)] = r
rr = pd.read_parquet(ML / "ratings-puliti.parquet")
rr["row"] = rr["movieId"].map(m2r)
rr = rr.dropna(subset=["row"])
rr["row"] = rr["row"].astype(np.int64)
print(f"interazioni mappate: {len(rr):,} · utenti {rr.userId.nunique():,} ({time.time()-t0:.0f}s)")

# --- gli utenti di valutazione: gli stessi di contaminazione.py, poi disgiunti ---
cnt = rr.groupby("userId").size()
buoni = cnt[cnt >= 20].index.values
rng = np.random.default_rng(9)
eval_u = set(rng.choice(buoni, size=2000, replace=False).tolist())
print(f"utenti di valutazione: {len(eval_u):,} (di cui uso 1.000 calib + 1.000 verifica)")

maschera_edge = ~rr.userId.isin(eval_u)
re = rr[maschera_edge]
print(f"utenti per gli ARCHI: {re.userId.nunique():,} · interazioni {len(re):,} ({time.time()-t0:.0f}s)")

# --- CF: svds della co-occorrenza degli utenti disgiunti ---
CACHE = K.DATA / "cf-spazio.npz"
if CACHE.exists():
    q = np.load(CACHE)
    Cf = q["Cf"]
    print(f"CF da cache: {Cf.shape} ({time.time()-t0:.0f}s)")
else:
    u = re.userId.to_numpy(np.int64)
    f = re.row.to_numpy(np.int64)
    uu, ui = np.unique(u, return_inverse=True)
    X = csr_matrix((np.ones(len(ui), np.float32), (ui, f)), shape=(len(uu), n))
    X.sum_duplicates()
    X.data[:] = 1.0
    c_i = np.asarray(X.sum(0)).ravel()
    film = np.where(c_i > 0)[0]
    print(f"  matrice utenti x film: {X.shape} · nnz {X.nnz:,} · film coperti {len(film):,} ({time.time()-t0:.0f}s)")
    Xs = X[:, film].multiply((1.0 / np.log1p(np.maximum(c_i[film], 1)))[None, :]).tocsr()
    U, S, Vt = svds(Xs, k=DIM)
    Z = Vt.T / (np.linalg.norm(Vt.T, axis=1, keepdims=True) + 1e-9)
    Cf = np.zeros((n, DIM), np.float32)
    Cf[film] = Z
    np.savez_compressed(CACHE, Cf=Cf, film=film)
    print(f"  CF: {Cf.shape} · film con vettore {len(film):,} · varianza {float((S**2).sum()):.1f} ({time.time()-t0:.0f}s)")

# --- CFst: lo studente, keyword -> CF, per dare un pubblico alle serie ---
CACHE2 = K.DATA / "cf-studente.npz"
if CACHE2.exists():
    q = np.load(CACHE2)
    Pcf = q["P"]
    print(f"studente CF da cache: {Pcf.shape}")
else:
    F = load_npz(K.A("spazi-trakt-tfidf.npz")).tocsr()
    ha = np.linalg.norm(Cf, axis=1) > 1e-6
    print(f"  addestro keyword -> CF sui {int(ha.sum()):,} film con pubblico ({time.time()-t0:.0f}s)")
    Pcf = Ridge(alpha=10.0, solver="lsqr", max_iter=600).fit(F[ha], Cf[ha]).predict(F).astype(np.float32)
    np.savez_compressed(CACHE2, P=Pcf)
    print(f"  studente: {Pcf.shape} · le serie ora hanno un pubblico previsto ({time.time()-t0:.0f}s)")

for nome, V in (("CF (film)", Cf), ("CFst (tutti, pubblico previsto)", Pcf)):
    ha = np.linalg.norm(V, axis=1) > 1e-6
    print(f"  {nome:<34} coperti {int(ha.sum()):,}/{n:,} · di cui serie {int((ha & is_tv).sum()):,}/{int(is_tv.sum()):,}")

# quanto sono d'accordo il pubblico REALE e quello PREVISTO per le serie?
print("")
print("CONTROLLO — lo studente riproduce il pubblico sulle serie? (non si puo' sapere: nessuna serie ha cronologie)")
print(f"  sui FILM che non hanno pubblico reale: {int((~((np.linalg.norm(Cf,axis=1)>1e-6))).sum()):,} film usano comunque il previsto")
print(f"\n({time.time()-t0:.0f}s)")
