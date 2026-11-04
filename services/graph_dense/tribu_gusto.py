"""tribu_gusto.py — le tribù di gusto: il pubblico di nicchia di un film evento (ticket nuovo).

IL PROBLEMA CHE RISOLVE. Un film come *Barbie* è visto da due popolazioni disgiunte: l'85% pubblico
generalista (che guarda anche *Pinocchio*, *La sirenetta*, *Avengers*) e il 15% cinefilo (che guarda
*Povere creature!*, *The Substance*, *The Love Witch*). La co-visione somma su tutti gli utenti: la
maggioranza schiaccia la minoranza e i primi venti posti si riempiono di blockbuster per famiglie.

L'IDEA. Fattorizzare utenti×film in K segmenti di gusto, **buttare i segmenti correlati con la
popolarità**, e tenere per ogni film solo i 2-3 segmenti dove ha il massimo lift. Così un film evento
tiene anche la sua tribù di nicchia, che la media cancellava.

  PYTHONPATH=. py -m services.graph_dense.tribu_gusto [--k 100]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from scipy.sparse.linalg import svds

from . import config as C, data as D, trakt as TK


def tribu(k_tribu=64, top_per_film=3, mainstrema=4, beta=0.65, silenzioso=False):
    """Matrice (N x k_tribu) sparsificata: le tribù di nicchia di ogni film, normalizzate."""
    B = D.basic()
    N = B['N']
    U, I, _ = TK.carica()
    u_uniq, u_idx = np.unique(U, return_inverse=True)
    X = sp.csr_matrix((np.ones(len(u_idx), np.float32), (u_idx, I)), shape=(len(u_uniq), N))
    X.sum_duplicates()
    X.data[:] = 1.0
    u_deg = np.asarray(X.sum(1)).ravel()
    i_deg = np.asarray(X.sum(0)).ravel()
    w_u = 1.0 / np.sqrt(np.maximum(u_deg, 1.0))
    # il peso sul film toglie il "mainstream": chi è visto da tutti non definisce una tribù
    w_i = np.where(i_deg >= 3, np.power(np.maximum(i_deg, 1.0), -beta), 0.0)
    Xw = (sp.diags(w_u) @ X @ sp.diags(w_i)).tocsr()
    k = int(min(k_tribu, min(Xw.shape) - 1))
    _, s, vt = svds(Xw.astype(np.float64), k=k)
    V = (vt.T * np.sqrt(s)[None, :]).astype(np.float32)

    # 1. via le tribù che sono solo popolarità
    logv = np.log1p(np.maximum(B['VOT'], 0))
    lc = logv - logv.mean()
    corr = np.abs((V.T @ lc) / (np.linalg.norm(V, axis=0) * np.linalg.norm(lc) + 1e-9))
    via = np.argsort(-corr)[:mainstrema]
    V[:, via] = 0.0
    if not silenzioso:
        print(f'  tribu: {k} segmenti · buttati i {mainstrema} più mainstream '
              f'(corr max {corr[via].max():.2f})', flush=True)

    # 2. ogni film tiene solo le sue tribù più specifiche: così la minoranza non viene mediata via
    Vp = np.maximum(V, 0.0)
    idx = np.argpartition(-Vp, top_per_film, axis=1)[:, :top_per_film]
    mask = np.zeros_like(Vp, dtype=bool)
    np.put_along_axis(mask, idx, True, axis=1)
    Vs = np.where(mask, Vp, 0.0)
    Vs /= (np.linalg.norm(Vs, axis=1, keepdims=True) + 1e-9)
    return Vs


def costruisci(B=None, k=100, k_tribu=64, top_per_film=3):
    B = D.basic() if B is None else B
    Vs = tribu(k_tribu, top_per_film)
    cop = float((np.linalg.norm(Vs, axis=1) > 0).mean())
    print(f'  tribu: {cop:.1%} del canone ha almeno una tribù', flush=True)
    import importlib.util
    spec = importlib.util.spec_from_file_location('tipi', C.ROOT / '.scratch' / 'distillazione-grafo' / 'tipi.py')
    tipi = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tipi)
    M = tipi.topk_cosine(Vs, k, etichetta='tribu')
    return M


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--tribu', type=int, default=64)
    ap.add_argument('--top', type=int, default=3)
    ap.add_argument('--out', default='services/graph/data/tipi2/TRIBU.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    from . import provenance as PV
    t0 = time.time()
    B = D.basic()
    M = costruisci(B, a.k, a.tribu, a.top)
    prov = PV.scrivi(a.out, M, step='tipi',
                     params={'tipo': 'TRIBU', 'k': a.k, 'tribu': a.tribu, 'top': a.top},
                     inputs={'trakt': PV.sha256_file(C.DATA / 'trakt-utenti.npz')},
                     canon_len=B['N'])
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['TRIBU'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                        grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                        riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                        ricetta=f'{a.tribu} tribù di gusto (SVD su utenti×film de-mainstreamed), '
                                f'top-{a.top} tribù per film',
                        khi={'k': a.k, 'tribu': a.tribu, 'top': a.top},
                        creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · {M.nnz:,} archi · prov {prov["sha256"][:12]} ({time.time()-t0:.0f}s)')


if __name__ == '__main__':
    main()
