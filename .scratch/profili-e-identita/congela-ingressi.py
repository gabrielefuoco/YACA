"""Congela la RICETTA DEGL'INGRESSI dello studente, per poter calcolare la riga di un titolo nuovo.

Lo studente mangia tre blocchi: trama (1.024), keyword proiettate (512) e feature meta. Per un titolo
che non è nel canone quei blocchi vanno costruiti **con lo stesso vocabolario, gli stessi idf, la
stessa proiezione casuale e lo stesso ordine di colonne** del canone. Niente di tutto ciò è un
artefatto su disco: il vocabolario extra vive solo in memoria durante la build.

Questo script lo scrive una volta in `.cache/ingressi/`, e da lì `colloca-titolo.py` può calcolare
qualunque riga. Tutto è deterministico: si può rigenerare in un minuto.

  py .scratch/profili-e-identita/congela-ingressi.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from services.graph.build import config as C          # noqa: E402
from services.graph.build import data as D           # noqa: E402
from services.graph import parametri as P           # noqa: E402

OUT = ROOT / ".cache" / "ingressi"


def main() -> int:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    B = D.basic()
    N = B["N"]
    print(f"canone {N:,}", flush=True)

    V = D.vocab()                                    # token -> colonna (05-vocab.json)
    idf = np.load(C.SRC / C.IDF).astype(np.float32)   # 05-idf.npy
    pesi_token = dict(P.PESI_TOKEN)

    # 1. proiezione gerarchica: colonna keyword -> cluster L1/L2/L3 (identica a `features()`)
    G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
    l1 = {k: i for i, k in enumerate(G.get("L1", {}))}
    l2 = {k: i for i, k in enumerate(G.get("L2", {}))}
    l3 = {k: i for i, k in enumerate(G.get("L3", {}))}
    n1, n2, n3 = len(l1), len(l2), len(l3)
    rows, cols = [], []
    for tok, col in V.items():
        if not tok.startswith("kw:"):
            continue
        c1 = G.get("kw_to_L1", {}).get(tok[3:])
        if not c1 or c1 not in l1:
            continue
        rows.append(col); cols.append(l1[c1])
        c2 = (G["L1"].get(c1) or {}).get("parent")
        if c2 and c2 in l2:
            rows.append(col); cols.append(n1 + l2[c2])
            c3 = (G["L2"].get(c2) or {}).get("parent")
            if c3 and c3 in l3:
                rows.append(col); cols.append(n1 + n2 + l3[c3])
    PH = sp.csr_matrix((np.ones(len(rows), np.float32), (rows, cols)), shape=(len(V), n1 + n2 + n3))
    print(f"gerarchia: {PH.shape} · cluster L1/L2/L3 {n1}/{n2}/{n3}", flush=True)

    # 2. vocabolario dei token extra (collection, sceneggiatori, lingua, durata, decennio...)
    _, extra = D.extra_features(B, con_vocabolario=True)
    print(f"extra: {len(extra['token']):,} token", flush=True)

    # 3. blocchi congelati (trama proiettata, keep, colonne keyword, proiezione casuale)
    zbl = np.load(ROOT / "services" / "graph_dense" / "data" / "blocks.npz")
    keep = zbl["keep"]
    kwcols = zbl["kwcols"]
    KPROJ = int(zbl["KPROJ"])
    SEED = int(zbl["SEED"])

    np.savez_compressed(
        OUT / "ricetta.npz",
        idf=idf,
        keep=keep,
        kwcols=kwcols,
        PH_indptr=PH.indptr, PH_indices=PH.indices, PH_data=PH.data, PH_shape=np.array(PH.shape),
        dim_meta=np.array([len(V) + PH.shape[1] + 4]),
    )
    (OUT / "ricetta.json").write_text(json.dumps({
        "N": N, "vocab": V, "pesi_token": pesi_token,
        "extra_token": extra["token"], "extra_pesi": extra["pesi"],
        "KPROJ": KPROJ, "SEED": SEED, "n_cluster": [n1, n2, n3],
        "n_vocab": len(V), "n_tenute": int(keep.sum()),
    }, ensure_ascii=False), encoding="utf-8")
    print(f"scritto {OUT}/ricetta.npz + ricetta.json · {time.time()-t0:.0f}s", flush=True)
    print(f"meta: {len(V):,} tf-idf + {PH.shape[1]:,} cluster + 4 strutturali + "
          f"{len(extra['token']):,} extra · tenute {int(keep.sum()):,} colonne", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
