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


def profili(H, eps=1e-9, centra=True, alpha=0.05):
    """Profili di contesto per film: log-rapporto sulla media, **centrati**, L2-normalizzati.

    TRE CORREZIONI rispetto al primo tentativo.
    (1) niente `log1p`: comprimeva proprio la sovra-rappresentazione da misurare; il log del rapporto
        è la scala giusta (è un PMI).
    (2) **centratura per contesto**: senza, i vettori restano non negativi e il coseno fra vettori non
        negativi è alto per costruzione — Barbie/Povere creature! finiva al 64° percentile delle
        coppie a caso.
    (3) i film senza massa restano a zero e non entrano come vettori "medi".
    """
    # QUARTA CORREZIONE (handoff 5, bug 2). Prima era `log(max(quota,1e-9) / max(media,1e-9))`: un
    # contesto assente prendeva log(1e-9/0.04) ~ -17,5, cioe' SETTE unita' log di contrasto contro
    # ~0,5 di segnale vero. Misurato: il 12,4% dell'energia veniva dagli zeri e il coseno correlava
    # 0,525 col solo supporto binario. Ora smoothing di Dirichlet proporzionale a `media`
    # (alpha=0.05 = 5% di pseudo-conteggio): dove H=0 il lift tende a 0. Con alpha=0 si riottiene
    # esattamente il comportamento vecchio.
    H = np.asarray(H, np.float32)
    col_sum = H.sum(0, keepdims=True)
    attivi = col_sum.ravel() > 0
    quota = H / (col_sum + eps)                         # P(contesto | film)
    if alpha > 0 and attivi.any():
        media = quota[:, attivi].mean(1, keepdims=True)  # media fra i film ATTIVI soltanto
        quota = (H + alpha * media) / (col_sum + alpha)
    else:
        media = quota.mean(1, keepdims=True)
    v = np.log(np.maximum(quota, eps) / np.maximum(media, eps))
    if centra:
        v = v - v.mean(1, keepdims=True)
    v[:, ~attivi] = 0.0
    n = np.linalg.norm(v, axis=0, keepdims=True)
    return (v / (n + eps)).T                             # (N, K)


def costruisci(B=None, k=100, contesti=None):
    B = D.basic() if B is None else B
    z = np.load(contesti or C.DATA / 'contesti.npz', allow_pickle=True)
    H = z['H']
    V = profili(H, alpha=float(__import__('os').environ.get('CONTESTI_SMOOTH', '0.05')))
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
    ap.add_argument('--contesti', default=None, help='fattori NMF precomputati; default graph_dense/data/contesti.npz')
    a = ap.parse_args()
    from . import provenance as PV
    t0 = time.time()
    B = D.basic()
    source = Path(a.contesti) if a.contesti else C.DATA / 'contesti.npz'
    M = costruisci(B, a.k, source)
    prov = PV.scrivi(a.out, M, step='tipi', params={'tipo': 'CONTESTI', 'k': a.k},
                     inputs={'contesti': PV.sha256_file(source)}, canon_len=B['N'])
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
