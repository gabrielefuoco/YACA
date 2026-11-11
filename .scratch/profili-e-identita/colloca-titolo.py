"""Colloca un titolo nel grafo: dato un id TMDB, produce la sua riga.

La catena, per un titolo che il grafo non ha:

    metadati TMDB → trama (Qwen3) + blocco keyword + feature meta
                  → ENCODER (forma B) → Z → top-16 → LA RIGA

`--verifica` fa il giro di controllo su un titolo CHE È nel canone: ricostruisce i suoi ingressi dai
metadati e li confronta con quelli congelati. Se non tornano, il collocatore sta guardando uno spazio
diverso da quello dello studente, e nessun numero a valle avrebbe senso.

  py .scratch/profili-e-identita/colloca-titolo.py --key movie:603 --verifica
  py .scratch/profili-e-identita/colloca-titolo.py --key movie:1751701
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from services.graph.build import config as C   # noqa: E402
from services.graph.build import data as D    # noqa: E402

ING = ROOT / ".cache" / "ingressi"
V45 = ROOT / "services" / "graph" / "data" / "v45"
STUDENTE = ROOT / ".cache" / "studente-B-colloca"
TOP = 16


# ── ingressi: token come li costruisce la build (tfidf-v2.py + extra_features) ────────────────────
PREF = {"keywords": "kw:", "genres": "ge:", "networks": "rt:", "production_companies": "co:",
        "production_countries": "pa:", "original_language": "lg:",
        "cast": "ca:", "directors": "di:", "created_by": "di:"}


def _leggi(s):
    try:
        v = json.loads(s) if isinstance(s, str) else (s or [])
        return [x for x in v if isinstance(x, (dict, str))]
    except Exception:
        return []


def _nome(x):
    return x if isinstance(x, str) else str(x.get("name") or x.get("iso_3166_1") or "")


def meta_tmdb(chiave: str) -> dict:
    tipo, tid = chiave.split(":")
    tid = int(tid)
    f = C.TMDB / ("movies.parquet" if tipo == "movie" else "tv.parquet")
    if f.is_file():
        d = pd.read_parquet(f)
        riga = d[d["id"].astype(np.int64) == tid]
        if len(riga):
            return riga.iloc[0].to_dict() | {"_tipo": tipo}
    # fuori dalla cache: TMDB, se c'è la chiave
    import urllib.request
    chiave_api = None
    for env in (ROOT / ".env", ROOT / "secrets.env"):
        if env.is_file():
            for line in env.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.strip().startswith("TMDB_API_KEY="):
                    chiave_api = line.split("=", 1)[1].strip()
    if not chiave_api:
        raise SystemExit(f"{chiave} non è nella cache TMDB e manca TMDB_API_KEY")
    via = "movie" if tipo == "movie" else "tv"
    url = f"https://api.themoviedb.org/3/{via}/{tid}?api_key={chiave_api}&language=en-US&append_to_response=keywords,credits"
    with urllib.request.urlopen(url, timeout=30) as r:
        j = json.load(r)
    return {
        "id": tid, "_tipo": tipo, "title": j.get("title") or j.get("name"),
        "overview": j.get("overview") or "", "release_date": j.get("release_date") or j.get("first_air_date"),
        "runtime": j.get("runtime"), "original_language": j.get("original_language"),
        "genres": json.dumps(j.get("genres") or []),
        "keywords": json.dumps((j.get("keywords") or {}).get("keywords") or []),
        "cast": json.dumps(((j.get("credits") or {}).get("cast") or [])[:10]),
        "directors": json.dumps([c for c in ((j.get("credits") or {}).get("crew") or [])
                                 if c.get("job") == "Director"]),
        "created_by": json.dumps(j.get("created_by") or []),
        "production_companies": json.dumps(j.get("production_companies") or []),
        "production_countries": json.dumps(j.get("production_countries") or []),
        "networks": json.dumps(j.get("networks") or []),
        "collection_id": (j.get("belongs_to_collection") or {}).get("id"),
        "writers": json.dumps([c for c in ((j.get("credits") or {}).get("crew") or [])
                               if c.get("job") in ("Writer", "Screenplay")]),
        "content_rating": None, "number_of_seasons": j.get("number_of_seasons"),
        "number_of_episodes": j.get("number_of_episodes"),
    }


def token_tfidf(meta: dict) -> set[str]:
    """I token del blocco 05, con la stessa ricetta: cast ai primi 10, paesi in maiuscolo."""
    tipo = meta["_tipo"]
    out = set()
    for col, pre in PREF.items():
        if tipo == "movie" and col in ("networks", "created_by"):
            continue
        if tipo == "tv" and col == "directors":
            continue
        v = _leggi(meta.get(col))
        if col == "cast":
            v = v[:10]
        for x in v:
            t = _nome(x).strip()
            t = t.upper() if col == "production_countries" else t.lower()
            if t and len(t) > 1:
                out.add(pre + t)
    return out


def _nomi_min(x) -> list[str]:
    """Come `data._nomi`: lista JSON di dict TMDB → nomi **minuscoli**. Il blocco extra li vuole così,
    mentre il blocco 05 non abbassa il caso: due ricette diverse, e sbagliarne una costa uno 0,38 di
    differenza sulla riga meta (misurato)."""
    if isinstance(x, str):
        try:
            v = json.loads(x)
        except Exception:
            return []
    else:
        v = x if isinstance(x, list) else ([] if x is None else [x])
    out = []
    for e in (v if isinstance(v, list) else []):
        n = e.get("name") if isinstance(e, dict) else (e if isinstance(e, str) else None)
        if isinstance(n, str) and n.strip():
            out.append(n.strip().lower())
    return out


def token_extra(meta: dict) -> set[str]:
    """I token del blocco extra (collection, sceneggiatori, lingua, durata, decennio, stagioni)."""
    out = set()
    lg = meta.get("original_language")
    if isinstance(lg, str) and lg.strip():
        out.add(f"lg:{lg.strip().lower()}")
    cr = meta.get("content_rating")
    if isinstance(cr, str) and cr.strip():
        out.add(f"cr:{cr.strip().lower()}")
    rt = meta.get("runtime")
    if isinstance(rt, (int, float)) and rt == rt and 10 <= rt <= 400:
        out.add(f"du:{D._durata(rt)}")
    # le serie hanno `first_air_date`, i film `release_date`: è la stessa trappola che il blocco 05
    # evita per costruzione (la sua COLS è diversa per tipo)
    data_s = meta.get("release_date") if meta["_tipo"] == "movie" else meta.get("first_air_date")
    anno = int(str(data_s)[:4]) if isinstance(data_s, str) and len(str(data_s)) >= 4 and str(data_s)[:4].isdigit() else 0
    if anno > 1880:
        dec = anno // 10 * 10
        out.add(f"de:{dec}")
        paesi = [p.strip().upper() for p in _nomi_min(meta.get("production_countries"))]
        fuori = [pais for pais in paesi if pais not in ("US", "GB")]
        if fuori and C.EXTRA_PG:
            for g in _nomi_min(meta.get("genres"))[:4]:
                out.add(f"pg:{fuori[0]}|{dec}|{g}")
    if meta["_tipo"] == "movie":
        cid = meta.get("collection_id")
        if isinstance(cid, (int, float)) and cid == cid and cid == cid:
            out.add(f"cl:{int(cid)}")
        for w in _nomi_min(meta.get("writers")):
            out.add(f"wr:{w}")
    else:
        se = meta.get("number_of_seasons")
        if isinstance(se, (int, float)) and se == se and se >= 1:
            out.add(f"se:{min(int(se), 5)}")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", required=True, help="movie:<tmdbId> oppure tv:<tmdbId>")
    ap.add_argument("--verifica", action="store_true", help="confronta gl'ingressi con quelli congelati")
    ap.add_argument("--studente", default=str(STUDENTE), help="prefisso di .npz/.pt/.config.json")
    ap.add_argument("--out", default=".cache/collocazione.json")
    a = ap.parse_args()

    ric = json.loads((ING / "ricetta.json").read_text(encoding="utf-8"))
    zr = np.load(ING / "ricetta.npz")
    V, idf, keep, kwcols = ric["vocab"], zr["idf"], zr["keep"], zr["kwcols"]
    PH = sp.csr_matrix((zr["PH_data"], zr["PH_indices"], zr["PH_indptr"]), shape=tuple(zr["PH_shape"]))
    meta = meta_tmdb(a.key)
    print(f"{a.key} · «{meta.get('title')}» · {meta.get('release_date')}", flush=True)

    # 1. blocco tf-idf: stesso vocabolario, stessi idf, stessi pesi per prefisso
    pesi = ric["pesi_token"]
    indici, valori = [], []
    for t in token_tfidf(meta):
        j = V.get(t)
        if j is None:
            continue                      # token fuori vocabolario: a build finita non esiste
        indici.append(j); valori.append(float(idf[j]) * float(pesi.get(t[:3], 1.0)))
    nrm = np.sqrt(np.sum(np.square(valori))) + 1e-9
    X_tfidf = np.zeros(len(V), np.float32)
    X_tfidf[indici] = np.asarray(valori, np.float32) / nrm

    # 2. proiezione gerarchica (uguale a features(): presenza>0 → cluster, log1p, L2)
    H = X_tfidf[(X_tfidf > 0)]
    Hv = np.zeros(PH.shape[1], np.float32)
    for j in np.flatnonzero(X_tfidf > 0):
        lo, hi = PH.indptr[j], PH.indptr[j + 1]
        Hv[PH.indices[lo:hi]] += 1.0
    Hv = np.log1p(Hv)
    Hv /= (np.linalg.norm(Hv) + 1e-9)

    # 3. strutturali (identici a features(): × 0.25)
    anno = 0
    # stessa trappola del blocco extra: le serie hanno `first_air_date`
    ds = str((meta.get("release_date") if meta["_tipo"] == "movie" else meta.get("first_air_date")) or "")
    if len(ds) >= 4 and ds[:4].isdigit():
        anno = int(ds[:4])
    nep = float(meta.get("number_of_episodes") or 1.0)
    is_tv = 1.0 if meta["_tipo"] == "tv" else 0.0
    anno_n = float(np.clip((anno - 1990.0) / 35.0, -2.5, 1.5)) if anno > 1900 else 0.0
    nep_n = float(np.log1p(max(nep - 1.0, 0.0)) / 6.0)
    st = np.asarray([is_tv, 1.0 - is_tv, anno_n, nep_n], np.float32) * 0.25

    # 4. blocco extra (token → colonne congelate, pesi, L2)
    col_extra = {t: i for i, t in enumerate(ric["extra_token"])}
    pesi_extra = np.asarray(ric["extra_pesi"], np.float32)
    E = np.zeros(len(col_extra), np.float32)
    ignoti = 0
    for t in token_extra(meta):
        j = col_extra.get(t)
        if j is None:
            ignoti += 1
            continue
        E[j] = pesi_extra[j]
    E /= (np.linalg.norm(E) + 1e-9)

    X_meta = np.concatenate([X_tfidf, Hv, st, E])[keep]
    print(f"  meta: {int((X_meta != 0).sum()):,} colonne attive · token extra ignorati {ignoti}", flush=True)

    # 5. trama: dal canone se c'è (identica), altrimenti la si calcola
    chiave = a.key
    riga_canone = None
    zsp = np.load(ROOT / "services" / "graph" / "data" / "spazi-trakt.npz", allow_pickle=True)
    keys = [f"{t}:{int(i)}" for t, i in zip(zsp["tipo"], zsp["tmdb"])]
    row_of = {k: i for i, k in enumerate(keys)}
    riga_canone = row_of.get(chiave)
    p_emb = ROOT / "services" / "graph_dense" / "data" / "trama-qwen3b.npy"
    Xp, has, idxp = D.plot_embedding({"N": len(keys)})
    if riga_canone is not None and has[riga_canone]:
        bp = Xp[riga_canone]
        print("  trama: presa dal canone (identica)", flush=True)
    else:
        bp = encoder_trama(meta)
        print("  trama: calcolata ora", flush=True)

    # 6. verifica gl'ingressi contro quelli congelati
    if a.verifica and riga_canone is not None:
        zbl = np.load(ROOT / "services" / "graph_dense" / "data" / "blocks.npz")
        X_true = D.features(D.basic(), extra=True)[riga_canone][:, keep].toarray().ravel()
        d_meta = float(np.abs(X_meta - X_true).max())
        d_bp = float(np.abs(bp - zbl["Bp"][riga_canone].astype(np.float32)).max())
        print(f"  VERIFICA · meta: differenza massima {d_meta:.2e} · trama {d_bp:.2e}", flush=True)

    # 7. lo studente: forward e top-16
    if not Path(a.studente + ".config.json").is_file():
        if a.verifica:
            print("  (modello non ancora addestrato: la verifica degl'ingressi è fatta, salto il forward)")
            return 0
        raise SystemExit(f"manca {a.studente}.config.json: addestra prima lo studente")
    cfg = json.loads(Path(a.studente + ".config.json").read_text(encoding="utf-8"))
    if cfg["forma"] == "B":
        raise SystemExit(
            "forma B: servono anche le sette righe delle fonti di contenuto. Per un titolo del canone "
            "stanno in v45/tipi2-pesi; per uno nuovo vanno calcolate — è il passo che manca (ticket 21, "
            "seconda metà). Usa lo studente forma A per la prova di oggi."
        )
    from services.graph_dense.train_b1 import BlockStudent
    modelo = BlockStudent(cfg["n_meta"], d_meta=cfg["dim"])
    modelo.load_state_dict(torch.load(a.studente + ".pt", map_location="cpu"))
    modelo.eval()
    zbl = np.load(ROOT / "services" / "graph_dense" / "data" / "blocks.npz")
    Xs = sp.csr_matrix(X_meta[None, :])
    lens = np.diff(Xs.indptr)
    with torch.no_grad():
        z = modelo(
            torch.from_numpy(Xs.indices.astype(np.int64)),
            torch.from_numpy(np.r_[0, np.cumsum(lens)[:-1]].astype(np.int64)),
            torch.from_numpy(Xs.data.astype(np.float32)),
            torch.from_numpy(bp[None, :]),
            torch.from_numpy(zbl["Bk"][riga_canone][None, :].astype(np.float32)),
        )[0].numpy()

    zs = np.load(a.studente + ".npz", allow_pickle=True)
    Zc = np.asarray(zs["Z"], np.float32)
    Zn = Zc / (np.linalg.norm(Zc, axis=1, keepdims=True) + 1e-9)
    sim = Zn @ (z / (np.linalg.norm(z) + 1e-9))
    if riga_canone is not None:
        sim[riga_canone] = -9.0
    top = np.argsort(-sim)[:TOP]
    riga = {"chiave": chiave, "titolo": meta.get("title"),
            "vicini": [{"chiave": keys[i], "somiglianza": round(float(sim[i]), 4)} for i in top]}
    (ROOT / a.out).write_text(json.dumps(riga, indent=2, ensure_ascii=False), encoding="utf-8")
    print("  riga: " + ", ".join(f"{v['chiave']}({v['somiglianza']:.3f})" for v in riga["vicini"][:8]), flush=True)
    return 0


def encoder_trama(meta: dict) -> np.ndarray:
    """L'embedding della trama come nel canone: titolo + sinossi, Qwen3, ultimo token, L2."""
    from transformers import AutoModel, AutoTokenizer
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained("Qwen/Qwen3-Embedding-0.6B", trust_remote_code=True)
    m = AutoModel.from_pretrained("Qwen/Qwen3-Embedding-0.6B", trust_remote_code=True).to(dev).eval()
    testo = f"{meta.get('title') or meta.get('name')}. {(meta.get('overview') or '').strip()}"
    inp = tok([testo], return_tensors="pt", truncation=True, max_length=512, padding=True).to(dev)
    with torch.no_grad():
        out = m(**inp).last_hidden_state
    pos = (inp["attention_mask"].sum(1) - 1)
    v = out[torch.arange(len(pos)), pos].float()
    v = torch.nn.functional.normalize(v, dim=1).cpu().numpy()[0].astype(np.float32)
    return v


if __name__ == "__main__":
    raise SystemExit(main())
