"""Congela le strutture delle fonti di contenuto, per calcolare la riga di un titolo nuovo.

Per ogni fonte la build fa la stessa cosa: costruisce una matrice titolo×attributo, la pesa, e prende
i top-k simili. Quel lavoro dipende dal corpus intero — quindi non si può rifare per una riga sola.
Ma la matrice **pesata** sì: si calcola una volta, si congela, e poi un titolo nuovo costa un coseno.

Congela cinque fonti: CAST, DIR, PROD, COLL (coseno IDF con shrinkage, come `_idf_cosine`) e TRAMA
(coseno sugli embedding di trama, che non ha bisogno di niente: la matrice è già su disco).

NON congela CREWPROP: dipende da `rrfstudent-v18.npz`, cancellato col ticket 15. Come `RRFST`, non è
ricostruibile — e una fonte che non si può ricalcolare non può essere un ingresso per un titolo nuovo.

  py .scratch/profili-e-identita/congela-fonti.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from services.graph.build import config as C   # noqa: E402
from services.graph.build import data as D    # noqa: E402

OUT = ROOT / ".cache" / "fonti"
TIPI = ("CAST", "DIR", "PROD", "COLL")
PREFISSO = {"CAST": "ca", "DIR": "di", "PROD": "pr", "COLL": "co"}


def leggi(f, cols):
    import pyarrow.parquet as pq
    have = set(pq.ParquetFile(f).schema.names)
    return pd.read_parquet(f, columns=[c for c in cols if c in have])


def insiemi_meta(tipo: str, N: int, row_of: dict) -> list[set[str]]:
    """Identico a `tipi.cmd_meta`: gli stessi attributi, con gli stessi prefissi."""
    mv = leggi(C.TMDB / "movies.parquet",
               ["id", "cast", "directors", "created_by", "production_companies", "collection_id"])
    tvd = leggi(C.TMDB / "tv.parquet",
                ["id", "cast", "directors", "created_by", "production_companies", "collection_id"])
    pref = PREFISSO[tipo]
    out = [set() for _ in range(N)]
    for t, df in (("movie", mv), ("tv", tvd)):
        for row in df.itertuples():
            i = row_of.get(f"{t}:{int(row.id)}")
            if i is None:
                continue
            if tipo == "CAST":
                ids = D._nomi(row.cast)
            elif tipo == "DIR":
                ids = D._nomi(getattr(row, "directors", None)) or D._nomi(getattr(row, "created_by", None))
            elif tipo == "PROD":
                ids = D._nomi(row.production_companies)
            else:
                cid = getattr(row, "collection_id", None)
                cid = int(cid) if (cid is not None and str(cid) not in ("nan", "None")) else 0
                ids = [cid] if (t == "movie" and cid > 0) else []
            for x in ids:
                out[i].add(f"{pref}:{x}")
    return out


def congela(tipo: str, insiemi: list[set[str]], N: int) -> None:
    """IDF + shrinkage L2 esattamente come `tipi._idf_cosine`, ma salvando la matrice pesata."""
    t0 = time.time()
    vocab = {}
    for s in insiemi:
        for x in s:
            vocab[x] = vocab.get(x, 0) + 1
    idx = {x: i for i, x in enumerate(vocab)}
    idf = np.zeros(len(idx), np.float32)
    for x, j in idx.items():
        idf[j] = float(np.log(N / (1 + vocab[x])))
    r_, c_, v_ = [], [], []
    for i, s in enumerate(insiemi):
        for x in s:
            r_.append(i); c_.append(idx[x]); v_.append(float(idf[idx[x]]))
    A = sp.csr_matrix((np.float32(v_), (np.int32(r_), np.int32(c_))), shape=(N, len(idx)))
    q = np.sqrt(np.asarray(A.multiply(A).sum(1)).ravel())
    tau = float(np.median(q[q > 0])) if (q > 0).any() else 1.0
    An = sp.diags(1.0 / (np.sqrt(q ** 2 + tau ** 2) + 1e-9)).dot(A).tocsr()
    sp.save_npz(OUT / f"AN_{tipo}.npz", An)
    (OUT / f"AN_{tipo}.json").write_text(json.dumps({
        "tipo": tipo, "prefisso": PREFISSO[tipo], "N": N, "tau": tau,
        "vocab": idx, "idf": idf.tolist(), "nnz": int(An.nnz),
    }), encoding="utf-8")
    print(f"  {tipo}: {len(idx):,} attributi · {An.nnz:,} coppie · tau {tau:.3f} · "
          f"{time.time()-t0:.0f}s", flush=True)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    B = D.basic()
    N = B["N"]
    row_of = B["row_of"]
    print(f"canone {N:,}", flush=True)
    for tipo in TIPI:
        congela(tipo, insiemi_meta(tipo, N, row_of), N)
    # TRAMA non ha struttura da congelare: la matrice degli embedding è già su disco
    pm = ROOT / "services" / "graph_dense" / "data" / "trama-qwen3b.npy"
    pm_idx = ROOT / "services" / "graph_dense" / "data" / "trama-qwen3b-idx.npy"
    (OUT / "TRAMA.json").write_text(json.dumps({
        "tipo": "TRAMA", "matrice": str(pm.relative_to(ROOT)), "indice": str(pm_idx.relative_to(ROOT)),
    }), encoding="utf-8")
    print("  TRAMA: nessuna struttura da congelare (matrice già su disco)", flush=True)
    print(f"\ncongelate 4 fonti + TRAMA in {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
