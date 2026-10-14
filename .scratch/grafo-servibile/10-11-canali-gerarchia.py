"""10-11-canali-gerarchia.py — i CANALI TIPIZZATI (ticket 10) e la GERARCHIA (ticket 11).

TICKET 10. Quando si costruiscono le bolle i componenti si sommano: e' giusto, ed e' cosi' che la
partizione trova i mondi. Ma una volta trovate le bolle, **non si usa la matrice sommata per
collegarle**. Si calcolano due assi separati:
  * COMPORTAMENTALE — comportamento, co-visione dalle cronologie, liste curate;
  * STRUTTURALE — regia, cast, keyword, firma produttiva.
E incrociandoli i ponti si classificano in tre tipi, che significano cose diverse:
  CANONICO            alto/alto    -> stessa scuola o tema E stesso pubblico
  VIBE                alto/basso  -> mondi diversi, stesso pubblico: il SORPRENDENTE AZZECCATO
  COLLISIONE LESSICALE zero/alto  -> condividono una keyword generica e nient'altro: rumore

TICKET 11. Sopra le bolle, una gerarchia a tre livelli: L1 (~25-35 macro-mondi), L2 (~300-400
costellazioni), L3 (le 5.297 bolle). NON un embedding a 2 dimensioni: le bolle si legano lungo sei
assi e proiettarli in un piano produce strappi.

Uso:  python .scratch/grafo-servibile/10-11-canali-gerarchia.py
"""
import json, pathlib, sys, time
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
F = sp.load_npz(K.ML / "bolle-archi.npz").tocsr()     # il grafo sparsificato del ticket 09
W = (F + F.T).tocsr()
print(f"bolle {nb:,} · archi sparsificati {W.nnz:,} · mediana vicini "
      f"{int(np.median(np.asarray((W>0).sum(1)).ravel()))}")

CMP = K.Componenti(n)
C = CMP(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
LISTA = K.carica_csr("nuovo-LIST.npz", n)
P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()

# le keyword, per nominare
KWt = [set() for _ in range(n)]
for f, col in (("movies.parquet", "keywords"), ("tv.parquet", "keywords")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    typ = "movie" if f.startswith("m") else "tv"
    for i, kwd in zip(dd["id"], dd[col]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is None:
            continue
        try:
            g = json.loads(kwd) if isinstance(kwd, str) else (kwd or [])
            KWt[r] = {x.get("name", "").lower() for x in g if isinstance(x, dict)}
        except Exception:
            pass
vocab, rr, cc = {}, [], []
for i, s in enumerate(KWt):
    for x in s:
        if x not in vocab:
            vocab[x] = len(vocab)
        rr.append(i); cc.append(vocab[x])
AK = sp.csr_matrix((np.ones(len(rr), np.float32), (rr, cc)), shape=(n, max(len(vocab), 1))).tocsr()
TIT = {}
for f, col in (("movies.parquet", "title"), ("tv.parquet", "name")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col])
    typ = "movie" if f.startswith("m") else "tv"
    for i, t_ in zip(dd["id"], dd[col]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t_)
TB = (P.T @ AK).tocsr()
inv = {v: k for k, v in vocab.items()}


def nome(b, q=3):
    riga = TB.getrow(b)
    if riga.nnz == 0:
        return "—"
    idx = np.argsort(-riga.data)[:q]
    return " · ".join(inv[riga.indices[i]] for i in idx)


# ============================================================ TICKET 10: i due assi
print("")
print("costruisco i due assi ...", flush=True)


def asse(pesi):
    tot = sum(pesi.values())
    M = None
    for nome_c, w in pesi.items():
        A = K.correggi_hub(C[nome_c] if nome_c in C else LISTA, 0.25)
        p = A * (w / tot)
        M = p if M is None else M + p
    return K.normalizza(M.tocsr())


B_VA = asse({"CF": 1, "B": 1, "TV": 1, "LIST": 1})
S_VA = asse({"KW": 1, "CAST": 1, "DIR": 1, "COLL": 1})


def pesi_assi(M, coppie):
    """Il peso bolla-bolla di un asse sulle coppie date."""
    G = (P.T @ M @ P).tocsr()
    G.setdiag(0)
    G.eliminate_zeros()
    r, c, v = sp.find(G)
    chiave = {(int(a), int(b)): float(x) for a, b, x in zip(r, c, v)}
    out = np.array([chiave.get((int(a), int(b)), 0.0) for a, b in coppie])
    # PMI+ dell'asse
    SA = np.asarray(G.sum(1)).ravel()
    tot = v.sum()
    pmi = {}
    for a, b, x in zip(r, c, v):
        z = np.log(x * tot / max(SA[a] * SA[b], 1e-12))
        pmi[(int(a), int(b))] = max(z, 0.0)
    return out, np.array([pmi.get((int(a), int(b)), 0.0) for a, b in coppie])


r_, c_, _ = sp.find(sp.triu(W))
coppie = list(zip(r_.tolist(), c_.tolist()))
print(f"  coppie da classificare: {len(coppie):,} ({time.time()-t0:.0f}s)", flush=True)
w_b, pmi_b = pesi_assi(B_VA, coppie)
w_s, pmi_s = pesi_assi(S_VA, coppie)
print(f"  PMI comportamentale: zero su {100*np.mean(pmi_b==0):.1f}% · "
      f"PMI strutturale: zero su {100*np.mean(pmi_s==0):.1f}%")

med_b, med_s = float(np.median(pmi_b)), float(np.median(pmi_s))
TIPO = np.full(len(coppie), "canonico", dtype=object)
TIPO[(pmi_b > med_b) & (pmi_s <= med_s)] = "vibe"
TIPO[(pmi_b == 0) & (pmi_s > med_s)] = "collisione"
TIPO[(pmi_b <= med_b) & (pmi_s <= med_s)] = "debole"
print("")
print(f"  --- i tre tipi (soglia: la mediana del PMI di ciascun asse) ---")
for t in ("canonico", "vibe", "collisione", "debole"):
    print(f"    {t:<12} {int((TIPO==t).sum()):>7,} ({100*(TIPO==t).mean():5.1f}%)")
# il controllo del confondimento: la popolarita' delle bolle e' appaiata fra i tipi?
vot = np.zeros(nb)
for b in range(nb):
    vot[b] = np.median(voti[np.where(mem == b)[0]])
print("")
print(f"  CONTROLLO di confondimento — popolarita' mediana (per bolla) dei due estremi:")
for t in ("canonico", "vibe", "collisione"):
    m = TIPO == t
    if m.sum():
        print(f"    {t:<12} sorgente {np.median(vot[r_[m]]):>9,.0f} · "
              f"bersaglio {np.median(vot[c_[m]]):>9,.0f}")

print("")
print("=" * 100)
print("I PONTI *VIBE* — da leggere (alto comportamentale, basso strutturale)")
print("=" * 100)
idx_vibe = np.where(TIPO == "vibe")[0]
forti = idx_vibe[np.argsort(-pmi_b[idx_vibe])]
visti = set()
mostrati = 0
for i in forti:
    a, b = int(r_[i]), int(c_[i])
    if a in visti or b in visti:
        continue
    visti.add(a); visti.add(b)
    ma = np.where(mem == a)[0]
    mb_ = np.where(mem == b)[0]
    print("")
    print(f"  [{a}] {sz[a]} titoli · {nome(a,3)}")
    print(f"      esempio: " + " · ".join(TIT.get(x, "?")[:30] for x in ma[:3]))
    print(f"  [{b}] {sz[b]} titoli · {nome(b,3)}")
    print(f"      esempio: " + " · ".join(TIT.get(x, "?")[:30] for x in mb_[:3]))
    print(f"      PMI comportamentale {pmi_b[i]:.2f} · strutturale {pmi_s[i]:.2f}")
    mostrati += 1
    if mostrati >= 10:
        break

print("")
print("=" * 100)
print("LE COLLISIONI LESSICALI — da leggere (zero comportamentale, alto strutturale)")
print("=" * 100)
idx_coll = np.where(TIPO == "collisione")[0]
for i in idx_coll[np.argsort(-pmi_s[idx_coll])][:8]:
    a, b = int(r_[i]), int(c_[i])
    print(f"  [{a}] {nome(a,4):<44} · [{b}] {nome(b,4)}")

# ============================================================ TICKET 11: la gerarchia
print("")
print("=" * 100)
print("LA GERARCHIA A TRE LIVELLI")
print("=" * 100)
import igraph as ig
import leidenalg as la

Fc = W.tocoo()
msk = Fc.row < Fc.col
g = ig.Graph(n=nb, edges=np.column_stack((Fc.row[msk], Fc.col[msk])), directed=False)
g.es["weight"] = Fc.data[msk].astype(float).tolist()
print(f"grafo delle bolle: {g.vcount():,} nodi · {g.ecount():,} archi "
      f"· componenti connesse {len(g.connected_components())}")
print(f"  (i nodi sono {nb:,}: le bolle isolate sono nodi singoli)")
print("")
for et, res in (("L2 (costellazioni)", 6.0), ("L1 (macro-mondi)", 0.6)):
    p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                          resolution_parameter=res, seed=42)
    m = np.array(p.membership)
    nq = len(np.unique(m))
    szq = np.bincount(m)
    print(f"  {et}: risoluzione {res} -> {nq:,} gruppi · mediana {int(np.median(szq))} bolle "
          f"· mod {p.modularity:.3f}")
    np.save(K.ML / f"gerarchia-{et[1]}.npy", m)

m1 = np.load(K.ML / "gerarchia-L.npy")
n1 = len(np.unique(m1))
print("")
print(f"  --- i {n1} MACRO-MONDI, con le keyword piu' condivise ---")
for k in np.argsort(-np.bincount(m1)):
    membri = np.where(m1 == k)[0]
    titoli_m = np.concatenate([np.where(mem == b)[0] for b in membri])
    if len(titoli_m) == 0:
        continue
    conta = {}
    for x in titoli_m[:4000]:
        for w in KWt[x]:
            conta[w] = conta.get(w, 0) + 1
    top = sorted(conta, key=lambda w: -conta[w])[:6]
    voti_m = int(np.median(voti[titoli_m]))
    print(f"    [{k}] {len(membri)} bolle · {len(titoli_m):,} titoli · voti med {voti_m:>6,} · "
          + " · ".join(top))
print(f"\nFINE ({time.time()-t0:.0f}s)")
