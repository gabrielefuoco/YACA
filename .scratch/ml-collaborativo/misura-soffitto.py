"""
.scratch/ml-collaborativo/misura-soffitto.py

IL DENOMINATORE: quanto della posizione collaborativa di un film e' RIPRODUCIBILE?

Il coseno dello student (0,500) significa qualcosa solo se si sa quanto e' raggiungibile. Il modo di
saperlo: spezzare gli utenti MovieLens in due meta' indipendenti, costruire DUE teacher separati, e
misurare quanto la posizione dello stesso film e' stabile fra i due. Tutto cio' che non e' stabile e'
rumore di campionamento degli utenti: nessun modello basato sui metadati puo' prevederlo.

Due misure:
  A. coseno fra i due spazi, DOPO allineamento di Procrustes (i due spazi differiscono per una
     rotazione arbitraria: senza allineare, il coseno non significa nulla);
  B. accordo sui VICINI (top-50, top-100): quanti dei film che una meta' dice vicini lo dice anche
     l'altra. Misura senza rotazioni, ed e' quella che conta per l'uso reale (i "simili").

Aggiustamento di Spearman-Brown: le due meta' hanno meta' utenti ciascuna, quindi sono PIU' rumorose
del teacher intero. r_intero = 2r/(1+r) stima l'affidabilita' del teacher completo.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/misura-soffitto.py
"""
import json
import pathlib

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.sparse.linalg import svds

ROOT = pathlib.Path(__file__).resolve().parents[2]
ML = ROOT / ".cache" / "movielens" / "ml-32m"
PQ = ROOT / ".cache" / "tmdb"
EMB_DIM = 64
SEED = 20261008
N_NEIGH = 2000

def log(m): print(m, flush=True)
rng = np.random.default_rng(SEED)

links = pd.read_csv(ML / "links.csv").dropna(subset=["tmdbId"]).astype({"tmdbId": "int64", "movieId": "int64"})
mid_by_tmdb = dict(zip(links["tmdbId"], links["movieId"]))
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "keywords", "vote_count"])
mv = mv[mv["keywords"].map(lambda s: isinstance(s, str) and len(json.loads(s)) > 0)]
covered = sorted(set(mid_by_tmdb[int(x)] for x in mv["id"] if int(x) in mid_by_tmdb))
mid_pos = {m: i for i, m in enumerate(covered)}
log(f"film: {len(covered):,}")

ratings = pd.read_csv(ML / "ratings.csv", usecols=["userId", "movieId"], dtype="int32")
ratings = ratings[ratings["movieId"].isin(mid_pos)]
log(f"voti utili: {len(ratings):,} · utenti: {ratings['userId'].nunique():,}")

users = np.sort(ratings["userId"].unique())
half = rng.permutation(len(users)) < len(users) // 2
setA = set(int(u) for u in users[half]); setB = set(int(u) for u in users[~half])
log(f"meta' A: {len(setA):,} utenti · meta' B: {len(setB):,} utenti")

def teacher(uids):
    r = ratings[ratings["userId"].isin(uids)]
    r = r.assign(i=r["movieId"].map(mid_pos).astype("int32"))
    X = sparse.csr_matrix((np.ones(len(r), dtype=np.float32), (r["userId"].to_numpy(np.int32), r["i"].to_numpy(np.int32))),
                          shape=(int(r["userId"].max()) + 1, len(covered)))
    X.sum_duplicates(); X.data[:] = 1.0
    n_item = np.asarray(X.sum(axis=0)).ravel()
    Xw = X.multiply((1.0 / np.log1p(np.maximum(n_item, 1)))[None, :]).tocsr()
    U, S, Vt = svds(Xw, k=EMB_DIM)
    Z = Vt.T
    return Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9), n_item

ZA, nA = teacher(setA)
log(f"teacher A fatto · film con >=1 voto in A: {int((nA>0).sum()):,}")
ZB, nB = teacher(setB)
log(f"teacher B fatto · film con >=1 voto in B: {int((nB>0).sum()):,}")

both = (nA > 0) & (nB > 0)
log(f"film presenti in entrambe le meta': {int(both.sum()):,}")

# --- A. allineamento di Procrustes e coseno per film
Bm = ZB[both]
Am = ZA[both]
U, S, Vt = np.linalg.svd(Bm.T @ Am, full_matrices=False)
R = U @ Vt
Bal = Bm @ R
cos = np.einsum("ij,ij->i", Am, Bal)
# l'allineamento e' stimato su tutti i film: 64x64 = 4.096 parametri su ~50.000 film, ininfluente.
log(f"\n=== A. STABILITA' DELLA POSIZIONE (coseno fra due teacher indipendenti) ===")
log(f"  coseno medio fra le due meta': {cos.mean():.3f}   (mediana {np.median(cos):.3f})")
r_ = float(cos.mean())
log(f"  affidabilita' del teacher INTERO (Spearman-Brown, 2r/(1+r)): {2*r_/(1+r_):.3f}")
log(f"  confronto: student sui metadati 0,500 · vettore medio 0,224")

# --- per popolarita': il rumore non e' uniforme
votes = np.array([float(mv.loc[mv['id'] == int(t), 'vote_count'].iloc[0]) if (mv['id'] == int(t)).any() else 0.0 for t in list(mid_by_tmdb)[:0]]) if False else None
popmap = {int(i): float(v or 0) for i, v in zip(mv["id"], mv["vote_count"])}
tmdb_by_mid = {v: k for k, v in mid_by_tmdb.items()}
vpop = np.array([popmap.get(int(tmdb_by_mid.get(int(m), -1)), 0.0) for m in covered])[both]
for lo, hi, lbl in [(0, 100, "poveri di voti (<100)"), (100, 1000, "medi (100-1.000)"), (1000, 1e9, "molto votati (1.000+)")]:
    m = (vpop >= lo) & (vpop < hi)
    if m.sum() > 10:
        log(f"  {lbl:<24} {m.sum():>6,} film · coseno fra le due meta' {cos[m].mean():.3f}")

# --- B. accordo sui vicini (senza rotazioni)
idx = np.where(both)[0]
sample = rng.choice(len(idx), size=min(N_NEIGH, len(idx)), replace=False)   # indici RELATIVI (ZAo/ZBo sono Z[both])
ZAo, ZBo = ZA[both], ZB[both]
ov50, ov100 = [], []
for i, s in enumerate(sample):
    a = ZAo @ ZAo[s]; b = ZBo @ ZBo[s]
    ta = [int(x) for x in np.argsort(-a) if int(x) != s][:100]
    tb = [int(x) for x in np.argsort(-b) if int(x) != s][:100]
    ov50.append(len(set(ta[:50]) & set(tb[:50])) / 50)
    ov100.append(len(set(ta) & set(tb)) / 100)
log(f"\n=== B. ACCORDO SUI VICINI ({len(sample):,} film campionati) ===")
log(f"  top-50 : {100*np.mean(ov50):.1f}% dei vicini coincidono fra le due meta'")
log(f"  top-100: {100*np.mean(ov100):.1f}%")
log(f"  (se le due meta' fossero indipendenti, l'accordo sarebbe ~0,1%)")
