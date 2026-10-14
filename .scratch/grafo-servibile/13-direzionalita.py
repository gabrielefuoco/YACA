"""13-direzionalita.py — TICKET 13: la direzionalita' pedagogica.

Ogni bolla ha la sua ACCESSIBILITA': la mediana del logaritmo dei voti dei suoi **membri core**
(purezza sopra la mediana della bolla — un intruso popolare non deve spostare l'accessibilita' di un
mondo d'autore). Ogni arco fra due bolle prende un SEGNO:

  verso una bolla MENO accessibile -> APPROFONDIMENTO (rabbit hole): porta da un mondo noto alla sua
      radice d'autore o di culto
  verso una bolla PIU' accessibile   -> ALLARGAMENTO (mainstream bridge): porta verso qualcosa di
      piu' facile da affrontare

Serve a rispondere a una domanda che l'utente si fa davvero: stasera voglio scendere in profondita'
o allargare l'orizzonte?

Uso:  python .scratch/grafo-servibile/13-direzionalita.py
"""
import json, pathlib, sys, time
from collections import Counter
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
voti = K.voti()
mem = np.load(K.ML / "bolle2-E.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)

CMP = K.Componenti(n)
C = CMP(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
M = K.costruisci(C, {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1},
                 wc=0.0, beta=0.25)
P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()
dentro = np.asarray(M.multiply(P[:, mem]).sum(1)).ravel()
purezza = (dentro / np.maximum(np.asarray(M.sum(1)).ravel(), 1e-9)).astype(np.float32)

# ------------------------------------------------------------------ l'accessibilita' (sui membri CORE)
logv = np.log10(np.maximum(voti, 1.0))
ACC = np.full(nb, np.nan)
n_core = np.zeros(nb, int)
for b in range(nb):
    m = np.where(mem == b)[0]
    med = np.median(purezza[m])
    core = m[purezza[m] >= med] if len(m) > 1 else m
    n_core[b] = len(core)
    ACC[b] = float(np.median(logv[core]))
valide = ~np.isnan(ACC)
print(f"accessibilita' calcolata per {int(valide.sum()):,} bolle · membri core: mediana "
      f"{int(np.median(n_core))} per bolla (il {int(100*np.median(n_core)/np.median(sz))}% dei membri)")
print(f"  accessibilita' (log10 voti): min {np.nanmin(ACC):.2f} · mediana {np.nanmedian(ACC):.2f} · "
      f"max {np.nanmax(ACC):.2f}  -> da {10**np.nanmin(ACC):,.0f} a {10**np.nanmax(ACC):,.0f} voti")

# il controllo: con TUTTI i membri invece dei core
ACC_tutti = np.array([np.median(logv[np.where(mem == b)[0]]) for b in range(nb)])
diff = np.abs(ACC - ACC_tutti)[valide]
print(f"  CONTROLLO sui membri core: la differenza rispetto a usare TUTTI i membri e' "
      f"mediana {np.nanmedian(diff):.3f} · 90° percentile {np.nanpercentile(diff, 90):.3f} "
      f"· massima {np.nanmax(diff):.3f} (in ordine di grandezza di voti)")
print(f"  >>> su {int(np.sum(diff > 0.3))} bolle la differenza supera 2x in voti: li' l'intruso "
      f"popolare avrebbe spostato l'accessibilita'")

# ------------------------------------------------------------------ i segni
# LA STESSA BASE DELLA MAPPA (ticket 12): il k-NN diretto k=8 sul punteggio combinato dei due
# assi. Ricostruita qui invece che riletta perche' il ticket 23 ha salvato una variante diversa
# (il mutual + albero di copertura), e i segni vanno calcolati sulla mappa che si usa davvero.
LISTA = K.carica_csr("nuovo-LIST.npz", n)


def _asse(pesi, extra=None):
    tot = sum(pesi.values())
    Mx = None
    for nome_c, w in pesi.items():
        A = K.correggi_hub(C[nome_c], 0.25) if nome_c in C else K.correggi_hub(extra, 0.25)
        q = A * (w / tot)
        Mx = q if Mx is None else Mx + q
    return K.normalizza(Mx.tocsr())


def _pmi(Mx):
    G = (P.T @ Mx @ P).tocsr()
    G.setdiag(0)
    G.eliminate_zeros()
    rr, cc, vv = sp.find(G)
    SA = np.asarray(G.sum(1)).ravel()
    to = vv.sum()
    p = np.maximum(np.log((vv * to) / np.maximum(SA[rr] * SA[cc], 1e-12)), 0.0)
    return sp.csr_matrix((p, (rr, cc)), shape=(nb, nb))


_bb = K.normalizza((_asse({"CF": 1, "B": 1, "TV": 1}) + K.correggi_hub(LISTA, 0.25) * 0.25).tocsr())
COMB = (_pmi(_bb) + _pmi(_asse({"KW": 1, "CAST": 1, "DIR": 1, "COLL": 1}))).tocsr()


def _kdir(Gx, k=8):
    ri, co = [], []
    for i in range(nb):
        riga = Gx.getrow(i)
        if riga.nnz == 0:
            continue
        d, idx = riga.data, riga.indices
        for j in idx[np.argsort(-d)[:k]]:
            ri.append(i)
            co.append(int(j))
    return sp.csr_matrix((np.ones(len(ri), np.float32), (ri, co)), shape=(nb, nb))


W = ((_kdir(COMB) + _kdir(COMB).T) > 0).astype(np.float32).tocsr()
from scipy.sparse.csgraph import connected_components
print(f"  base della mappa: {W.nnz:,} archi · "
      f"{connected_components(W, directed=False)[0]} componenti")
W.setdiag(0)
W.eliminate_zeros()
r, c, _ = sp.find(sp.triu(W))
ok = valide[r] & valide[c]
r, c = r[ok], c[ok]
verso_giu = ACC[c] < ACC[r]        # da r verso una bolla meno accessibile (se si va r->c)
uguali = np.abs(ACC[c] - ACC[r]) < 0.05
print("")
print("=" * 100)
print("I SEGNI DEGLI ARCHI")
print("=" * 100)
print(f"  archi (una volta per coppia): {len(r):,}")
print(f"    approfondimento (verso il meno accessibile): {int((~uguali & ((ACC[c]-ACC[r])<0)).sum()):,}")
print(f"    allargamento    (verso il piu' accessibile): {int((~uguali & ((ACC[c]-ACC[r])>0)).sum()):,}")
print(f"    accessibilita' equivalente (|Δ| < 0,05 = fattore 1,12): {int(uguali.sum()):,} "
      f"({100*uguali.mean():.1f}%)")

# ogni bolla: quanti approfondimenti e quanti allargamenti ha
giu = np.zeros(nb, int)
su = np.zeros(nb, int)
for a, b, d in zip(r, c, ACC[c] - ACC[r]):
    if abs(d) < 0.05:
        continue
    if d < 0:
        giu[a] += 1
        su[b] += 1
    else:
        su[a] += 1
        giu[b] += 1
sospette = ((giu == 0) & (su > 0)) | ((su == 0) & (giu > 0))
print("")
print(f"  --- la distribuzione del segno per bolla ---")
print(f"    bolle con SOLO approfondimenti (mai un allargamento): {int(((giu>0)&(su==0)).sum()):,}")
print(f"    bolle con SOLO allargamenti (mai un approfondimento): {int(((su>0)&(giu==0)).sum()):,}")
print(f"    bolle con entrambi: {int(((giu>0)&(su>0)).sum()):,} ({100*((giu>0)&(su>0)).mean():.1f}%)")
print(f"    >>> una bolla che e' SOLO approfondimento o SOLO allargamento e' sospetta: sono "
      f"{int(sospette.sum()):,} ({100*sospette.mean():.1f}%) — vanno verificate")

# ------------------------------------------------------------------ la lettura
TIT, KWt = {}, [set() for _ in range(n)]
for f, col in (("movies.parquet", "title"), ("tv.parquet", "name")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    typ = "movie" if f.startswith("m") else "tv"
    for i, t_ in zip(dd["id"], dd[col]):
        rr = row_of.get(f"{typ}:{int(i)}")
        if rr is not None:
            TIT[rr] = str(t_)
for f in ("movies.parquet", "tv.parquet"):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", "keywords"])
    typ = "movie" if f.startswith("m") else "tv"
    for i, kwd in zip(dd["id"], dd["keywords"]):
        rr = row_of.get(f"{typ}:{int(i)}")
        if rr is None:
            continue
        try:
            g = json.loads(kwd) if isinstance(kwd, str) else (kwd or [])
            KWt[rr] = {x.get("name", "").lower() for x in g if isinstance(x, dict)}
        except Exception:
            pass


def nome(b, q=3):
    c = Counter()
    for x in np.where(mem == b)[0][:20]:
        c.update(KWt[x])
    return " · ".join(w for w, _ in c.most_common(q)) or "—"


print("")
print("=" * 100)
print("LA LETTURA — gli archi piu' netti nei due versi")
print("=" * 100)
coppie = sorted(zip(r, c, ACC[c] - ACC[r]), key=lambda x: x[2])
print("")
print("  --- APPROFONDIMENTO estremo: da un mondo accessibile a uno di nicchia ---")
for a, b, d in coppie[:5]:
    print(f"    [{a}] {10**ACC[a]:>9,.0f} voti · {nome(a,3):<40} -> [{b}] {10**ACC[b]:>8,.0f} · {nome(b,3)}")
print("")
print("  --- ALLARGAMENTO estremo: da un mondo di nicchia a uno accessibile ---")
for a, b, d in coppie[-5:]:
    print(f"    [{a}] {10**ACC[a]:>9,.0f} voti · {nome(a,3):<40} -> [{b}] {10**ACC[b]:>8,.0f} · {nome(b,3)}")
print("")
print("  --- il caso piu' interessante: un mondo d'autore che HA un allargamento ---")
for a in np.argsort(-giu)[:60]:
    if su[a] > 0 and ACC[a] < np.nanmedian(ACC):
        dest = [b for aa, b, d in zip(r, c, ACC[c] - ACC[r]) if aa == a and d > 0.5]
        if dest:
            b = dest[0]
            print(f"    [{a}] {10**ACC[a]:,.0f} voti · {nome(a,3)}")
            print(f"        -> allargamento verso [{b}] {10**ACC[b]:,.0f} voti · {nome(b,3)}")
            break
print(f"\nFINE ({time.time()-t0:.0f}s)")
