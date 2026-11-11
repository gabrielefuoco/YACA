"""CREWPROP senza vettori: la carriera come camminata sul grafo servito.

L'IDEA. `DIR` e `CAST` collegano solo a chi condivide una persona. La *carriera* invece è: diffondi
dai film delle persone di un titolo, e vedi dove si finisce. Non serve uno spazio di embedding: serve
il grafo, che già esiste ed è congelato.

PERCHÉ UNA CAMMINATA SOLA. Il PPR è lineare nei semi: la somma delle diffusioni dalle filmografie
delle persone è uguale alla diffusione dalla loro unione pesata. Quindi una camminata per titolo, non
una per persona — 76.497 camminate invece di ~100.000, e **una sola** per un titolo nuovo.

Pesi: ruolo (regia > sceneggiatura > cast) × log1p(voti), come la versione a vettori, e la filmografia
di ciascuno tagliata a 150 perché chi ha 300 film non deve dominare.

  py .scratch/profili-e-identita/crewprop-camminata.py [--k 100]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from services.graph import camminata as cam          # noqa: E402
from services.graph.build import config as C        # noqa: E402
from services.graph.build import data as D          # noqa: E402

TRANS = ROOT / "services" / "graph" / "data" / "v45-transizione" / "transizione-pota16.npz"
FATTORE_RUOLO = {"dir": 1.0, "wr": 0.7, "ca": 0.5}
TETTO_FILMOGRAFIA = 150
TETTO_PERSONE = 40


def _ids(x) -> list[tuple[int, str]]:
    """(id, nome) da una cella JSON TMDB."""
    if not isinstance(x, str) or not x.strip():
        return []
    try:
        v = json.loads(x)
    except Exception:
        return []
    out = []
    for e in (v if isinstance(v, list) else []):
        if isinstance(e, dict) and e.get("id") is not None:
            out.append((int(e["id"]), str(e.get("name") or "")))
    return out


def incidenza(N: int, row_of: dict):
    """persona -> (film, ruolo, voti) | come `crewprop.incidenza` ma senza spazio di vettori."""
    per: dict[int, list[tuple[int, str, float]]] = {}
    for f, pre in ((C.TMDB / "movies.parquet", "movie"), (C.TMDB / "tv.parquet", "tv")):
        if not f.is_file():
            continue
        cols = [c for c in ("id", "cast", "directors", "created_by", "writers", "vote_count")
                if c in set(pd.read_parquet(f).columns)]
        d = pd.read_parquet(f, columns=cols)
        for row in d.itertuples(index=False):
            r = row_of.get(f"{pre}:{int(row.id)}")
            if r is None:
                continue
            voti = float(getattr(row, "vote_count", 0) or 0)
            persone = ([("dir", x) for x in _ids(getattr(row, "directors", None))]
                       + [("dir", x) for x in _ids(getattr(row, "created_by", None))]
                       + [("wr", x) for x in _ids(getattr(row, "writers", None))]
                       + [("ca", x) for x in _ids(getattr(row, "cast", None))[:3]])
            for ruolo, (pid, _nome) in persone:
                per.setdefault(pid, []).append((r, ruolo, voti))
    return per


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=100)
    ap.add_argument("--out", default=".cache/fonti/CREWPROP-camminata.npz")
    a = ap.parse_args()

    t0 = time.time()
    B = D.basic(); N = B["N"]; row_of = B["row_of"]
    zt = np.load(TRANS)
    Tr = sp.csr_matrix((zt["data"], zt["indices"], zt["indptr"]), shape=(N, N))
    print(f"grafo servito: {Tr.nnz:,} archi · canone {N:,}", flush=True)

    per = incidenza(N, row_of)
    print(f"persone: {len(per):,} · {time.time()-t0:.0f}s", flush=True)

    # seme per ogni titolo: i film delle sue persone, pesati ruolo × log(voti), sé escluso
    semi: list[dict[int, float]] = [dict() for _ in range(N)]
    for pid, voci in per.items():
        voci = voci[:TETTO_FILMOGRAFIA]
        for r, ruolo, _ in voci:
            w = FATTORE_RUOLO.get(ruolo, 0.5)
            for r2, _, voti2 in voci:
                if r2 == r:
                    continue
                semi[r][r2] = semi[r].get(r2, 0.0) + w * (1.0 + np.log1p(voti2))
    print(f"sei pronti: {time.time()-t0:.0f}s", flush=True)

    righe, colonne, valori = [], [], []
    vuoti = 0
    for r in range(N):
        s = semi[r]
        if not s:
            vuoti += 1
            continue
        idx = np.fromiter(s.keys(), np.int64, len(s))
        pesi = np.fromiter(s.values(), np.float32, len(s))
        pesi = pesi / pesi.sum()
        if len(idx) > TETTO_PERSONE:
            ordine = np.argsort(-pesi)[:TETTO_PERSONE]
            idx, pesi = idx[ordine], pesi[ordine]
            pesi = pesi / pesi.sum()
        v = cam.ppr(Tr, idx, pesi)
        v[idx] = -1.0
        top = np.argpartition(-v, a.k)[:a.k]
        top = top[v[top] > 0]
        righe.append(np.full(len(top), r, np.int32))
        colonne.append(top.astype(np.int32))
        valori.append(v[top].astype(np.float32))
        if r % 5000 == 0:
            print(f"  {r}/{N} ({time.time()-t0:.0f}s)", flush=True)

    M = sp.csr_matrix((np.concatenate(valori), (np.concatenate(righe), np.concatenate(colonne))),
                      shape=(N, N))
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out, indptr=M.indptr.astype(np.int64), indices=M.indices.astype(np.int32),
                        data=M.data.astype(np.float32))
    print(f"\nscritto {out} · {M.nnz:,} archi · grado mediano {int(np.median(np.diff(M.indptr)))} "
          f"· titoli senza semi {vuoti:,} · {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
