"""prova-verity.py — dove finirebbe un film appena uscito che nel grafo non c'e'.

Il caso: **Verity** (id TMDB 1283515, uscito il 30/09/2026, 95 voti). E' nel dump TMDB ma non nel
grafo: dei 836 film del 2026 presenti nel dump, **solo 1** ha una riga nel grafo. Cioe' il catalogo
del grafo si ferma prima del 2026 — ed e' il caso che il prodotto deve saper servire.

Come si colloca un titolo freddo (ticket 16 di `grafo-servibile`: il gating serve proprio a questo):
  · NIENTE comportamento: non ha archi CF, B, TV
  · SI' i metadati: keyword, cast, regia, generi, anno, paese
Quindi si usa il canale STRUTTURALE: similarita' coseno IDF con gli altri titoli, poi si vota la bolla
dei vicini. E si legge.
"""
import json
import pathlib
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import bolle as B
import canone as K

ID = 1283515
PQ = K.ROOT / ".cache" / "tmdb"
print("=" * 100)
print("DOVE FINIREBBE «VERITY» (2026) — un titolo che nel grafo non c'e'")
print("=" * 100, flush=True)


def jsonv(x):
    if isinstance(x, str):
        try:
            x = json.loads(x)
        except Exception:
            return []
    return x if isinstance(x, list) else []


dv = pd.read_parquet(PQ / "movies.parquet")
v = dv[dv["id"] == ID].iloc[0]
print("\n--- cosa vede l'algoritmo ---")
kw_v = [str(x.get("name", "")).lower() for x in jsonv(v["keywords"]) if x.get("name")]
ca_v = [str(x.get("name")) for x in jsonv(v["cast"])[:10] if x.get("name")]
di_v = [str(x.get("name")) for x in jsonv(v["directors"]) if x.get("name")]
ge_v = [str(x.get("name", "")).lower() for x in jsonv(v["genres"]) if x.get("name")]
pa_v = [str(x.get("name") if isinstance(x, dict) else x) for x in jsonv(v["production_countries"])]
print(f"  titolo    {v['title']} ({str(v['release_date'])[:10]}) · voti {v['vote_count']}")
print(f"  generi    {', '.join(ge_v) or '-'}")
print(f"  regia     {', '.join(di_v) or '-'}")
print(f"  cast      {', '.join(ca_v[:6]) or '-'}")
print(f"  paese     {', '.join(pa_v) or '-'}")
print(f"  durata    {v['runtime']}")
print(f"  keyword   {', '.join(kw_v[:22])}{' …' if len(kw_v) > 22 else ''}")

# ---------------------------------------------------------------- la ricostruzione
INS = B.costruisci_insiemi()
catalogo = {(t, i): r for (t, i), r in []}  # segnaposto
# gli insiemi per titolo del catalogo (stessa fonte del componente KW)
COLS = ["id", "keywords", "cast", "directors", "genres", "production_companies", "production_countries"]
KWc = [set() for _ in range(B.N)]
CAc = [set() for _ in range(B.N)]
DIc = [set() for _ in range(B.N)]
PV = pd.read_parquet(PQ / "movies.parquet", columns=COLS)
tv = pd.read_parquet(PQ / "tv.parquet", columns=["id", "keywords", "cast", "created_by", "genres",
                                                 "production_companies", "production_countries"])
for f, cols, regia, tip in ((PV, COLS, "directors", "movie"),
                            (tv, COLS, "created_by", "tv")):
    for r in f.itertuples(index=False):
        d = dict(zip(cols, r))
        riga = B.ROW_OF.get(f"{tip}:{int(d['id'])}")
        if riga is None:
            continue
        for x in jsonv(d.get("keywords")):
            if x.get("name"):
                KWc[riga].add(str(x["name"]).lower())
        for x in jsonv(d.get("cast"))[:10]:
            if x.get("name"):
                CAc[riga].add(str(x["name"]))
        for x in jsonv(d.get(regia)):
            if x.get("name"):
                DIc[riga].add(str(x["name"]))
print(f"\n  catalogo: {sum(1 for s in KWc if s):,} titoli con keyword · "
      f"{sum(1 for s in CAc if s):,} con cast · {sum(1 for s in DIc if s):,} con regia", flush=True)

# ---------------------------------------------------------------- similarita' coseno IDF, come il componente
vocab = {}
for s in KWc:
    for x in s:
        vocab[x] = vocab.get(x, 0) + 1
vocab_new = {}
for x in kw_v:
    vocab_new[x] = 1
tutti = {**vocab}
for x in kw_v:
    tutti[x] = tutti.get(x, 0) + 1
idx = {x: i for i, x in enumerate(sorted(tutti))}
peso = np.array([np.log(B.N / (1 + tutti[x])) for x in sorted(tutti)], np.float32)

righe, cols, vals = [], [], []
for r in range(B.N):
    for x in KWc[r]:
        righe.append(r)
        cols.append(idx[x])
        vals.append(peso[idx[x]])
A = sp.csr_matrix((vals, (righe, cols)), shape=(B.N, len(idx)), dtype=np.float32)
vn = np.zeros((1, len(idx)), np.float32)
for x in kw_v:
    vn[0, idx[x]] = peso[idx[x]]
na = np.sqrt(np.asarray(A.multiply(A).sum(1)).ravel()) + 1e-9
nn = float(np.sqrt((vn ** 2).sum())) + 1e-9
sim = np.asarray(A @ vn.T).ravel() / (na * nn)
sim[np.isin(np.arange(B.N), [r for r in range(B.N) if not KWc[r]])] = 0

mem = np.load(K.ML / "bolle-nitrile-V7.npy")
sz = np.bincount(mem)
TIT, VOT = B.titoli_leggibili()

print("\n--- i 20 titoli piu' simili per keyword ---")
top = np.argsort(-sim)[:20]
for r in top:
    print(f"   {sim[r]:.4f}  {str(TIT[r])[:52]:<54} bolla {int(mem[r]):>5} ({int(sz[mem[r]]):>3} tit.)")

print("\n--- dove vota il vicinato: le bolle dei primi N ---")
for N in (5, 10, 20, 40):
    conta = {}
    for r in np.argsort(-sim)[:N]:
        if sim[r] <= 0:
            continue
        b = int(mem[r])
        conta[b] = conta.get(b, 0) + 1
    ordine = sorted(conta.items(), key=lambda z: -z[1])[:4]
    print(f"   N={N:>3}: " + " · ".join(f"bolla {b} ({c} voti, {int(sz[b])} tit.)" for b, c in ordine))

# ---------------------------------------------------------------- la bolla votata, letta
migliore = max({int(mem[r]): sum(1 for x in np.argsort(-sim)[:20] if sim[x] > 0 and int(mem[x]) == int(mem[r]))
                for r in np.argsort(-sim)[:20]}.items(), key=lambda z: z[1])[0]
print(f"\n--- LA BOLLA SCELTA: {migliore} ---")
mm = np.where(mem == migliore)[0]
for r in sorted(mm, key=lambda x: -sim[x])[:28]:
    print(f"   {'*' if r in top[:20] else ' '} {sim[r]:.4f}  {str(TIT[r])[:56]}")

print("\n--- e cosa sarebbe il suo vicinato sulla mappa (i 12 titoli piu' simili) ---")
for r in top[:12]:
    print(f"   {str(TIT[r])[:50]:<52} -> bolla {int(mem[r]):>5} · {int(sz[mem[r]]):>3} titoli")
