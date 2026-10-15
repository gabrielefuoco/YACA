"""componenti-nuovi.py — I COMPONENTI DAI DATI CHE STAVAMO BUTTANDO.

Cinque componenti nuovi, tutti normalizzati per riga e con i vicini pesati per RARITA' (IDF):
cosi' un metadato comune ("drama") non conta quanto uno raro ("mind control").

  KW    grafo semantico delle keyword   — co-occorrenza pesata IDF, top-k
  CAST  attori condivisi                — primi 10 accreditati, co-occorrenza IDF, top-k
  DIR   registi e autori (created_by)   — co-occorrenza IDF, top-k
  COLL  franchise / collezioni          — clique per collezione (segnale forte e preciso)
  TV    frequenza di visione insieme    — SVD delle cronologie Trakt (utente x titolo), top-k

Salva `.cache/movielens/nuovo-<nome>.npz` in formato CSR.
"""
import glob, json, pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp
from scipy.sparse.linalg import svds

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from graph import canon as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
PQ = K.ROOT / ".cache" / "tmdb"
TOPK = 30


def salva(nome, M):
    M = ((M + M.T) * 0.5).tocsr()
    M.setdiag(0)
    M.eliminate_zeros()
    np.savez_compressed(K.ML / f"nuovo-{nome}.npz", data=M.data, indices=M.indices, indptr=M.indptr)
    g = np.asarray((M > 0).sum(1)).ravel()
    print(f"  -> {nome}: {M.nnz:,} archi · titoli con archi {int((g>0).sum()):,} "
          f"· mediana {int(np.median(g))} ({time.time()-t0:.0f}s)", flush=True)


def topk_da_sparsa(A, k=TOPK, min_sim=0.02, B=512, etichetta=""):
    """i k vicini per similarita' coseno, dal prodotto sparso a blocchi (mai denso)."""
    A = A.tocsr().astype(np.float32)
    nor = np.sqrt(np.asarray(A.multiply(A).sum(1)).ravel()) + 1e-9
    An = sp.diags(1.0 / nor).dot(A).tocsr()
    r, c, v = [], [], []
    for i in range(0, n, B):
        S = (An[i:i + B] @ An.T).tocsr()
        S.setdiag(0)
        S.eliminate_zeros()
        for j in range(S.shape[0]):
            row = S.getrow(j)
            if row.nnz == 0:
                continue
            d, idx = row.data, row.indices
            if len(d) > k:
                sel = np.argpartition(-d, k)[:k]
                d, idx = d[sel], idx[sel]
            m = d > min_sim
            r.extend([i + j] * int(m.sum()))
            c.extend(idx[m].tolist())
            v.extend(d[m].tolist())
        if (i // B) % 60 == 0 and i:
            print(f"    {etichetta} {i:,}/{n:,} ({time.time()-t0:.0f}s)", flush=True)
    return sp.csr_matrix((v, (r, c)), shape=(n, n), dtype=np.float32)


def matrice_idf(insiemi):
    """da una lista di set -> matrice sparsa (n x vocab) pesata IDF."""
    vocab = {}
    for s in insiemi:
        for x in s:
            vocab[x] = vocab.get(x, 0) + 1
    idx = {x: i for i, x in enumerate(vocab)}
    r_, c_, v_ = [], [], []
    for i, s in enumerate(insiemi):
        for x in s:
            r_.append(i)
            c_.append(idx[x])
            v_.append(float(np.log(n / (1 + vocab[x]))))
    return sp.csr_matrix((v_, (r_, c_)), shape=(n, len(idx)), dtype=np.float32)


def leggi_json(s, chiave="name"):
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x.get(chiave) for x in v if isinstance(x, dict) and x.get(chiave)]
    except Exception:
        return []


# ============================================================ metadati
print("carico i metadati ...", flush=True)
mv = pd.read_parquet(PQ / "movies.parquet",
                     columns=["id", "keywords", "cast", "directors", "collection_id"])
tv = pd.read_parquet(PQ / "tv.parquet",
                     columns=["id", "keywords", "cast", "created_by"])

KW = [set() for _ in range(n)]
CA = [set() for _ in range(n)]
DI = [set() for _ in range(n)]
CO = [set() for _ in range(n)]

for df, typ in ((mv, "movie"), (tv, "tv")):
    cols = list(df.columns)
    for riga in df.itertuples(index=False):
        d = dict(zip(cols, riga))
        r = row_of.get(f"{typ}:{int(d['id'])}")
        if r is None:
            continue
        for x in leggi_json(d.get("keywords")):
            KW[r].add(str(x).lower())
        for x in leggi_json(d.get("cast"))[:10]:
            CA[r].add(str(x))
        di = d.get("directors") if "directors" in d else d.get("created_by")
        for x in leggi_json(di):
            DI[r].add(str(x))
        co = d.get("collection_id")
        if co is not None and not (isinstance(co, float) and np.isnan(co)):
            CO[r].add(int(co))

print(f"  keyword {sum(len(s) for s in KW):,} · cast {sum(len(s) for s in CA):,} "
      f"· registi {sum(len(s) for s in DI):,} · collezioni {sum(len(s) for s in CO):,} "
      f"· titoli con keyword {sum(1 for s in KW if s):,}/{n:,} ({time.time()-t0:.0f}s)", flush=True)

# ============================================================ KW
print("\nKW — grafo semantico delle keyword")
A = matrice_idf(KW)
print(f"  matrice titolo x keyword: {A.shape} · {A.nnz:,} valori")
salva("KW", topk_da_sparsa(A, etichetta="KW"))

# ============================================================ CAST
print("\nCAST — attori condivisi")
salva("CAST", topk_da_sparsa(matrice_idf(CA), etichetta="CAST"))

# ============================================================ DIR
print("\nDIR — registi e autori")
salva("DIR", topk_da_sparsa(matrice_idf(DI), etichetta="DIR"))

# ============================================================ COLL
print("\nCOLL — franchise e collezioni")
mappa_coll = {}
r_, c_ = [], []
for i, s in enumerate(CO):
    for x in s:
        if x not in mappa_coll:
            mappa_coll[x] = len(mappa_coll)
        r_.append(i)
        c_.append(mappa_coll[x])
Bc = sp.csr_matrix((np.ones(len(r_), np.float32), (r_, c_)),
                   shape=(n, max(len(mappa_coll), 1))).tocsr()
S = (Bc @ Bc.T).tocsr()
S.setdiag(0)
S.eliminate_zeros()
S.data[:] = 1.0
print(f"  collezioni distinte: {len(mappa_coll):,}")
salva("COLL", S)

# ============================================================ TV
print("\nTV — frequenza di visione insieme (cronologie Trakt)")
righe, cols, vals = [], [], []
uid = 0
for cart in ("users-full", "users"):
    for f in sorted(glob.glob(str(K.ROOT / ".cache" / "trakt" / cart / "movie-*.json"))):
        u = pathlib.Path(f).stem[6:]
        fatto = False
        for pref, chiave, med in (("movie", "movie", "movie"), ("show", "show", "tv")):
            g = K.ROOT / ".cache" / "trakt" / cart / f"{pref}-{u}.json"
            try:
                d = json.loads(g.read_text(encoding="utf-8"))
            except Exception:
                continue
            if not isinstance(d, list):
                continue
            for v in d:
                t = (v.get(chiave) or {}).get("ids", {}).get("tmdb")
                if not t:
                    continue
                r = row_of.get(f"{med}:{int(t)}")
                if r is None:
                    continue
                righe.append(uid)
                cols.append(r)
                vals.append(1.0)
                fatto = True
        if fatto:
            uid += 1
    if uid:
        break     # uso users-full se c'e', altrimenti users
print(f"  utenti usati: {uid:,} · interazioni: {len(righe):,}")
U = sp.csr_matrix((vals, (righe, cols)), shape=(uid, n), dtype=np.float32)
U.sum_duplicates()
U.data[:] = 1.0
print(f"  matrice utente x titolo: {U.shape} · {U.nnz:,} · "
      f"titoli coperti {int((np.asarray((U>0).sum(0)).ravel()>0).sum()):,}")
Vs, _, _ = svds(U.T.astype(np.float64), k=min(128, uid - 1), random_state=0)
Vs = np.asarray(Vs, np.float32)
print(f"  SVD {Vs.shape} ({time.time()-t0:.0f}s)")
salva("TV", K.topk_edges(Vs, TOPK))

print(f"\nFINE ({time.time()-t0:.0f}s)")
