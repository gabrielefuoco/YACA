"""Set di cluster keyword per film: multi-vettore in ingresso, non una media.

Il grafo gerarchico (`src/data/hierarchical_graph.json`) assegna ogni keyword a un cluster
L1 (fine), che ha un parent L2, che ha un parent L3 (largo). Per ogni livello:

* il vettore di un cluster e' il **centroide** degli embedding bge-small delle keyword che
  gli appartengono (non delle sole keyword del film): il grafo fa da smoothing, la keyword
  rumorosa diventa il concetto;
* ogni film riceve fino a `K` cluster per livello, ordinati per peso TF-IDF somma delle sue
  keyword in quel cluster; il peso e' normalizzato a 1 sul massimo del film.

Output `data/kw-set.npz`: centroidi per livello (n_cluster x 384) + per film gli id dei
cluster (N x 3K, -1 = pad) e i pesi (N x 3K). Il modello fa gather dei centroidi, quindi il
costo su disco e' minuscolo e il set resta un multi-vettore fino all'attention pooling.
"""
from __future__ import annotations

import json
import time
from collections import defaultdict

import numpy as np

from . import config as C
from . import data as D

LEVELS = ("L1", "L2", "L3")
K = 12                      # cluster per livello per film (p90 ~10, p99 ~18)
MODEL = "BAAI/bge-small-en-v1.5"
BATCH = 512


def _encode(names):
    """Embedding bge-small (CLS pooling, L2-normalizzato) delle keyword del grafo."""
    import torch
    from transformers import AutoModel, AutoTokenizer

    dev = "cuda" if torch.cuda.is_available() else "cpu"
    tok = AutoTokenizer.from_pretrained(MODEL)
    mod = AutoModel.from_pretrained(MODEL).eval().to(dev)
    out = np.zeros((len(names), 384), np.float32)
    with torch.no_grad():
        for st in range(0, len(names), BATCH):
            chunk = names[st:st + BATCH]
            b = tok(chunk, padding=True, truncation=True, max_length=64, return_tensors="pt").to(dev)
            e = mod(**b).last_hidden_state[:, 0]          # bge: CLS
            e = torch.nn.functional.normalize(e, dim=-1)
            out[st:st + len(chunk)] = e.float().cpu().numpy()
    print(f"  keyword embedding: {len(names):,} · {out.shape[1]}-d · device {dev}", flush=True)
    return out


def _parents(G):
    """Per ogni L1 il parent L2 e per ogni L2 il parent L3."""
    p2 = {c: (v or {}).get("parent") for c, v in G["L1"].items()}
    p3 = {c: (v or {}).get("parent") for c, v in G["L2"].items()}
    return p2, p3


def build(B):
    t0 = time.time()
    G = json.loads((C.ROOT / "src" / "data" / "hierarchical_graph.json")
                   .read_text(encoding="utf-8"))
    kw2l1 = G["kw_to_L1"]
    p2, p3 = _parents(G)
    names = sorted(kw2l1)
    name_idx = {n: i for i, n in enumerate(names)}
    E = _encode(names)

    memb = {lvl: defaultdict(list) for lvl in LEVELS}
    for name, c1 in kw2l1.items():
        i = name_idx[name]
        memb["L1"][c1].append(i)
        c2 = p2.get(c1)
        if c2:
            memb["L2"][c2].append(i)
            c3 = p3.get(c2)
            if c3:
                memb["L3"][c3].append(i)

    cent, cidx = {}, {}
    for lvl in LEVELS:
        ids = sorted(memb[lvl])
        M = np.zeros((len(ids), E.shape[1]), np.float32)
        for k, c in enumerate(ids):
            v = E[memb[lvl][c]].mean(0)
            M[k] = v / (np.linalg.norm(v) + 1e-9)
        cent[lvl] = M
        cidx[lvl] = {c: k for k, c in enumerate(ids)}

    V = D.vocab(); X = D.tfidf()
    kwcol = {int(col): tok[3:] for tok, col in V.items()
             if tok.startswith("kw:") and tok[3:] in kw2l1}
    N = B["N"]
    ids = {lvl: np.full((N, K), -1, np.int16) for lvl in LEVELS}
    wts = {lvl: np.zeros((N, K), np.float16) for lvl in LEVELS}
    # token "film": le keyword del film (embedding bge specifico), non il centroide del cluster
    kids = np.full((N, K), -1, np.int16)
    ktags = np.full((N, K), -1, np.int16)
    kwts = np.zeros((N, K), np.float16)
    l2i = cidx["L2"]
    for r in range(N):
        row = X.getrow(r)
        if row.nnz == 0:
            continue
        acc = {lvl: defaultdict(float) for lvl in LEVELS}
        kws = []
        for j, v in zip(row.indices, row.data):
            name = kwcol.get(int(j))
            if name is None:
                continue
            c1 = kw2l1[name]
            acc["L1"][c1] += float(v)
            c2 = p2.get(c1)
            if c2:
                acc["L2"][c2] += float(v)
                c3 = p3.get(c2)
                if c3:
                    acc["L3"][c3] += float(v)
            kws.append((float(v), name_idx[name], l2i.get(c2, -1) if c2 else -1))
        for lvl in LEVELS:
            top = sorted(acc[lvl].items(), key=lambda kv: -kv[1])[:K]
            if not top:
                continue
            mx = top[0][1] or 1.0
            for s, (c, vv) in enumerate(top):
                ids[lvl][r, s] = cidx[lvl][c]
                wts[lvl][r, s] = vv / mx
        kws.sort(key=lambda x: -x[0])
        if kws:
            mx = kws[0][0] or 1.0
            for s, (vv, ni, l2) in enumerate(kws[:K]):
                kids[r, s] = ni
                ktags[r, s] = l2
                kwts[r, s] = vv / mx

    cov = {lvl: float((ids[lvl] >= 0).any(1).mean()) for lvl in LEVELS}
    ntok = {lvl: float((ids[lvl] >= 0).sum(1).mean()) for lvl in LEVELS}
    np.savez_compressed(
        C.DATA / "kw-set.npz",
        cent_L1=cent["L1"].astype(np.float16), cent_L2=cent["L2"].astype(np.float16),
        cent_L3=cent["L3"].astype(np.float16),
        ids_L1=ids["L1"], ids_L2=ids["L2"], ids_L3=ids["L3"],
        w_L1=wts["L1"], w_L2=wts["L2"], w_L3=wts["L3"],
        emb_kw=E.astype(np.float16), kids=kids, ktags=ktags, kw_w=kwts,
    )
    meta = {
        "modello": MODEL, "dim": 384, "K": K, "livelli": list(LEVELS),
        "n_cluster": {lvl: int(len(cent[lvl])) for lvl in LEVELS},
        "n_kw": int(len(names)),
        "copertura": cov, "token_medi": ntok,
        "impronte": {"grafo": D.sha("hierarchical_graph.json", C.ROOT / "src" / "data"),
                     "tfidf": D.sha(C.TFIDF), "vocab": D.sha(C.VOCAB)},
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }
    (C.DATA / "kw-set.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"kw-set: copertura {cov} · token medi {ntok} · t {time.time()-t0:.0f}s", flush=True)
    return meta


def main():
    B = D.basic()
    build(B)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
