"""Caricamento del canone, del triangolo, delle feature e dei Parquet TMDB."""
from __future__ import annotations

import hashlib
import json
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp

from . import config as C


def sha(name: str, base: Path | None = None) -> str:
    p = (base or C.SRC) / name
    if not p.exists():
        return ""
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def basic():
    """Canone e metadati. Le bolle sono OPZIONALI (16/11/2026).

    Fino a ieri questa funzione pretendeva `bolle.json` e la partizione: un canone nuovo senza
    partizione non si poteva nemmeno aprire, e il prodotto del grafo restava prigioniero delle bolle.
    Ora, se la partizione non c'e' o non copre tutte le chiavi (canone esteso in coda), si serve
    `mem = -1` e `bid = -1` con un avviso: chi ha bisogno delle bolle le chiede, chi lavora sul grafo
    titolo-titolo (matrice sparsa) non ne ha piu' bisogno.
    """
    z = np.load(C.SRC / C.SPAZI, allow_pickle=True)
    tmdb, tipo, year, votes = z["tmdb"], z["tipo"], z["year"], z["votes"]
    keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
    titoli = np.array((C.SRC / C.TITOLI).read_text(encoding="utf-8").split("\n"), dtype=object)
    m = np.load(C.SRC / C.META)
    N = len(keys)

    mem = np.full(N, -1, np.int32)
    bid = np.full(N, -1, np.int32)
    b = {}
    pf = C.SRC / C.PARTITION
    if pf.exists():
        p = np.load(pf).astype(np.int32)
        if len(p) == N:
            mem = p
        else:
            print(f"  basic: partizione di {len(p):,} righe su un canone di {N:,} — bolle disattivate"
                  f" (la partizione va rifatta o non serve piu')", flush=True)
    bf = C.SRC / C.BOLLE
    if bf.exists() and (mem >= 0).any():
        b = json.load(open(bf, encoding="latin-1"))
        if isinstance(b.get("titoli"), dict):
            bid = np.array([b["titoli"].get(k, -1) for k in keys], dtype=np.int32)
    sz = np.bincount(mem[mem >= 0]) if (mem >= 0).any() else np.zeros(1, np.int64)
    return {
        "keys": keys, "tipo": np.asarray(tipo), "tmdb": np.asarray(tmdb),
        "year": np.asarray(year), "votes": np.asarray(votes), "titoli": titoli,
        "VOT": m["VOT"].astype(np.float64), "VAVE": m["VAVE"].astype(np.float64),
        "COLL": m["COLL"].astype(np.int64), "DIR": m["DIR"].astype(np.int64),
        "ANNO": m["ANNO"].astype(np.float64), "NEP": m["NEP"].astype(np.float64),
        "POP": m["POP"].astype(np.float64),
        "is_tv": np.asarray(tipo) == "tv", "mem": mem, "bid": bid, "sz": sz,
        "bolle": b, "N": N, "NB": int(mem.max()) + 1 if (mem >= 0).any() else 0,
        "row_of": {k: i for i, k in enumerate(keys)},
    }


def triangle():
    T = np.load(C.SRC / C.TRIANGLE)
    N = int(T["indptr"].shape[0]) - 1
    W = sp.csr_matrix((T["data"], T["indices"], T["indptr"]), shape=(N, N)).astype(np.float32)
    S = (W + W.T).tocsr()
    S.setdiag(0)
    S.eliminate_zeros()
    return S


def mappa(basic_d):
    M = np.load(C.SRC / C.MAPPA, allow_pickle=True)
    NB = basic_d["NB"]
    W = sp.csr_matrix((M["grafo_data"], M["grafo_indices"], M["grafo_indptr"]), shape=(NB, NB))
    return [set(int(x) for x in W.getrow(b).indices) for b in range(NB)]


def plot_presence(basic_d):
    """True per i titoli con una overview non vuota (i 35.829 della trama)."""
    out = np.zeros(basic_d["N"], dtype=bool)
    row_of = basic_d["row_of"]
    for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        p = C.TMDB / f
        if not p.exists():
            continue
        d = pd.read_parquet(p, columns=["id", "overview"])
        for i, ov in zip(d["id"], d["overview"]):
            r = row_of.get(f"{tipo}:{int(i)}")
            if r is not None and isinstance(ov, str) and ov.strip():
                out[r] = True
    return out


def plot_embedding(basic_d):
    """Ritorna (X_plot | None, has_plot_embedding | None, idx)."""
    f = C.DATA / C.TRAMA
    if not f.exists():
        return None, None, None
    E = np.load(f).astype(np.float32)
    N = basic_d["N"]
    idxf = C.DATA / C.TRAMA_IDX
    idx = np.load(idxf).astype(np.int32) if idxf.exists() else np.arange(E.shape[0], dtype=np.int32)
    if E.shape[0] == N:
        X = E
    else:
        X = np.zeros((N, E.shape[1]), dtype=np.float32)
        X[idx] = E
    X /= (np.linalg.norm(X, axis=1, keepdims=True) + 1e-9)
    has = np.zeros(N, dtype=bool)
    has[idx] = True
    return X, has, idx


def tfidf():
    return sp.load_npz(C.SRC / C.TFIDF).tocsr().astype(np.float32)


def vocab():
    return json.load(open(C.SRC / C.VOCAB, encoding="utf-8"))


def _nomi(x):
    """Lista JSON di dict TMDB -> nomi minuscoli (writers, networks)."""
    if not isinstance(x, str) or not x.strip():
        return []
    try:
        v = json.loads(x)
    except Exception:
        return []
    out = []
    for e in (v if isinstance(v, list) else []):
        n = e.get("name") if isinstance(e, dict) else (e if isinstance(e, str) else None)
        if isinstance(n, str) and n.strip():
            out.append(n.strip().lower())
    return out


PESI_EXTRA = {"cl:": 1.0, "wr:": 0.7, "lg:": 0.8, "cr:": 0.6, "du:": 0.4, "se:": 0.4,
              "de:": 0.4, "pg:": 0.6}


def _durata(rt):
    for k, lim in enumerate((80, 100, 120, 150, 180)):
        if rt < lim:
            return k
    return 5


def extra_features(basic_d):
    """Blocchi che il vocabolario 05 non ha: collection, writers, lingua, rating, durata, stagioni.

    Il vocabolario del vecchio modulo ha cast, registi, generi, keyword, case, paesi, reti TV; NON
    ha la collection (franchise), gli sceneggiatori, la lingua originale, il rating, la durata.
    Per i film in franchise la collection pesa la meta' del peso dei vicini top-20 del grafo.
    Token rari (df < 3) si buttano; ogni riga e' L2-normalizzata (come gli altri blocchi).
    """
    N = basic_d["N"]
    row_of = basic_d["row_of"]
    per = [[] for _ in range(N)]
    for tipo, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
        p = C.TMDB / f
        if not p.exists():
            continue
        cols = ["id", "original_language", "content_rating", "runtime",
                "production_countries", "genres"]
        if tipo == "movie":
            cols += ["collection_id", "writers", "release_date"]
        else:
            cols += ["number_of_seasons", "first_air_date"]
        d = pd.read_parquet(p, columns=cols)
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
            data_s = getattr(r, "release_date", None) if tipo == "movie" else getattr(r, "first_air_date", None)
            anno = 0
            if isinstance(data_s, str) and len(data_s) >= 4 and data_s[:4].isdigit():
                anno = int(data_s[:4])
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
    from collections import Counter
    df = Counter(tok for toks in per for tok in set(toks))
    tieni = sorted(t for t, c in df.items() if c >= 3 or t[:3] in ("lg:", "cr:", "du:", "se:"))
    col = {t: j for j, t in enumerate(tieni)}
    pesi = np.array([PESI_EXTRA[t[:3]] for t in tieni], np.float32)
    rows, cols = [], []
    for i, toks in enumerate(per):
        for t in set(toks):
            j = col.get(t)
            if j is not None:
                rows.append(i); cols.append(j)
    M = sp.csr_matrix((pesi[np.array(cols, dtype=np.int64)] if rows else np.zeros(0, np.float32),
                       (rows, cols)), shape=(N, len(tieni)), dtype=np.float32)
    n = np.sqrt(np.asarray(M.multiply(M).sum(1)).ravel()) + 1e-9
    M = sp.diags(1.0 / n) @ M
    print(f"extra: {len(tieni):,} token · {M.nnz:,} nonzero · "
          f"collectio {sum(1 for t in tieni if t.startswith('cl:')):,}", flush=True)
    return M.tocsr().astype(np.float32)


def features(basic_d, extra=False):
    """X_meta = TF-IDF V3 + cluster L1/L2/L3 + strutturali sicure. Niente voti/popolarità."""
    X = tfidf()
    V = vocab()
    blocchi = [X]
    hg = C.ROOT / "src" / "data" / "hierarchical_graph.json"
    if hg.exists():
        G = json.loads(hg.read_text(encoding="utf-8"))
        l1 = {k: i for i, k in enumerate(G.get("L1", {}))}
        l2 = {k: i for i, k in enumerate(G.get("L2", {}))}
        l3 = {k: i for i, k in enumerate(G.get("L3", {}))}
        n1, n2, n3 = len(l1), len(l2), len(l3)
        rows, cols = [], []
        for tok, col in V.items():
            if not tok.startswith("kw:"):
                continue
            name = tok[3:]
            c1 = G.get("kw_to_L1", {}).get(name)
            if not c1 or c1 not in l1:
                continue
            rows.append(col); cols.append(l1[c1])
            c2 = (G["L1"].get(c1) or {}).get("parent")
            if c2 and c2 in l2:
                rows.append(col); cols.append(n1 + l2[c2])
                c3 = (G["L2"].get(c2) or {}).get("parent")
                if c3 and c3 in l3:
                    rows.append(col); cols.append(n1 + n2 + l3[c3])
        if rows:
            P = sp.csr_matrix((np.ones(len(rows), np.float32), (rows, cols)),
                              shape=(X.shape[1], n1 + n2 + n3))
            H = (X > 0).astype(np.float32) @ P
            H.data = np.log1p(H.data)
            H = sp.diags(1.0 / (np.sqrt(np.asarray(H.multiply(H).sum(1)).ravel()) + 1e-9)) @ H
            blocchi.append(H.tocsr().astype(np.float32))
    anno = basic_d["ANNO"]
    nep = basic_d["NEP"]
    anno_n = np.where(anno > 1900, np.clip((anno - 1990.0) / 35.0, -2.5, 1.5), 0.0)
    nep_n = np.log1p(np.maximum(nep - 1.0, 0.0)) / 6.0
    st = np.column_stack([basic_d["is_tv"], ~basic_d["is_tv"], anno_n, nep_n]).astype(np.float32) * 0.25
    blocchi.append(sp.csr_matrix(st))
    if extra:
        Xe = extra_features(basic_d)
        if Xe is not None and Xe.shape[1]:
            blocchi.append(Xe)
    Xm = sp.hstack(blocchi, format="csr", dtype=np.float32)
    return Xm


def parquet_rows(keys):
    """I metadati grezzi TMDB per le chiavi richieste (per collocatore/test)."""
    row_of = {k: i for i, k in enumerate(keys)}
    out = {}
    for tipo, f, cols in (
        ("movie", "movies.parquet", ["id", "title", "title_en", "keywords", "genres", "cast",
                                     "directors", "production_companies", "production_countries",
                                     "original_language", "vote_count", "overview", "runtime",
                                     "release_date"]),
        ("tv", "tv.parquet", ["id", "name", "name_en", "keywords", "genres", "cast", "created_by",
                              "production_companies", "production_countries", "original_language",
                              "vote_count", "overview", "runtime", "first_air_date", "networks",
                              "number_of_seasons", "number_of_episodes"]),
    ):
        p = C.TMDB / f
        if not p.exists():
            continue
        d = pd.read_parquet(p, columns=cols)
        for r in d.itertuples(index=False):
            key = f"{tipo}:{int(r.id)}"
            if key not in row_of:
                continue
            dd = {c: getattr(r, c) for c in cols if c != "id"}
            dd["tipo"] = tipo
            dd["id"] = int(r.id)
            if tipo == "tv":
                dd["directors"] = dd.get("created_by")
            out[key] = dd
    return out


def masked_yc_and_graph():
    """S del grafo con gli archi del Set B azzerati (5 vicini GT per film), se esiste yc-split.npz."""
    S = triangle().tolil(copy=True)
    p = C.DATA / "yc-split.npz"
    if p.exists():
        z = np.load(p)
        gt, mask = z["gt"], z["mask"]
        for i in z["B_"]:
            i = int(i)
            for j in gt[i][mask[i] >= 0]:
                S[i, int(j)] = 0.0
                S[int(j), i] = 0.0
    return S.tocsr()
