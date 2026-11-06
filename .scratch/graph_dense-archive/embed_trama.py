"""Embedding della trama con Qwen3-Embedding-0.6B, in background e con checkpoint.

Payload: «titolo. trama» (lo stesso del vecchio 04h). Output in `data/trama-qwen3b.npy` +
`data/trama-qwen3b-idx.npy`: matrice (N,1024) con le righe del canone e zero dove la trama manca.
Salva ogni 500; riprende da dove era arrivato; non tocca `services/graph/`.
"""
from __future__ import annotations

import json
import time

import numpy as np
import pandas as pd

from . import config as C
from . import data as D

BATCH = 16
SALVA_OGNI = 500
MODEL = "Qwen/Qwen3-Embedding-0.6B"


def _payloads(B):
    row_of = B["row_of"]
    extra = {}
    for nome in ("overview-extra.parquet", "overview-en.parquet"):
        p_extra = C.DATA / nome
        if not p_extra.exists():
            continue
        e = pd.read_parquet(p_extra)
        n = 0
        for r in e.itertuples(index=False):
            if isinstance(r.overview, str) and r.overview.strip():
                extra[str(r.chiave)] = r.overview.strip()
                n += 1
        print(f"sinossi {nome}: {n:,}", flush=True)
    out = {}
    for tipo, f, cols in (
        ("movie", "movies.parquet", ["id", "title", "title_en", "overview"]),
        ("tv", "tv.parquet", ["id", "name", "name_en", "overview"]),
    ):
        d = pd.read_parquet(C.TMDB / f, columns=cols)
        for r in d.itertuples(index=False):
            key = f"{tipo}:{int(r.id)}"
            if key not in row_of:
                continue
            ov = extra.get(key) or r.overview
            if not isinstance(ov, str) or not ov.strip():
                continue
            title = getattr(r, "title_en", None) or getattr(r, "title", None) \
                or getattr(r, "name_en", None) or getattr(r, "name", None) or ""
            out[key] = f"{title}. {ov.strip()}"
    return out


def main():
    t0 = time.time()
    B = D.basic()
    pay = _payloads(B)
    keys = list(pay)
    rows = np.array([B["row_of"][k] for k in keys], dtype=np.int32)
    N = B["N"]
    f = C.DATA / C.TRAMA
    fi = C.DATA / C.TRAMA_IDX
    if f.exists() and fi.exists():
        E = np.load(f).astype(np.float32)
        idx = np.load(fi).astype(np.int32)
        done = set(int(x) for x in idx)
        print(f"riprendo: {len(done):,} gia' fatti su {len(rows):,}", flush=True)
    else:
        E = np.zeros((N, 1024), dtype=np.float32)
        idx = np.zeros(0, dtype=np.int32)
        done = set()
    todo = [(int(r), pay[k]) for k, r in zip(keys, rows) if int(r) not in done]
    print(f"trame: {len(rows):,} · da fare: {len(todo):,} · modello {MODEL}", flush=True)
    if not todo:
        print("niente da fare", flush=True); return 0
    import torch
    from sentence_transformers import SentenceTransformer
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"device {dev} · carico il modello (prima volta: download)", flush=True)
    model = SentenceTransformer(MODEL, device=dev, trust_remote_code=True)
    print(f"modello pronto dim={model.get_sentence_embedding_dimension()} · t {time.time()-t0:.0f}s", flush=True)
    fatti = list(done)
    for st in range(0, len(todo), SALVA_OGNI):
        blocco = todo[st:st + SALVA_OGNI]
        for j in range(0, len(blocco), BATCH):
            sub = blocco[j:j + BATCH]
            rr = np.array([x[0] for x in sub], dtype=np.int32)
            tt = [x[1] for x in sub]
            vec = model.encode(tt, batch_size=len(tt), normalize_embeddings=True,
                               show_progress_bar=False, convert_to_numpy=True)
            E[rr] = vec.astype(np.float32)
            fatti.extend(int(x) for x in rr)
        idx = np.array(sorted(set(fatti)), dtype=np.int32)
        tmp = C.DATA / "_trama.tmp.npy"; tmpi = C.DATA / "_trama-idx.tmp.npy"
        np.save(tmp, E); np.save(tmpi, idx)
        tmp.replace(f); tmpi.replace(fi)
        (C.DATA / "trama-state.json").write_text(json.dumps({
            "modello": MODEL, "dim": 1024, "n_canone": int(N), "n_trame": int(len(rows)),
            "fatte": int(len(idx)), "device": dev, "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
        }, indent=2), encoding="utf-8")
        print(f"  {len(idx):,}/{len(rows):,} · t {time.time()-t0:.0f}s", flush=True)
    print(f"FINE · {len(idx):,} trame · t {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
