"""features.py — la costruzione di FX, ESTRATTA da `spazi-trakt.py`, con i vocabolari congelati.

Perche' esiste (ticket 01 di `inserimento`): la collocazione di un titolo nuovo e' una Ridge
`FX -> Cf` addestrata in `cf-edges.py:95`. Il modello non e' salvato, e **nessuno dei vocabolari lo
e'**: sono tagliati sul catalogo con `most_common(N)` / `value_counts().head(N)`, quindi senza di
essi un titolo appena uscito non e' proiettabile.

Qui la costruzione e' la STESSA di `spazi-trakt.py` (righe 117-197), riga per riga. Non va cambiata:
il modello e' addestrato su questa, e cambiarla invalida il refit.

Le 7.934 colonne, nell'ordine:
    [ gerarchia keyword L1+L2+L3 | generi | 5 numeriche +
      lingua(25) | paesi(40) | persone(3000) | collezioni(800) | compagnie(600) |
      sceneggiatori(1500) | lingue parlate(30) | rating R/NC-17/TV-MA | budget, incassi ]

⚠️ L'ordine delle RIGHE e' quello di `cat` (film con movieId MovieLens, poi serie), e coincide con
l'ordine di `spazi-trakt.npz` — cioe' con `canone.titoli()`. Verificato in `01-modello.py`.
"""
import json
import pathlib
from collections import Counter

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix, hstack

ROOT = pathlib.Path(".").resolve()
PQ, ML = ROOT / ".cache" / "tmdb", ROOT / ".cache" / "movielens"

TV2MOVIE = {10759: [28, 12], 10765: [878, 14], 10768: [10752, 36], 10766: [18],
            10762: [10751, 16], 10763: [99], 10764: [99], 10767: [99]}

COL_M = ["id", "title", "keywords", "genres", "vote_count", "vote_average", "runtime",
         "original_language", "production_countries", "cast", "directors", "collection_id",
         "content_rating", "popularity", "release_date", "writers", "budget", "revenue",
         "production_companies", "spoken_languages"]
COL_T = ["id", "name", "keywords", "genres", "vote_count", "vote_average", "runtime",
         "original_language", "production_countries", "cast", "created_by", "content_rating",
         "popularity", "first_air_date", "production_companies", "spoken_languages"]


def jids(s, key="id"):
    if not isinstance(s, str) or not s:
        return []
    try:
        v = json.loads(s)
    except Exception:
        return []
    return [x[key] for x in (v if isinstance(v, list) else []) if isinstance(x, dict) and x.get(key) is not None]


def mapg(s, is_tv):
    out = []
    for g in json.loads(s or "[]"):
        gid = int(g["id"])
        if is_tv and gid in TV2MOVIE:
            out += TV2MOVIE[gid]
        else:
            out.append(gid)
    return out


def carica_catalogo():
    """Il `cat` di `spazi-trakt.py`, nello STESSO ordine: film con movieId, poi serie."""
    links = pd.read_csv(ML / "ml-32m" / "links.csv").dropna(subset=["tmdbId"])
    links = links.astype({"tmdbId": "int64", "movieId": "int64"})
    tmdb2mid = dict(zip(links["tmdbId"], links["movieId"]))
    mv = pd.read_parquet(PQ / "movies.parquet", columns=COL_M)
    tv = pd.read_parquet(PQ / "tv.parquet", columns=COL_T)
    tv = tv.copy()
    tv["writers"] = None
    tv["budget"] = np.nan
    tv["revenue"] = np.nan
    mv2 = mv[mv["id"].map(lambda x: int(x) in tmdb2mid)].copy()
    tv2 = tv.copy()
    mv2["type"], tv2["type"] = "movie", "tv"
    mv2["date"], tv2["date"] = mv2["release_date"], tv2["first_air_date"]
    tv2["directors"], tv2["collection_id"] = tv2["created_by"], np.nan
    cat = pd.concat([mv2, tv2], ignore_index=True)
    cat = cat[cat["keywords"].map(lambda s: isinstance(s, str) and len(json.loads(s)) > 0)]
    return cat.reset_index(drop=True)


def arricchisci(cat):
    """Le colonne derivate, come in `spazi-trakt.py`."""
    cat = cat.copy()
    cat["year"] = pd.to_numeric(cat["date"].astype(str).str[:4], errors="coerce")
    mg = float((cat["vote_average"] * cat["vote_count"]).sum() / max(1, cat["vote_count"].sum()))
    cat["bayes"] = (cat["vote_count"] * cat["vote_average"] + 250.0 * mg) / (cat["vote_count"] + 250.0)
    is_tv = (cat["type"] == "tv").to_numpy()
    cat["kwn"] = cat["keywords"].map(lambda s: [str(k.get("name", "")).strip().lower()
                                                for k in json.loads(s) if isinstance(k, dict)])
    cat["countries"] = cat["production_countries"].map(lambda x: jids(x, "iso_3166_1"))
    cat["people"] = cat.apply(lambda x: jids(x["cast"], "id")[:8] + jids(x["directors"], "id"), axis=1)
    cat["colls"] = cat["collection_id"].map(lambda x: [] if pd.isna(x) else [int(x)])
    cat["gm"] = [mapg(s, t) for s, t in zip(cat["genres"], is_tv)]
    cat["companies"] = cat["production_companies"].map(lambda x: jids(x, "id"))
    cat["writers"] = cat["writers"].map(lambda x: jids(x, "id"))
    cat["spoken"] = cat["spoken_languages"].map(lambda x: jids(x, "iso_639_1"))
    cat["budget_l"] = np.log1p(pd.to_numeric(cat["budget"], errors="coerce").fillna(0)).astype(np.float32)
    cat["revenue_l"] = np.log1p(pd.to_numeric(cat["revenue"], errors="coerce").fillna(0)).astype(np.float32)
    return cat, is_tv


def gerarchia():
    """Le tre mappe keyword -> categoria L1/L2/L3, dal grafo del prodotto."""
    G = json.loads((ROOT / "src" / "data" / "hierarchical_graph.json").read_text(encoding="utf-8"))
    CH = {}
    for nm, c in G["kw_to_L1"].items():
        t_ = (G["L1"].get(c) or {}).get("parent")
        v_ = (G["L2"].get(t_) or {}).get("parent") if t_ else None
        CH[nm] = (c, t_, v_)
    return CH, {k: i for i, k in enumerate(G["L1"])}, {k: i for i, k in enumerate(G["L2"])}, \
        {k: i for i, k in enumerate(G["L3"])}


def costruisci_vocabolari(cat, is_tv):
    """I vocabolari tagliati sul catalogo. Vanno CONGELATI: una categoria nuova non ha colonna."""
    CH, l1, l2, l3 = gerarchia()
    # NB: gli indici dei generi partono da NT, come nell'originale (`gv[gid] = NT + len(gv)`):
    # senza l'offset i generi collidono con le colonne della gerarchia keyword.
    NT0 = len(l1) + len(l2) + len(l3)
    gv = {}
    for gm in cat["gm"]:
        for gid in gm:
            if gid not in gv:
                gv[gid] = NT0 + len(gv)
    voc = {
        "CH": CH, "l1": l1, "l2": l2, "l3": l3, "gv": gv,
        "NT": len(l1) + len(l2) + len(l3),
        "lv": {l: i for i, l in enumerate(cat["original_language"].dropna().value_counts().head(25).index)
               if isinstance(l, str)},
        "cv": {c: i for i, (c, _) in enumerate(Counter(c for l in cat["countries"] for c in l).most_common(40))},
        "pv": {p: i for i, (p, _) in enumerate(Counter(p for l in cat["people"] for p in l).most_common(3000))},
        "clv": {c: i for i, (c, _) in enumerate(Counter(c for l in cat["colls"] for c in l).most_common(800))},
        "cc": {c: i for i, (c, _) in enumerate(Counter(c for l in cat["companies"] for c in l).most_common(600))},
        "wc": {w: i for i, (w, _) in enumerate(Counter(w for l in cat["writers"] for w in l).most_common(1500))},
        "sc": {v: i for i, (v, _) in enumerate(Counter(v for l in cat["spoken"] for v in l).most_common(30))},
    }
    voc["n_col"] = None
    return voc


def _righe_una(riga, voc, numeriche):
    """Le coordinate non-zero di UNA riga di FX. Serve sia al catalogo sia al titolo nuovo.

    L'ordine delle colonne, da `spazi-trakt.py`:
        [ gerarchia keyword | generi ] + [ 5 numeriche ] + [ one-hot 7 blocchi ] + [rating] + [budget, incassi]
    Le 5 numeriche stanno SUBITO dopo keyword+generi: e' il blocco `FB`, e sbagliarne l'offset sposta
    tutto il resto di 5 (l'errore che ha fatto uscire l'indice 7935 su 7934).
    """
    cb, vb = [], []
    NT = voc["NT"]
    NG = len(voc["gv"])
    l1, l2, l3 = voc["l1"], voc["l2"], voc["l3"]
    for n in riga["kwn"]:
        ch = voc["CH"].get(n)
        if not ch:
            continue
        for pos, col, off in ((0, l1, 0), (1, l2, len(l1)), (2, l3, len(l1) + len(l2))):
            if ch[pos] and ch[pos] in col:
                cb.append(off + col[ch[pos]])
                vb.append(1.0)
    for gid in riga["gm"]:
        if gid in voc["gv"]:
            cb.append(voc["gv"][gid])
            vb.append(1.0)
    for k, val in enumerate(numeriche):
        if float(val) != 0.0:          # come csr_matrix(array_denso): gli zeri non esistono
            cb.append(NT + NG + k)
            vb.append(float(val))
    base_oh = NT + NG + 5
    off = {"lv": 0,
           "cv": len(voc["lv"]),
           "pv": len(voc["lv"]) + len(voc["cv"]),
           "clv": len(voc["lv"]) + len(voc["cv"]) + len(voc["pv"]),
           "cc": len(voc["lv"]) + len(voc["cv"]) + len(voc["pv"]) + len(voc["clv"]),
           "wc": len(voc["lv"]) + len(voc["cv"]) + len(voc["pv"]) + len(voc["clv"]) + len(voc["cc"]),
           "sc": len(voc["lv"]) + len(voc["cv"]) + len(voc["pv"]) + len(voc["clv"]) + len(voc["cc"])
                 + len(voc["wc"])}
    for val, chiave in ((riga.get("original_language"), "lv"),
                        *[(c, "cv") for c in riga["countries"]],
                        *[(p, "pv") for p in riga["people"]],
                        *[(c, "clv") for c in riga["colls"]],
                        *[(c, "cc") for c in riga["companies"]],
                        *[(w, "wc") for w in riga["writers"]],
                        *[(v, "sc") for v in riga["spoken"]]):
        i = voc[chiave].get(val)
        if i is None:
            continue
        cb.append(base_oh + off[chiave] + i)
        vb.append(1.0)
    larg_oh = sum(len(voc[k]) for k in ("lv", "cv", "pv", "clv", "cc", "wc", "sc"))
    for scarto, val in ((0, riga.get("_rating", 0.0)), (1, riga.get("_budget", 0.0)),
                        (2, riga.get("_revenue", 0.0))):
        if float(val) != 0.0:
            cb.append(base_oh + larg_oh + scarto)
            vb.append(float(val))
    return cb, vb


def _numeriche(riga):
    y = riga.get("year")
    return [0.0 if pd.isna(y) else (y - 1990) / 30.0,
            np.log1p(riga.get("vote_count") or 0),
            riga.get("bayes") or 0.0,
            0.0 if pd.isna(riga.get("runtime")) else riga["runtime"] / 120.0,
            np.log1p(riga.get("popularity") or 0)]


def _larghezza(voc):
    return (voc["NT"] + len(voc["gv"]) + 5 + 1 + 2
            + len(voc["lv"]) + len(voc["cv"]) + len(voc["pv"]) + len(voc["clv"])
            + len(voc["cc"]) + len(voc["wc"]) + len(voc["sc"]))


def costruisci_fx(cat, voc):
    """La matrice FX del catalogo, con i vocabolari dati."""
    cat, is_tv = arricchisci(cat)
    larg = _larghezza(voc)
    R, C, V = [], [], []
    for i, riga in enumerate(cat.to_dict("records")):
        riga["_rating"] = 1.0 if str(riga.get("content_rating") or "").upper() in ("R", "NC-17", "TV-MA") else 0.0
        riga["_budget"] = float(riga.get("budget_l") or 0.0)
        riga["_revenue"] = float(riga.get("revenue_l") or 0.0)
        cb, vb = _righe_una(riga, voc, _numeriche(riga))
        R.extend([i] * len(cb))
        C.extend(cb)
        V.extend(vb)
    return csr_matrix((np.asarray(V, np.float32), (R, C)), shape=(len(cat), larg)).tocsr(), cat, is_tv
