"""Costruisce l'artefatto denso con le impronte. Non tocca `services/graph/`."""
from __future__ import annotations

import argparse
import hashlib
import json

import numpy as np

from . import config as C
from . import data as D


def recipe_sha():
    d = {k: getattr(C, k) for k in (
        "TOPK", "FLOOR_REL", "FLOOR_ABS", "SUPPORT_M0", "DIM", "HIDDEN", "DROP",
        "MODALITY_DROP", "FEATURE_DROP", "BATCH", "EPOCHS", "LR", "WD", "TAU",
        "TAU_BOLLA", "LAMBDA_SVD", "LAMBDA_BOLLA", "TV_WEIGHT", "RIDGE_ALPHA", "SEED")}
    return hashlib.sha256(json.dumps(d, sort_keys=True).encode()).hexdigest()[:16]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--nome", default="a8")
    a = ap.parse_args(argv)
    src = np.load(C.DATA / f"{a.nome}.npz")
    Z = src["Z"].astype(np.float16)
    mu = src["mu"].astype(np.float16) if "mu" in src else np.zeros((2, Z.shape[1]), np.float16)
    proto = src["proto"].astype(np.float16) if "proto" in src else np.zeros((0, Z.shape[1]), np.float16)
    hg = C.ROOT / "src" / "data" / "hierarchical_graph.json"
    kw_sha = hashlib.sha256(hg.read_bytes()).hexdigest()[:16] if hg.exists() else ""
    trama = C.DATA / C.TRAMA
    np.savez_compressed(
        C.DATA / "spazio-denso-v10.npz",
        Z=Z, mu=mu, proto=proto, dim=np.array(Z.shape[1]),
        partizione_sha=np.array(D.sha(C.PARTITION)),
        triangolo_sha=np.array(D.sha(C.TRIANGLE)),
        tfidf_sha=np.array(D.sha(C.TFIDF)),
        vocab_sha=np.array(D.sha(C.VOCAB)),
        keyword_sha=np.array(kw_sha),
        trama_sha=np.array(D.sha(C.TRAMA, C.DATA) if trama.exists() else ""),
        teacher_sha=np.array(D.sha("teacher.npz", C.DATA)),
        split_sha=np.array(D.sha("split.npz", C.DATA)),
        kwset_sha=np.array(D.sha("kw-set.npz", C.DATA) if (C.DATA / "kw-set.npz").exists() else ""),
        ricetta_sha=np.array(recipe_sha()),
        modello=np.array(a.nome),
    )
    print("scritto", C.DATA / "spazio-denso-v10.npz", Z.shape, Z.dtype)
    print("ricetta", recipe_sha(), "· trama", "sì" if trama.exists() else "no")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
