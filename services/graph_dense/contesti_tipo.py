"""contesti_tipo.py — il tipo d'arco dai contesti di visione (ticket 26).

Dai fattori NMF (`contesti.npz`) si costruisce un tipo per il grafo. La chiave è **il lift**, non la
quota: la quota dice in che contesti un film sta, il lift dice in quali è **sovra-rappresentato**
rispetto alla media. È il lift che disambigua: *Barbie* sta nel contesto "spettacolo contemporaneo"
come ci stanno cento altri film, ma ci sta molto più della media.

  w_ik = (H[k,i] / Σ_k H[k,i]) / p_k        p_k = quota media del contesto k su tutti i film
  poi L2, poi coseno top-100.

  PYTHONPATH=. py -m services.graph_dense.contesti_tipo [--k 100]
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from . import config as C, data as D


def profili(H, eps=1e-9, centra=True):
    """Profili di contesto per film: log-rapporto sulla media, **centrati**, L2-normalizzati.

    TRE CORREZIONI rispetto al primo tentativo.
    (1) niente `log1p`: comprimeva proprio la sovra-rappresentazione da misurare; il log del rapporto
        è la scala giusta (è un PMI).
    (2) **centratura per contesto**: senza, i vettori restano non negativi e il coseno fra vettori non
        negativi è alto per costruzione — Barbie/Povere creature! finiva al 64° percentile delle
        coppie a caso.
    (3) i film senza massa restano a zero e non entrano come vettori "medi".
    """
    H = np.asarray(H, np.float32)
    quota = H / (H.sum(0, keepdims=True) + eps)          # P(contesto | film)
    media = quota.mean(1, keepdims=True)                 # P(contesto) medio fra i film
    v = np.log(np.maximum(quota, eps) / np.maximum(media, eps))
    if centra:
        v = v - v.mean(1, keepdims=True)
    v[:, H.sum(0) <= 0] = 0.0
    n = np.linalg.norm(v, axis=0, keepdims=True)
    return (v / (n + eps)).T                             # (N, K)


def costruisci(B=None, k=100):
    B = D.basic() if B is None else B
    z = np.load(C.DATA / 'contesti.npz', allow_pickle=True)
    H = z['H']
    V = profili(H)
    cop = float((np.linalg.norm(V, axis=1) > 0).mean())
    print(f'  contesti_tipo: {V.shape[1]} contesti · {cop:.1%} del canone ha un profilo', flush=True)
    import importlib.util
    spec = importlib.util.spec_from_file_location('tipi', C.ROOT / '.scratch' / 'distillazione-grafo' / 'tipi.py')
    tipi = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tipi)
    return tipi.topk_cosine(V.astype(np.float32), k, etichetta='contesti')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--out', default='services/graph/data/tipi2/CONTESTI.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    from . import provenance as PV
    t0 = time.time()
    B = D.basic()
    M = costruisci(B, a.k)
    prov = PV.scrivi(a.out, M, step='tipi', params={'tipo': 'CONTESTI', 'k': a.k},
                     inputs={'contesti': PV.sha256_file(C.DATA / 'contesti.npz')}, canon_len=B['N'])
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['CONTESTI'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                           grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                           riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                           ricetta='coseno sui profili di contesto NMF (48 contesti, lift, log)',
                           khi={'k': a.k}, creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · {M.nnz:,} archi · prov {prov["sha256"][:12]} ({time.time()-t0:.0f}s)')


if __name__ == '__main__':
    main()
