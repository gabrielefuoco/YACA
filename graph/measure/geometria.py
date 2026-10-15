"""06-centroidi-geometria.py — TICKET 06: il bug geometrico dei centroidi.

§5.1 del senior. La diagnosi: in una bolla di 5 titoli i membri condividono ~15 token e il centroide
normalizzato ha i token dominanti a ~0,35; in una bolla di 150 titoli la media ha **migliaia** di token
non nulli e la normalizzazione L2 compatta i token principali di un fattore 3-4×. Risultato: nel
prodotto scalare **le micro-bolle battono sistematicamente le bolle grandi**, e la collocazione fa
100% sotto i 10 titoli e 21% sopra i 120.

Due correzioni da misurare:
  1. **Top-M**: dalla media dei membri si tengono i soli M token più alti, e SOLO DOPO si normalizza.
  2. **Ibrido**: `0,5·⟨x, μ_b^(M)⟩ + 0,5·(1/5)Σ_{j∈Top5(b,x)} ⟨x, v_j⟩` — cosi' cinque gemelli dentro
     una bolla da 100 non vengono annacquati dagli altri 95.

Tutto misurato sul banco (600 serie, LOO esatto) e sulla **curva per dimensione di bolla**, che è la
domanda vera: il ginocchio a 100 titoli si appiattisce?

Nota sul LOO con il top-M: la serie in esame va tolta **prima** di scegliere i token da tenere,
altrimenti il top-M della sua bolla la contiene. Si ricalcola il centroide di quella sola bolla,
per quella sola serie — 600 ricalcoli, non 900.000.
"""
import json
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
from graph import bubbles as B
from graph import canon as K

T0 = time.time()
ML = K.ML
print("=" * 104)
print("TICKET 06 — IL BUG GEOMETRICO DEI CENTROIDI: TOP-M E IBRIDO")
print("=" * 104, flush=True)

TF = sp.load_npz(K.A("05-tfidf.npz")).tocsr()
META = np.load(K.A("05-centroidi-meta.npz"))
bolle_serie, bolle_film, sz = META["bolle_serie"], META["bolle_film"], META["sz"]
TUTTE = np.concatenate([bolle_serie, bolle_film])
col_s = [k for k, b in enumerate(TUTTE) if b in set(int(x) for x in bolle_serie)]
mem = np.load(K.A("bolle-nitrile-V8.npy"))
N = len(mem)
NB = int(mem.max()) + 1
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]
Bcsr = K.carica_csr("boot-B.npz", N)
IS_TV = B.IS_TV
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])
pos = {int(b): k for k, b in enumerate(TUTTE)}
print(f"  TF {TF.shape} · {len(TUTTE):,} bolle candidate · banco 600 serie ({time.time()-T0:.0f}s)",
      flush=True)


def centroide(indici, M=None):
    """La media dei membri, coi soli M token più alti, poi normalizzata. `M=None` = com'e' adesso."""
    s = np.asarray(TF[indici].sum(0)).ravel() / max(len(indici), 1)
    if M is not None and M < (s > 0).sum():
        soglia = np.partition(s, -M)[-M]
        s = np.where(s >= soglia, s, 0.0)
    n = float(np.sqrt((s ** 2).sum()))
    return s / (n + 1e-9)


def matrice_centroidi(M=None):
    righe = np.zeros((len(TUTTE), TF.shape[1]), np.float32)
    for k, b in enumerate(TUTTE):
        righe[k] = centroide(MEMBRI[int(b)], M)
    return righe


def valuta(CENT, nome, ibrido=False, top5=5, taglia=True):
    S = np.asarray(TF[tolti] @ CENT.T)                     # (600, 1525)
    # LOO esatto per la bolla vera: si ricalcola il suo centroide SENZA la serie
    for k, i in enumerate(tolti):
        b = vere[k]
        if b not in pos:
            continue
        membri = MEMBRI[b]
        senza = membri[membri != i]
        if len(senza) == 0:
            continue
        c = centroide(senza, M if not ibrido else None)
        S[k, pos[b]] = float((TF[i] @ c).item() if hasattr(TF[i] @ c, 'item') else (TF[i] @ c))
    if ibrido:
        T = np.asarray((TF[tolti] @ TF.T).todense())       # (600, 66k): similarità con ogni titolo
        # IL CONTRATTO CHE IL SENIOR CHIEDE (§4.1), e che qui serviva davvero: la serie in esame e'
        # MEMBRA della sua bolla, quindi la sua auto-similarita' (1,0) e' il massimo della riga e
        # entra nei top-5, gonfiando la bolla vera. Si azzera il solo elemento diagonale.
        T[np.arange(len(tolti)), tolti] = 0.0
        agg = np.zeros_like(S)
        for k, b in enumerate(TUTTE):
            m_ = MEMBRI[int(b)]
            if len(m_) == 0:
                continue
            sub = T[:, m_]
            kk = min(top5, sub.shape[1])
            idx = np.argpartition(-sub, kk - 1, axis=1)[:, :kk]
            agg[:, k] = sub[np.arange(600)[:, None], idx].mean(1)
        S = 0.5 * S + 0.5 * agg
    a = np.array([int(TUTTE[col_s[int(np.argmax(S[k, col_s]))]]) for k in range(600)])
    ok = a == vere
    print(f"  {nome:<40} propria bolla {int(ok.sum()):>3}/600 ({100*ok.mean():5.1f}%)")
    if taglia:
        dim = np.array([int(sz[b]) for b in vere])
        riga = []
        for lo, hi in ((0, 10), (10, 30), (30, 60), (60, 120), (120, 10**6)):
            m = (dim >= lo) & (dim < hi)
            riga.append(f"{lo}-{hi if hi < 10**6 else '∞'}: {100*ok[m].mean():5.1f}%" if m.sum() else "")
        print(f"     per dimensione: {' · '.join(x for x in riga if x)}")
    return ok


print("\n" + "=" * 104)
print("IL CONFRONTO")
print("=" * 104, flush=True)
RIS = {}
for M in (None, 100, 50, 35, 25, 15):
    nome = "com'e' adesso (nessun top-M)" if M is None else f"top-M = {M}"
    CENT = matrice_centroidi(M)
    RIS[nome] = valuta(CENT, nome)

print()
for M in (None, 50, 35, 25):
    nome = ("ibrido, " + ("senza top-M" if M is None else f"top-M={M}")) + " + top5"
    CENT = matrice_centroidi(M)
    RIS[nome] = valuta(CENT, nome, ibrido=True)

print("\n" + "=" * 104)
print("IL GINOCCHIO, PRIMA E DOPO")
print("=" * 104)
base = RIS["com'e' adesso (nessun top-M)"]
migl = max(RIS.items(), key=lambda z: z[1].sum())
print(f"  partenza: {100*base.mean():.1f}% · migliore: {100*migl[1].mean():.1f}% ({migl[0]})")
dim = np.array([int(sz[b]) for b in vere])
print(f"\n  {'fascia':<12} {'adesso':>8} {'migliore':>9}   differenza")
for lo, hi in ((0, 10), (10, 30), (30, 60), (60, 120), (120, 10**6)):
    m = (dim >= lo) & (dim < hi)
    if not m.sum():
        continue
    a, b_ = 100*base[m].mean(), 100*migl[1][m].mean()
    print(f"  {lo:>3}-{hi if hi < 10**6 else '∞':<7} {a:>7.1f}% {b_:>8.1f}%   {b_-a:+6.1f} punti")
print(f"\n  la curva e' monotona? adesso: {'sì' if base[np.argsort(dim)].mean() > 0 else '—'}")
print(f"  correlazione fra dimensione della bolla e successo:")
for nome in ("com'e' adesso (nessun top-M)", migl[0]):
    ok = RIS[nome]
    print(f"    {nome:<40} r = {np.corrcoef(dim, ok.astype(float))[0,1]:+.3f}")

# e Verity, per chiudere il cerchio
mv_m = None
print(f"\n  e i vicini di VERITY col top-M migliore:")
TIT, _ = B.titoli_leggibili()
import pandas as pd
mv = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / "movies.parquet")
dd = mv[mv["id"] == 1283515].iloc[0].to_dict()
from graph import collocator as CF
S = CF.carica(v3=True)
b, conf, ntok, fuori = CF.colloca(dd, "movie", S)
vic = CF.vicini_titoli(CF.vettore(CF.tokenizza(dd, "movie"), S)[0], S, 6)
print(f"    bolla {b} (coseno {conf:.3f}) · vicini: "
      f"{[TIT[i][:26] for i, _ in vic]}")
print(f"\nFINE ({time.time()-T0:.0f}s)")
