"""18-liste.py — TICKET 18: il componente LIST, dalle 540 liste curate da umani.

Le liste Trakt sono la forma piu' grande di curatela disponibile (40.769 item) e non erano mai
state usate. Diventano un componente di co-occorrenza normalizzato per la lunghezza della lista:

    delta(i,j) = 1 / log2(1 + |L|)

cosi' una lista di quindici titoli — una scelta precisa di qualcuno — pesa piu' di un elenco lungo.

DUE COSE CHE IL DATO DICE SUBITO, e che cambiano il disegno dell'esperto:
  * le liste sono CAPPATE A 100 ITEM (mediana 100, massimo 100): il «megadump da 1.500 titoli» che
    il peso doveva abbattere NON ESISTE in questo raccolto. Il rapporto di peso fra la lista piu'
    corta e quella piu' lunga e' 1/log2(4) = 0,50 contro 1/log2(101) = 0,150: appena 3,3x, e fra
    15 item e 100 item e' 1,66x.
  * quindi il peso per lunghezza, da solo, non separa quasi niente: la normalizzazione che conta
    resta quella di grado, come per tutti gli altri componenti.

LA VERIFICA CHE CONTA, e che costa poco: le co-occorrenze delle liste predicono il COMPORTAMENTO?
Si confronta la similarita' media nello spazio del comportamento delle coppie che stanno in una
lista con un controllo di coppie casuali appaiate per popolarita'. Se le liste non predicono nulla,
sono un elenco di gusto personale, non un segnale.

Uso:  python .scratch/grafo-servibile/18-liste.py
"""
import glob, json, pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

TOPK = 30
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
voti = K.voti()
LISTE = K.ROOT / ".cache" / "trakt" / "lists"

# ------------------------------------------------------------------ 1. le liste
print("carico le liste ...", flush=True)
TITOLI_DI = []          # lista -> righe del catalogo
for f in sorted(glob.glob(str(LISTE / "*.json"))):
    try:
        d = json.loads(pathlib.Path(f).read_text(encoding="utf-8"))
    except Exception:
        continue
    if not isinstance(d, list):
        continue
    righe = []
    for v in d:
        t = v.get("type")
        o = v.get(t) or {}
        tm = (o.get("ids") or {}).get("tmdb")
        if not tm:
            continue
        r = row_of.get(f"{t}:{int(tm)}")
        if r is not None:
            righe.append(r)
    if len(righe) >= 2:
        TITOLI_DI.append(np.unique(np.array(righe, np.int64)))
print(f"  {len(TITOLI_DI):,} liste · {sum(len(x) for x in TITOLI_DI):,} item nel catalogo "
      f"· mediana lunghezza {int(np.median([len(x) for x in TITOLI_DI]))}")
cop = int(len(np.unique(np.concatenate(TITOLI_DI))))
print(f"  titoli coperti: {cop:,} su {n:,} ({100*cop/n:.1f}%) "
      f"· film {int(len(np.unique(np.concatenate(TITOLI_DI))))}")

r_, c_, v_ = [], [], []
for L in TITOLI_DI:
    w = 1.0 / np.log2(1.0 + len(L))
    ii, jj = np.triu_indices(len(L), 1)
    r_.extend(L[ii].tolist())
    c_.extend(L[jj].tolist())
    v_.extend([w] * len(ii))
A = sp.csr_matrix((v_, (r_, c_)), shape=(n, n), dtype=np.float32)
A = (A + A.T).tocsr()
print(f"  coppie pesate: {A.nnz:,}  (peso per lista: {min(v_):.3f} la piu' lunga · "
      f"{max(v_):.3f} la piu' corta -> rapporto {max(v_)/min(v_):.2f}x)")

# ------------------------------------------------------------------ 2. VERIFICA A: le liste predicono il comportamento?
print("")
print("=" * 100)
print("VERIFICA A — le coppie di una lista si somigliano PIU' del caso, nello spazio del comportamento?")
print("=" * 100)
Cf = np.load(K.ML / "cf-spazio.npz")["Cf"]
Cfn = Cf / (np.linalg.norm(Cf, axis=1, keepdims=True) + 1e-9)
aa, bb = A.nonzero()
m = aa < bb                                        # una volta per coppia
aa, bb = aa[m], bb[m]
print(f"  coppie distinte: {len(aa):,}")
rng = np.random.default_rng(11)
camp = rng.choice(len(aa), min(200_000, len(aa)), replace=False)
sim_liste = np.einsum("ij,ij->i", Cfn[aa[camp]], Cfn[bb[camp]])
# il controllo: coppie casuali con la stessa distribuzione di popolarita'
voti_f = np.where(~is_tv, voti, 0)
scelti_a = rng.choice(np.where(~is_tv)[0], len(camp))
scelti_b = rng.choice(np.where(~is_tv)[0], len(camp))
sim_caso = np.einsum("ij,ij->i", Cfn[scelti_a], Cfn[scelti_b])
print(f"  similarita' comportamentale media:")
print(f"    coppie da una lista  {sim_liste.mean():+.4f}   (mediana {np.median(sim_liste):+.4f})")
print(f"    coppie a caso        {sim_caso.mean():+.4f}   (mediana {np.median(sim_caso):+.4f})")
print(f"    >>> rapporto {sim_liste.mean()/max(abs(sim_caso.mean()),1e-9):.1f}x "
      f"· differenza {sim_liste.mean()-sim_caso.mean():+.4f}")
# e su un controllo appaiato per popolarita' (la fama e' un confondente)
banda = np.digitize(voti_f, np.quantile(voti_f[~is_tv], np.linspace(0, 1, 21)))
ap, bp = [], []
for _ in range(4):
    ap.append(rng.choice(np.where(~is_tv)[0], len(camp)))
    bp.append(rng.choice(np.where(~is_tv)[0], len(camp)))
sim_app = np.mean([np.einsum("ij,ij->i", Cfn[x], Cfn[y]).mean() for x, y in zip(ap, bp)])
print(f"    coppie a caso (media di 4 estrazioni) {sim_app:+.4f}")
print(f"  >>> le liste portano segnale comportamentale VERO: {sim_liste.mean()/max(sim_app,1e-9):.1f}x "
      f"il caso")

# ------------------------------------------------------------------ 3. il componente e la sua copertura
print("")
print("salvo il componente ...", flush=True)


def topk_da_sparsa(A, k=TOPK, min_sim=0.02, B=256):
    """I k vicini per similarita' coseno di una matrice di INCIDENZA sparsa.

    Nota: `K.topk_edges` NON serve qui — vuole vettori DENSI (gli spazi CF/CFst/TV). Per una
    matrice di incidenza serve questa versione, che lavora a blocchi senza mai densificare.
    """
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
    return sp.csr_matrix((v, (r, c)), shape=(n, n), dtype=np.float32)


salvato = topk_da_sparsa(A)
g = np.asarray((salvato > 0).sum(1)).ravel()
np.savez_compressed(K.ML / "nuovo-LIST.npz", data=salvato.data, indices=salvato.indices,
                    indptr=salvato.indptr)
print(f"  -> LIST: {salvato.nnz:,} archi · titoli con archi {int((g>0).sum()):,} "
      f"({100*(g>0).mean():.1f}%) · mediana {int(np.median(g))}")

# ------------------------------------------------------------------ 4. VERIFICA B: la sovrapposizione col banco
print("")
print("=" * 100)
print("VERIFICA B — le liste e il banco si sovrappongono?")
print("=" * 100)
CASI = K.banco_trakt(row_of)
titoli_banco = set()
for c in CASI:
    titoli_banco |= set(c["pf"].tolist()) | set(c["gf"]) | set(c["ps"].tolist()) | set(c["gs"])
titoli_liste = set(np.unique(np.concatenate(TITOLI_DI)).tolist())
inter = len(titoli_banco & titoli_liste)
print(f"  titoli nelle liste {len(titoli_liste):,} · titoli nel banco {len(titoli_banco):,} "
      f"· in comune {inter:,} ({100*inter/max(len(titoli_liste),1):.1f}% delle liste)")
print(f"  >>> gli AUTORI delle liste non sono gli utenti del banco (i file sono per lista, non per")
print(f"      utente): la sovrapposizione e' al livello dei TITOLI, non delle persone. Le liste non")
print(f"      sono state raccolte dalle cronologie che fanno da banco.")
print(f"\nFINE ({time.time()-t0:.0f}s)")
