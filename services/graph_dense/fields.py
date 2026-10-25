"""Mappa campo -> colonne di X_meta, per il FieldStudent (embedding per campo).

X_meta = [TF-IDF vocab | cluster gerarchici H | 4 strutturali | extra]. I campi sono i prefissi
dei token (ca, co, di, ge, pa, rt, lg, cr, du, de, cl, wr, se, pg), piu' 'hc' (cluster), 'st'
(strutturali), 'misc'. Serve a dare a ogni campo il suo vettore, senza che il cast affoghi
la casa di produzione o la collection.
"""
from __future__ import annotations

import json
from collections import Counter

import numpy as np
import pandas as pd

from . import config as C
from . import data as D
from .data import _durata, _nomi

FIELDS = ["ca", "co", "di", "ge", "pa", "rt", "hc", "st",
          "lg", "cr", "du", "de", "cl", "wr", "se", "pg", "misc"]


def extra_tokens(B):
    """Ricostruisce la lista `tieni` di data.extra_features (stessa logica, stesso ordine)."""
    row_of = B["row_of"]
    per = [[] for _ in range(B["N"])]
    for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        cols = ["id", "original_language", "content_rating", "runtime",
                "production_countries", "genres"]
        cols += (["collection_id", "writers", "release_date"] if tipo == "movie"
                 else ["number_of_seasons", "first_air_date"])
        d = pd.read_parquet(C.TMDB / f, columns=cols)
        for r in d.itertuples(index=False):
            i = row_of.get(f"{tipo}:{int(r.id)}")
            if i is None:
                continue
            t = per[i]
            lg = r.original_language
            if isinstance(lg, str) and lg.strip():
                t.append(f"lg:{lg.strip().lower()}")
            cr = r.content_rating
            if isinstance(cr, str) and cr.strip():
                t.append(f"cr:{cr.strip().lower()}")
            rt = r.runtime
            if isinstance(rt, (int, float)) and rt == rt and 10 <= rt <= 400:
                t.append(f"du:{_durata(rt)}")
            ds = getattr(r, "release_date", None) if tipo == "movie" else getattr(r, "first_air_date", None)
            anno = int(ds[:4]) if isinstance(ds, str) and len(ds) >= 4 and ds[:4].isdigit() else 0
            if anno > 1880:
                dec = anno // 10 * 10
                t.append(f"de:{dec}")
                paesi = [c.strip().upper() for c in _nomi(r.production_countries)]
                fuori = [c for c in paesi if c not in ("US", "GB")]
                if fuori and C.EXTRA_PG:
                    for g in _nomi(r.genres)[:4]:
                        t.append(f"pg:{fuori[0]}|{dec}|{g}")
            if tipo == "movie":
                cid = getattr(r, "collection_id", None)
                if isinstance(cid, (int, float)) and cid == cid:
                    t.append(f"cl:{int(cid)}")
                for w in _nomi(r.writers):
                    t.append(f"wr:{w}")
            else:
                se = getattr(r, "number_of_seasons", None)
                if isinstance(se, (int, float)) and se == se and se >= 1:
                    t.append(f"se:{min(int(se), 5)}")
    df = Counter(tok for toks in per for tok in set(toks))
    return sorted(t for t, c in df.items() if c >= 3 or t[:3] in ("lg:", "cr:", "du:", "se:"))


def field_ids(B, keep=None):
    """Array (n_colonne di X_meta) con l'id del campo per ogni colonna."""
    V = D.vocab()
    W = max(V.values()) + 1
    G = json.loads((C.ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
    nH = len(G.get("L1", {})) + len(G.get("L2", {})) + len(G.get("L3", {}))
    tieni = extra_tokens(B)
    n = W + nH + 4 + len(tieni)
    ids = np.full(n, FIELDS.index("misc"), dtype=np.int64)
    inv = {c: t for t, c in V.items()}
    for c in range(W):
        p = inv.get(c, "misc")[:2]
        ids[c] = FIELDS.index(p) if p in FIELDS else FIELDS.index("misc")
    ids[W:W + nH] = FIELDS.index("hc")
    ids[W + nH:W + nH + 4] = FIELDS.index("st")
    off = W + nH + 4
    for j, t in enumerate(tieni):
        p = t[:2]
        ids[off + j] = FIELDS.index(p) if p in FIELDS else FIELDS.index("misc")
    return (ids[keep] if keep is not None else ids), FIELDS
