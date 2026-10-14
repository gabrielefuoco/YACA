"""prova-verity-2.py — la collocazione di «Verity» con TUTTI i canali, non solo le keyword.

Il primo giro usava solo le keyword: 20 titoli simili in 20 bolle diverse, 1-2 voti ciascuno,
nessuna maggioranza. Ma le keyword di Verity sono **8 e generiche** ("based on novel or book" e'
la keyword piu' diffusa del catalogo). L'algoritmo ha anche cast, regia e generi, e il prodotto ha
due cataloghi separati: il film non puo' finire in una bolla di serie.

Qui: quattro canali, normalizzati, e il vincolo di medium.
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


def jsonv(x):
    if isinstance(x, str):
        try:
            x = json.loads(x)
        except Exception:
            return []
    return x if isinstance(x, list) else []


dv = pd.read_parquet(PQ / "movies.parquet")
v = dv[dv["id"] == ID].iloc[0]
kwv = [str(x.get("name", "")).lower() for x in jsonv(v["keywords"]) if x.get("name")]
cav = [str(x.get("name")) for x in jsonv(v["cast"])[:10] if x.get("name")]
div = [str(x.get("name")) for x in jsonv(v["directors"]) if x.get("name")]
gev = [str(x.get("name", "")).lower() for x in jsonv(v["genres"]) if x.get("name")]

COLS = ["id", "keywords", "cast", "directors", "genres", "production_companies", "production_countries"]
KWc = [set() for _ in range(B.N)]
CAc = [set() for _ in range(B.N)]
DIc = [set() for _ in range(B.N)]
GEc = [set() for _ in range(B.N)]
mv = pd.read_parquet(PQ / "movies.parquet", columns=COLS)
COLS_TV = [c if c != "directors" else "created_by" for c in COLS]
tvv = pd.read_parquet(PQ / "tv.parquet", columns=COLS_TV)
for f, regia, tip in ((mv, "directors", "movie"), (tvv, "created_by", "tv")):
    for r in f.itertuples(index=False):
        d = dict(zip([c if c != "created_by" else "directors" for c in COLS_TV] if f is tvv else COLS, r))
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
        for x in jsonv(d.get("genres")):
            if x.get("name"):
                GEc[riga].add(str(x["name"]).lower())
print(f"catalogo: {sum(1 for s in KWc if s):,} con keyword · {sum(1 for s in CAc if s):,} con cast "
      f"· {sum(1 for s in DIc if s):,} con regia", flush=True)


def coseno(insiemi, nuovo, etichetta):
    vocab = {}
    for s in insiemi:
        for x in s:
            vocab[x] = vocab.get(x, 0) + 1
    voci = sorted(set(vocab) | set(nuovo))
    peso = np.array([np.log(B.N / (1 + vocab.get(x, 0) + (1 if x in nuovo else 0))) for x in voci],
                    np.float32)
    idx = {x: i for i, x in enumerate(voci)}
    r_, c_, v_ = [], [], []
    for r in range(B.N):
        for x in insiemi[r]:
            r_.append(r)
            c_.append(idx[x])
            v_.append(peso[idx[x]])
    A = sp.csr_matrix((v_, (r_, c_)), shape=(B.N, len(voci)), dtype=np.float32)
    vn = np.zeros((1, len(voci)), np.float32)
    for x in nuovo:
        vn[0, idx[x]] = peso[idx[x]]
    na = np.sqrt(np.asarray(A.multiply(A).sum(1)).ravel()) + 1e-9
    nn = float(np.sqrt((vn ** 2).sum())) + 1e-9
    sim = np.asarray(A @ vn.T).ravel() / (na * nn)
    print(f"  canale {etichetta:<10}: max {sim.max():.4f} · titoli con similarita' > 0 "
          f"{int((sim > 1e-6).sum()):,}", flush=True)
    return sim


S_KW = coseno(KWc, kwv, "keyword")
S_CA = coseno(CAc, cav, "cast")
S_DI = coseno(DIc, div, "regia")
S_GE = coseno(GEc, gev, "generi")

mem = np.load(K.ML / "bolle-nitrile-V7.npy")
sz = np.bincount(mem)
TIT, VOT = B.titoli_leggibili()
film = ~B.IS_TV

print("\n" + "=" * 100)
print("LE COLLOCAZIONI, canale per canale (solo FILM: Verity e' un film, e i cataloghi sono separati)")
print("=" * 100)
for nome, S, quante in (("keyword", S_KW, 12), ("cast", S_CA, 12), ("regia", S_DI, 8), ("generi", S_GE, 8)):
    print(f"\n--- solo {nome} ---")
    top = [r for r in np.argsort(-S) if film[r] and S[r] > 1e-6][:quante]
    for r in top:
        print(f"   {S[r]:.4f}  {str(TIT[r])[:50]:<52} bolla {int(mem[r]):>5} ({int(sz[mem[r]]):>3} tit.)")

# ---------------------------------------------------------------- il punteggio combinato
pes = {"keyword": 0.25, "cast": 0.35, "regia": 0.30, "generi": 0.10}
S = (pes["keyword"] * S_KW + pes["cast"] * S_CA + pes["regia"] * S_DI + pes["generi"] * S_GE)
S = np.where(film, S, 0)
print("\n" + "=" * 100)
print(f"COMBINATO (pesi: {pes}) — SOLO FILM")
print("=" * 100)
top = np.argsort(-S)[:24]
for r in top:
    print(f"   {S[r]:.4f}  {str(TIT[r])[:50]:<52} bolla {int(mem[r]):>5} ({int(sz[mem[r]]):>3} tit.)")

print("\n--- dove vota il vicinato, per N ---")
for N in (5, 10, 20, 50, 100):
    conta = {}
    for r in np.argsort(-S)[:N]:
        if S[r] <= 0:
            continue
        conta[int(mem[r])] = conta.get(int(mem[r]), 0) + 1
    ordine = sorted(conta.items(), key=lambda z: -z[1])[:3]
    tot = sum(conta.values())
    print(f"   N={N:>4}: " + " · ".join(f"bolla {b} ({c})" for b, c in ordine) + f"   [{tot} voti]")

migliore = max({b: c for b, c in
                [(int(mem[r]), sum(1 for x in np.argsort(-S)[:50]
                                   if S[x] > 0 and int(mem[x]) == int(mem[r])))
                 for r in np.argsort(-S)[:50]]}.items(), key=lambda z: z[1])
print(f"\n--- LA BOLLA SCELTA: {migliore[0]} ({migliore[1]} voti su 50,"
      f" {int(sz[migliore[0]])} titoli) ---")
mm = np.where(mem == migliore[0])[0]
for r in sorted(mm, key=lambda x: -S[x])[:26]:
    print(f"     {S[r]:.4f}  {str(TIT[r])[:56]}")
