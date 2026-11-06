"""La matrice teacher: top-K per riga, peso trasformato, floor row-adaptive, supporto."""
from __future__ import annotations

import json
from collections import Counter

import numpy as np
import scipy.sparse as sp

from . import config as C
from . import data as D

SEEDS = [
    ("Spider-Man (2002)", "movie:557"),
    ("Inkheart (2008)", "movie:2309"),
    ("Un ponte per Terabithia (2007)", "movie:1265"),
    ("Inception (2010)", "movie:27205"),
    ("Perfetti sconosciuti (2016)", "movie:381341"),
    ("Breaking Bad (2008)", "tv:1396"),
]


def build(B, S, holdout_mask=None, topk=C.TOPK, floor_rel=C.FLOOR_REL,
          floor_abs=C.FLOOR_ABS, support_m0=C.SUPPORT_M0, salva=True):
    N = B["N"]
    VOT = np.nan_to_num(B["VOT"], nan=0.0)
    if holdout_mask is not None:
        keep = (~holdout_mask).astype(np.float32)
        S = (sp.diags(keep) @ S @ sp.diags(keep)).tocsr()
        S.eliminate_zeros()
    nbr_idx = np.full((N, topk), -1, dtype=np.int32)
    nbr_w = np.zeros((N, topk), dtype=np.float32)
    rows_p, cols_p, vals_p = [], [], []
    per_row = np.zeros(N, dtype=np.int16)
    for i in range(N):
        lo, hi = S.indptr[i], S.indptr[i + 1]
        if hi <= lo:
            continue
        idx = S.indices[lo:hi]
        val = S.data[lo:hi]
        if len(idx) > topk:
            o = np.argpartition(-val, topk)[:topk]
            idx, val = idx[o], val[o]
        vmin = np.minimum(VOT[i], VOT[idx])
        conf = np.sqrt(vmin / (vmin + support_m0))
        w = np.log1p(val.astype(np.float64)) * conf
        if len(w) == 0:
            continue
        # i titoli con 0 voti (o con vicini tutti a 0) avrebbero conf=0 su ogni arco: in quel caso
        # il supporto non e' informativo e si torna al solo log1p, altrimenti la riga resta vuota.
        if (not np.isfinite(w).all()) or w.max() <= 0:
            w = np.log1p(val.astype(np.float64))
        wmax = float(w.max())
        ok = (w >= floor_rel * wmax) & (w >= floor_abs)
        if not ok.any():
            ok[np.argmax(w)] = True
        idx, w = idx[ok], w[ok]
        o = np.argsort(-w)
        idx, w = idx[o], w[o]
        k = len(idx)
        p = w / max(float(w.sum()), 1e-12)
        nbr_idx[i, :k] = idx
        nbr_w[i, :k] = p.astype(np.float32)
        per_row[i] = k
        rows_p.extend([i] * k)
        cols_p.extend(idx.tolist())
        vals_p.extend(p.astype(np.float32).tolist())
    P = sp.csr_matrix((np.asarray(vals_p, np.float32),
                       (np.asarray(rows_p, np.int32), np.asarray(cols_p, np.int32))),
                      shape=(N, N))
    has_teacher = nbr_idx[:, 0] >= 0
    if holdout_mask is not None:
        has_teacher &= ~holdout_mask
    P_sym = ((P + P.T) * 0.5).tocsr()
    stats = _stats(B, S, nbr_idx, nbr_w, per_row, has_teacher, topk, floor_rel, floor_abs)
    if salva:
        np.savez_compressed(C.DATA / "teacher.npz",
                            nbr_idx=nbr_idx, nbr_w=nbr_w, has_teacher=has_teacher,
                            data=P.data, indices=P.indices, indptr=P.indptr,
                            shape=np.array(P.shape), topk=np.array(topk),
                            floor_rel=np.array(floor_rel), floor_abs=np.array(floor_abs),
                            support_m0=np.array(support_m0))
        (C.DATA / "teacher-stats.json").write_text(json.dumps(stats, indent=2, ensure_ascii=False),
                                                   encoding="utf-8")
    return {"P": P, "P_sym": P_sym, "nbr_idx": nbr_idx, "nbr_w": nbr_w,
            "has_teacher": has_teacher, "stats": stats, "per_row": per_row}


def _stats(B, S, nbr_idx, nbr_w, per_row, has_teacher, topk, floor_rel, floor_abs):
    row_of = B["row_of"]
    bid = B["bid"]
    out = {
        "N": int(B["N"]),
        "archi_teacher": int((nbr_idx >= 0).sum()),
        "nodi_con_teacher": int(has_teacher.sum()),
        "topk": int(topk), "floor_rel": float(floor_rel), "floor_abs": float(floor_abs),
        "per_row": {
            "mediana": float(np.median(per_row[has_teacher])),
            "p10": float(np.percentile(per_row[has_teacher], 10)),
            "p90": float(np.percentile(per_row[has_teacher], 90)),
            "max": int(per_row.max()),
            "0": int((per_row == 0).sum()),
            "1-5": int(((per_row >= 1) & (per_row <= 5)).sum()),
            "6-10": int(((per_row >= 6) & (per_row <= 10)).sum()),
            "11-20": int(((per_row >= 11) & (per_row <= 20)).sum()),
            "21-25": int((per_row >= 21).sum()),
        },
        "seed": {},
    }
    for nome, key in SEEDS:
        i = row_of.get(key)
        if i is None:
            continue
        row = S.getrow(i)
        j674 = int((bid[row.indices] == 674).sum())
        out["seed"][nome] = {
            "riga": int(i),
            "arco_pieno": int(row.nnz),
            "arco_teacher": int(per_row[i]),
            "peso_max_pieno": float(row.data.max()) if row.nnz else 0.0,
            "bolla": int(bid[i]),
            "archi_verso_674_pieno": j674,
        }
    # il ponte Inkheart -> 674: prima e dopo il floor
    i = row_of.get("movie:2309")
    if i is not None:
        row = S.getrow(i)
        m674 = bid[row.indices] == 674
        out["inkheart_674"] = {
            "pieno_archi": int(m674.sum()),
            "pieno_pesi": [round(float(x), 4) for x in row.data[m674][:20]],
            "teacher_archi": int(sum(1 for x in nbr_idx[i] if x >= 0 and bid[x] == 674)),
        }
    return out
