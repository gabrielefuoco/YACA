"""07-componenti.py — TICKET 07: pesi di specificità, maschere di formato, firma produttiva.

Quattro interventi sui componenti strutturali, che oggi pesano tutti uguale e per questo fanno da
super-colla fra mondi incompatibili. Ognuno si misura SEPARATAMENTE, e la misura e' il giudice
automatico del ticket 06 (corsa a parte, su ogni partizione salvata qui).

  CAST2  l'attore pesa per la POSIZIONE nei titoli di testa (1/(1+ordine)) e per la CONCENTRAZIONE
         tematica della sua carriera (inverso dell'entropia di generi e paesi). Un caratterista
         ubiquo smette di collegare horror, cinecomic, cinema d'autore e animazione.
  KW2    una keyword sopravvive solo se le coppie di titoli che la condividono hanno similarita'
         COMPORTAMENTALE sopra la mediana. Cadono le keyword strutturali ma non estetiche.
  FMT    compatibilita' di formato: un corto verso i lungometraggi, un documentario verso la
         fiction. Non e' un componente: e' una maschera applicata agli archi.
  PROD   la firma produttiva: studio o rete di nicchia, oppure paese non-US + decennio + genere.

Salva `nuovo-CAST2.npz`, `nuovo-KW2.npz`, `nuovo-PROD.npz`, `formato.npy` (il tipo per titolo) e
`bolle-07-<A..F>.npy` (le partizioni da giudicare).
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
        if (i // B) % 80 == 0 and i:
            print(f"    {etichetta} {i:,}/{n:,} ({time.time()-t0:.0f}s)", flush=True)
    return sp.csr_matrix((v, (r, c)), shape=(n, n), dtype=np.float32)


def leggi_json(s, chiave="name"):
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, dict)]
    except Exception:
        return []


# ============================================================ metadati (piu' colonne di prima)
print("carico i metadati ...", flush=True)
COLS_M = ["id", "keywords", "cast", "directors", "genres", "runtime", "release_date",
          "production_companies", "production_countries", "collection_id"]
COLS_T = ["id", "keywords", "cast", "created_by", "genres", "runtime", "first_air_date",
          "production_companies", "production_countries", "networks"]

CASTO = [dict() for _ in range(n)]      # titolo -> {attore: ordine}
KW = [set() for _ in range(n)]
GEN = [set() for _ in range(n)]
PAE = [set() for _ in range(n)]
COMP = [set() for _ in range(n)]
RETE = [set() for _ in range(n)]
DEC = np.full(n, -1, np.int16)
RUNT = np.full(n, -1, np.int32)
DOC = np.zeros(n, bool)

for f, typ, cols in ((PQ / "movies.parquet", "movie", COLS_M), (PQ / "tv.parquet", "tv", COLS_T)):
    d = pd.read_parquet(f, columns=cols)
    for riga in d.itertuples(index=False):
        dd = dict(zip(cols, riga))
        r = row_of.get(f"{typ}:{int(dd['id'])}")
        if r is None:
            continue
        for x in leggi_json(dd.get("keywords")):
            KW[r].add(str(x.get("name", "")).lower())
        for x in leggi_json(dd.get("cast")):
            nm = x.get("name")
            if nm:
                CASTO[r][str(nm)] = int(x.get("order", 9) or 9)
        for x in leggi_json(dd.get("genres")):
            nm = str(x.get("name", "")).lower()
            if nm:
                GEN[r].add(nm)
                if "documentary" in nm:
                    DOC[r] = True
        for p in leggi_json(dd.get("production_countries"), "iso_3166_1"):
            PAE[r].add(str(p.get("iso_3166_1") or p.get("name") or "").upper())
        v = dd.get("production_countries")
        if isinstance(v, str):
            try:
                for x in json.loads(v):
                    PAE[r].add(str(x).upper() if isinstance(x, str) else "")
            except Exception:
                pass
        for x in leggi_json(dd.get("production_companies")):
            nm = str(x.get("name", "")).strip()
            if len(nm) > 2:
                COMP[r].add(nm)
        if "networks" in dd:
            for x in leggi_json(dd.get("networks")):
                nm = str(x.get("name", "")).strip()
                if len(nm) > 2:
                    RETE[r].add(nm)
        rt = dd.get("runtime")
        if rt is not None and not (isinstance(rt, float) and np.isnan(rt)):
            RUNT[r] = int(rt)
        dt = dd.get("release_date") if typ == "movie" else dd.get("first_air_date")
        if dt:
            try:
                DEC[r] = int(str(dt)[:4]) // 10 * 10
            except Exception:
                pass

print(f"  cast {sum(len(c) for c in CASTO):,} · keyword {sum(len(s) for s in KW):,} "
      f"· paesi {sum(len(s) for s in PAE):,} · compagnie {sum(len(s) for s in COMP):,} "
      f"· reti {sum(len(s) for s in RETE):,} ({time.time()-t0:.0f}s)", flush=True)


def matrice_idf(insiemi, pesi_extra=None):
    """titolo x vocabolo, pesata IDF. `pesi_extra` e' una lista di dict (vocabolo -> moltiplicatore)."""
    vocab = {}
    for s in insiemi:
        for x in s:
            vocab[x] = vocab.get(x, 0) + 1
    idx = {x: i for i, x in enumerate(vocab)}
    r_, c_, v_ = [], [], []
    for i, s in enumerate(insiemi):
        ex = pesi_extra[i] if pesi_extra is not None else {}
        for x in s:
            r_.append(i)
            c_.append(idx[x])
            v_.append(float(np.log(n / (1 + vocab[x]))) * float(ex.get(x, 1.0)))
    return sp.csr_matrix((v_, (r_, c_)), shape=(n, len(idx)), dtype=np.float32)


# ============================================================ 1. CAST2 — posizione x concentrazione
print("\nCAST2 — l'attore pesa per posizione in fatturazione e concentrazione di carriera", flush=True)
# la concentrazione: entropia di Shannon dei generi e dei paesi della carriera dell'attore
gen_att, pae_att = {}, {}
for r in range(n):
    if not CASTO[r]:
        continue
    for a in CASTO[r]:
        d = gen_att.setdefault(a, {})
        e = pae_att.setdefault(a, {})
        for g in GEN[r]:
            d[g] = d.get(g, 0) + 1
        for p in PAE[r]:
            e[p] = e.get(p, 0) + 1


def entropia(cnt):
    if len(cnt) <= 1:
        return 0.0
    tot = sum(cnt.values())
    p = np.array([v / tot for v in cnt.values()])
    p = p[p > 0]
    return float(-(p * np.log2(p)).sum())


conc = {}
for a in gen_att:
    h = 0.5 * entropia(gen_att[a]) + 0.5 * entropia(pae_att.get(a, {}))
    conc[a] = 1.0 / (1.0 + h)              # 1,0 per chi ha una carriera monocorde; scende con l'entropia
print(f"  attori con una carriera: {len(conc):,} · concentrazione mediana {np.median(list(conc.values())):.3f}",
      flush=True)

CA2 = [set(CASTO[r].keys()) for r in range(n)]
extra = [{a: 1.0 / (1.0 + CASTO[r][a]) * conc.get(a, 0.5) for a in CASTO[r]} for r in range(n)]
salva("CAST2", topk_da_sparsa(matrice_idf(CA2, extra), etichetta="CAST2"))

# ============================================================ 2. KW2 — coerenza comportamentale
print("\nKW2 — una keyword sopravvive solo se predice co-visione", flush=True)
Cf = np.load(K.ML / "cf-spazio.npz")["Cf"]
Cfn = Cf / (np.linalg.norm(Cf, axis=1, keepdims=True) + 1e-9)
stato = None     # la co-visione non serve qui: la coerenza si misura sullo spazio del comportamento
rng = np.random.default_rng(5)
kv = {}
for r in range(n):
    for x in KW[r]:
        kv.setdefault(x, []).append(r)
coerenza = {}
for x, righe in kv.items():
    if len(righe) < 3:
        continue
    camp = righe if len(righe) <= 40 else list(rng.choice(righe, 40, replace=False))
    M = Cfn[camp] @ Cfn[camp].T
    iu = np.triu_indices(len(camp), 1)
    coerenza[x] = float(M[iu].mean())
if coerenza:
    med = float(np.median(list(coerenza.values())))
    tenute = {x for x, v in coerenza.items() if v > med}
    print(f"  keyword con ≥3 titoli: {len(coerenza):,} · coerenza mediana {med:.4f} · "
          f"tenute {len(tenute):,} ({100*len(tenute)/len(coerenza):.1f}%)")
    print(f"  --- le 12 PIU' pruned (coerenza piu' bassa: quelle che non predicono nulla) ---")
    for x, v in sorted(coerenza.items(), key=lambda z: z[1])[:12]:
        print(f"      {x:<44} coerenza {v:+.4f} · {len(kv[x]):,} titoli")
    print(f"  --- le 12 PIU' tenute ---")
    for x, v in sorted(coerenza.items(), key=lambda z: -z[1])[:12]:
        print(f"      {x:<44} coerenza {v:+.4f} · {len(kv[x]):,} titoli")
    KW2 = [{x for x in KW[r] if x in tenute} for r in range(n)]
else:
    KW2 = KW
salva("KW2", topk_da_sparsa(matrice_idf(KW2), etichetta="KW2"))

# ============================================================ 3. FMT — la maschera di formato
print("\nFMT — compatibilita' di formato")
formato = np.zeros(n, np.int8)                 # 0 = fiction, 1 = corto, 2 = documentario
formato[DOC] = 2
corti = (RUNT > 0) & (RUNT < 45) & ~DOC
formato[corti] = 1
print(f"  corti {int((formato==1).sum()):,} · documentari {int((formato==2).sum()):,} · "
      f"fiction {int((formato==0).sum()):,}")
np.save(K.ML / "formato.npy", formato)
COMPAT = np.array([[1.0, 0.25, 0.20],
                   [0.25, 1.0, 0.25],
                   [0.20, 0.25, 1.0]], np.float32)
print("  matrice di compatibilita' (riga/colonna: fiction, corto, documentario):")
for i in range(3):
    print("      " + "  ".join(f"{COMPAT[i,j]:.2f}" for j in range(3)))

# ============================================================ 4. PROD — la firma produttiva
print("\nPROD — studio o rete di nicchia, oppure paese+decennio+genere", flush=True)
n_comp = {}
for r in range(n):
    for c in COMP[r]:
        n_comp[c] = n_comp.get(c, 0) + 1
n_rete = {}
for r in range(n):
    for c in RETE[r]:
        n_rete[c] = n_rete.get(c, 0) + 1
SIG = [set() for _ in range(n)]
for r in range(n):
    for c in COMP[r]:
        if n_comp[c] <= 40:                    # studio di nicchia: pochi titoli nel catalogo
            SIG[r].add(f"co:{c}")
    for c in RETE[r]:
        if n_rete[c] <= 60:
            SIG[r].add(f"rt:{c}")
    if DEC[r] > 0:
        non_us = {p for p in PAE[r] if p and p not in ("US", "USA", "GB", "UK")}
        if non_us:
            for p in non_us:
                for g in GEN[r]:
                    SIG[r].add(f"pg:{p}|{DEC[r]}|{g}")
cop = int(sum(1 for s in SIG if s))
print(f"  firme distinte {len({x for s in SIG for x in s}):,} · titoli con almeno una firma "
      f"{cop:,} ({100*cop/n:.1f}%) · mediana firme per titolo "
      f"{np.median([len(s) for s in SIG]):.0f}")
salva("PROD", topk_da_sparsa(matrice_idf(SIG), etichetta="PROD"))

# ============================================================ 5. le partizioni da giudicare
print("\nLE PARTIZIONI ...", flush=True)
import igraph as ig
import leidenalg as la

CMP = K.Componenti(n)
Cc = CMP(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV", "KW2", "CAST2", "PROD"):
    Cc[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)

BASE = {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1}
VARIANTI = {
    "A": ("base (gli stessi componenti di bolle2-E)", BASE, False),
    "B": ("+ CAST2 al posto di CAST", {**{k: v for k, v in BASE.items() if k != "CAST"}, "CAST2": 1}, False),
    "C": ("+ KW2 al posto di KW", {**{k: v for k, v in BASE.items() if k != "KW"}, "KW2": 1}, False),
    "D": ("+ maschera di formato", BASE, True),
    "E": ("+ PROD", {**BASE, "PROD": 1}, False),
    "F": ("tutto insieme", {**{k: v for k, v in BASE.items() if k not in ("KW", "CAST")},
                            "KW2": 1, "CAST2": 1, "PROD": 1}, True),
}
RES = 100
for lettera, (descrizione, pesi, con_fmt) in VARIANTI.items():
    M = K.costruisci(Cc, pesi, wc=0.0, beta=0.25)
    if con_fmt:
        Mc = M.tocoo()
        fattore = COMPAT[formato[Mc.row], formato[Mc.col]].astype(np.float32)
        M = sp.csr_matrix((Mc.data * fattore, (Mc.row, Mc.col)), shape=(n, n)).tocsr()
        M = K.normalizza(M)
    Mc = M.tocoo()
    msk = Mc.row < Mc.col
    g = ig.Graph(n=n, edges=np.column_stack((Mc.row[msk], Mc.col[msk])), directed=False)
    g.es["weight"] = Mc.data[msk].astype(float).tolist()
    p = la.find_partition(g, la.RBConfigurationVertexPartition, weights="weight",
                          resolution_parameter=RES, seed=42)
    mem = np.array(p.membership)
    np.save(K.ML / f"bolle-07-{lettera}.npy", mem)
    sz = np.bincount(mem)
    print(f"  bolle-07-{lettera}: {len(np.unique(mem)):,} bolle · {int((sz>=15).sum()):,} con ≥15 · "
          f"mediana {int(np.median(sz))} · modularita' {p.modularity:.4f}   [{descrizione}] "
          f"({time.time()-t0:.0f}s)", flush=True)
    del g, M, Mc

print(f"\nFINE ({time.time()-t0:.0f}s)")
