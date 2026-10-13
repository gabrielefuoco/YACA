"""rigenera-B.py — RICOSTRUISCE LA CO-VISIONE CON I DATI NUOVI.

Il fetch del `related` delle serie e' passato da 2.995 a 16.999 titoli (su 16.550 serie del
catalogo, 1.500 senza dati disponibili). La co-visione B era costruita sui soli 3.000 piu'
votati: ora copre tutto.

Salva il vecchio come `boot-B-3k.npz` e scrive il nuovo `boot-B.npz`, cosi' i numeri vecchi
restano riproducibili.
"""
import glob, json, pathlib, shutil, sys, time
import numpy as np
import scipy.sparse as sp
from scipy.sparse import coo_matrix

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
ML = K.ML


def normalizza(A):
    A = A.tocsr().astype(np.float32)
    d = np.asarray(A.sum(1)).ravel()
    return sp.diags(1.0 / np.maximum(d, 1e-9)).dot(A).tocsr()


def trakt_edges():
    rows, cols = [], []
    base = pathlib.Path(K.ROOT / ".cache" / "trakt")
    files = list(base.glob("rel-movie-*.json")) + list(base.glob("rel-tv-*.json"))
    print(f"  file rel: {len(files):,}")
    for f in files:
        try:
            rel = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rel, list):
            continue
        m = f.name.split("-")[1]          # 'movie' o 'tv'
        tids = [int(t) for t in ((v.get("ids") or {}).get("tmdb") for v in rel) if t]
        righe = []
        for t in tids:
            r = row_of.get(f"{m}:{t}")
            if r is not None:
                righe.append(r)
        for a in righe:
            for b in righe:
                if a != b:
                    rows.append(a)
                    cols.append(b)
    A = coo_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(n, n)).tocsr()
    A.data[:] = 1.0
    return normalizza((A + A.T) * 0.5)


B = trakt_edges()
g = np.asarray((B > 0).sum(1)).ravel()
print(f"B nuova: {B.nnz:,} archi ({time.time()-t0:.0f}s)")
print(f"  titoli con almeno un arco: {int((g>0).sum()):,} ({100*(g>0).mean():.1f}%)")
print(f"    film: {int((g[~is_tv]>0).sum()):,}/{int((~is_tv).sum()):,} · "
      f"serie: {int((g[is_tv]>0).sum()):,}/{int(is_tv.sum()):,}")

vecchio = ML / "boot-B.npz"
salvato = ML / "boot-B-3k.npz"
if vecchio.exists() and not salvato.exists():
    shutil.copy(vecchio, salvato)
    q = np.load(salvato)
    print(f"vecchio salvato come boot-B-3k.npz ({len(q['data']):,} archi)")

np.savez_compressed(vecchio, data=B.data, indices=B.indices, indptr=B.indptr)
print(f"boot-B.npz riscritto ({time.time()-t0:.0f}s)")
