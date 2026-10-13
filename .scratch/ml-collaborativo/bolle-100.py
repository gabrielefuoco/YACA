"""bolle-100.py — 100 BOLLE DA LEGGERE, E COME SONO COLLEGATE FRA LORO.

Due cose:
  1. CAMPIONE LARGO: 100 bolle della variante "tutto" (bolle2-E), 10 titoli ciascuna, piu' le
     keyword condivise come indizio. Da leggere e giudicare una per una.
  2. IL GRAFO DELLE BOLLE: la matrice bolle x bolle (peso = somma degli archi fra i titoli delle
     due bolle). Per 30 bolle campione: i 4 vicini piu' forti, con i loro titoli, per vedere se
     le bolle vicine sono dello stesso mondo o no.

Il giudizio e' mio: leggo e nomino.
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
PQ = K.ROOT / ".cache" / "tmdb"
TIT, VOT, KWt = {}, np.zeros(n, np.float32), [set() for _ in range(n)]
mv = pd.read_parquet(PQ / "movies.parquet", columns=["id", "title", "vote_count", "keywords"])
tvp = pd.read_parquet(PQ / "tv.parquet", columns=["id", "name", "vote_count", "keywords"])
for typ, df, col in (("movie", mv, "title"), ("tv", tvp, "name")):
    for i, t, vc, kw in zip(df["id"], df[col], df["vote_count"], df["keywords"]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is None:
            continue
        TIT[r] = str(t)
        VOT[r] = float(vc or 0)
        try:
            g = json.loads(kw) if isinstance(kw, str) else (kw or [])
            KWt[r] = {x.get("name", "").lower() for x in g if isinstance(x, dict)}
        except Exception:
            pass
print(f"titoli caricati ({time.time()-t0:.0f}s)", flush=True)

mem = np.load(K.ML / "bolle2-E.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)
print(f"variante TUTTO: {nb:,} bolle · {int((sz>=15).sum()):,} con >=15 titoli")

# ---------- keyword condivise per bolla (indizio, non giudizio) ----------
print("calcolo le keyword condivise ...", flush=True)
vocab, r_, c_ = {}, [], []
for i, s in enumerate(KWt):
    for x in s:
        if x not in vocab:
            vocab[x] = len(vocab)
        r_.append(i)
        c_.append(vocab[x])
A = sp.csr_matrix((np.ones(len(r_), np.float32), (r_, c_)), shape=(n, len(vocab))).tocsr()
P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()
TB = (P.T @ A).tocsr()          # bolle x keyword (conteggi)
inv = {v: k for k, v in vocab.items()}


def nome_bolla(b, quanti=4):
    row = TB.getrow(b)
    if row.nnz == 0:
        return "—"
    idx = np.argsort(-row.data)[:quanti * 4]
    cand = [inv[row.indices[i]] for i in idx]
    return " · ".join(cand[:quanti])


# ---------- 1. il campione da leggere ----------
CESTONE = 10
ids = [i for i in range(nb) if 15 <= sz[i] <= 60]
rng = np.random.default_rng(11)
scelte = [ids[i] for i in rng.choice(len(ids), size=min(100, len(ids)), replace=False)]
print("")
print("#" * 104)
print(f"# 100 BOLLE DA LEGGERE   ({len(ids):,} bolle fra 15 e 60 titoli · ne leggo {len(scelte)})")
print("#" * 104, flush=True)
for b in scelte:
    m = np.where(mem == b)[0]
    ordine = m[np.argsort(-VOT[m])]
    print("")
    print(f"[{b}] {len(m)} titoli · serie {int(is_tv[m].sum())} · voti med {int(np.median(VOT[m]))} "
          f"· kw: {nome_bolla(b, 3)}")
    print("   " + " · ".join(TIT.get(r, "?")[:30] for r in ordine[:CESTONE]))

# ---------- 2. il grafo delle bolle ----------
print("")
print("#" * 104)
print("# COME SONO COLLEGATE — i vicini di 30 bolle campione")
print("#" * 104, flush=True)
C = K.Componenti(n)
Cc = C(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    Cc[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
M = K.costruisci(Cc, {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1},
                 wc=0.0, beta=0.25)
print(f"grafo titoli pronto ({time.time()-t0:.0f}s)", flush=True)
G = (P.T @ M @ P).tocsr()
G.setdiag(0)
G.eliminate_zeros()
print(f"matrice bolle x bolle: {G.shape} · {G.nnz:,} collegamenti", flush=True)

# quante bolle sono isolate?
gradi = np.asarray((G > 0).sum(1)).ravel()
print(f"  bolle senza nessun vicino: {int((gradi == 0).sum()):,} · mediana vicini {int(np.median(gradi)):,} "
      f"· 90o percentile {int(np.percentile(gradi, 90)):,}")

viste = 0
for b in scelte:
    if viste >= 30:
        break
    viste += 1
    riga = G.getrow(b)
    if riga.nnz == 0:
        continue
    top = riga.indices[np.argsort(-riga.data)][:4]
    m = np.where(mem == b)[0]
    ordine = m[np.argsort(-VOT[m])]
    print("")
    print(f">>> [{b}] {len(m)} titoli · kw: {nome_bolla(b, 4)}")
    print("      " + " · ".join(TIT.get(r, "?")[:26] for r in ordine[:6]))
    for t in top:
        mt = np.where(mem == t)[0]
        ot = mt[np.argsort(-VOT[mt])]
        print(f"    -> [{t}] {len(mt)} titoli · kw: {nome_bolla(t, 3)}")
        print("       " + " · ".join(TIT.get(r, "?")[:26] for r in ot[:6]))
print(f"\nFINE ({time.time()-t0:.0f}s)")
