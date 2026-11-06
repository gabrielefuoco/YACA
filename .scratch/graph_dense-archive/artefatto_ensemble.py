"""Artefatto ensemble: concatena (con pesi) piu' Z gia' addestrati in un unico vettore.

La similarita' nel vettore concatenato e' la somma pesata delle similarita' dei membri, quindi
l'ensemble "late fusion" diventa un solo vettore (dim = somma delle dim). Per un titolo nuovo
servono i k encoder; per i titoli del canone basta Z.

Uso: py -m services.graph_dense.artefatto_ensemble --membri lc150:3,lc150s:3,t1:1,a10:1
"""
from __future__ import annotations

import argparse
import hashlib
import json

import numpy as np

from . import config as C
from . import data as D
from . import eval as E


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--membri", default="lc150:3,lc150s:3,t1:1,a10:1")
    ap.add_argument("--nome", default="spazio-denso-ensemble")
    a = ap.parse_args(argv)
    membri = []
    for x in a.membri.split(","):
        nome, w = x.split(":")
        membri.append((nome.strip(), float(w)))

    B = D.basic(); S = D.triangle()
    sp = np.load(C.DATA / "split.npz"); split = {k: sp[k] for k in sp.files}
    blocchi, dims, modelli = [], [], []
    for nome, w in membri:
        Z = np.load(C.DATA / f"{nome}.npz")["Z"].astype(np.float32)
        blocchi.append(Z * np.sqrt(w))
        dims.append(Z.shape[1])
        modelli.append({"nome": nome, "peso": w, "dim": int(Z.shape[1])})
        print(f"  {nome:8s} peso {w} dim {Z.shape[1]}", flush=True)
    Z = np.concatenate(blocchi, 1)
    Z /= (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)

    rec, _ = E.recall_eval(Z, B, split, S, 20)
    bub, _, _ = E.bubble_eval(Z, B, split, D.mappa(B))
    print(f"ensemble: dim {Z.shape[1]} · own {bub['own']:.4f} · quart {bub['quartiere']:.4f} "
          f"· recall {rec['recall20']:.4f}", flush=True)

    ricetta = hashlib.sha256(json.dumps({"membri": membri}, sort_keys=True).encode()).hexdigest()[:16]
    np.savez_compressed(
        C.DATA / f"{a.nome}.npz",
        Z=Z.astype(np.float16), dim=np.array(Z.shape[1]),
        membri=np.array(json.dumps(modelli)),
        ricetta_sha=np.array(ricetta),
        partizione_sha=np.array(D.sha(C.PARTITION)),
        triangolo_sha=np.array(D.sha(C.TRIANGLE)),
        trama_sha=np.array(D.sha(C.TRAMA, C.DATA)),
        ricetta_ensemble=np.array(a.membri),
    )
    (C.DATA / f"{a.nome}-metrics.json").write_text(json.dumps(
        {"bolla": bub, "recall": rec, "membri": modelli, "dim": int(Z.shape[1])},
        indent=2), encoding="utf-8")
    print("scritto", C.DATA / f"{a.nome}.npz", Z.shape, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
