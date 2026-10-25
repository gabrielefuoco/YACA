"""Valutazione: collocazione in bolla/quartiere e recall@20 contro gli archi completi."""
from __future__ import annotations

import json

import numpy as np

from . import config as C
from . import data as D

STRATI = {
    0: "film_main_plot", 1: "film_main_noplot",
    2: "serie_main_plot", 3: "serie_main_noplot",
    4: "film_low", 5: "serie_low",
}
FATTORE_VOTI = 10.0


def _centri(Z, B, split):
    mem, sz = B["mem"], B["sz"]
    train = ~split["holdout"]
    cand = np.where(sz >= 5)[0]
    pos = {int(b): k for k, b in enumerate(cand)}
    Cb = np.zeros((len(cand), Z.shape[1]), np.float32)
    med = np.zeros(len(cand), np.float32)
    serie = np.zeros(len(cand), bool)
    for k, b in enumerate(cand):
        m = np.where((mem == b) & train)[0]
        if len(m) == 0:
            continue
        mu = Z[m].mean(0)
        Cb[k] = mu / (np.linalg.norm(mu) + 1e-9)
        v = B["VOT"][m]
        v = v[v > 0]
        med[k] = float(np.median(v)) if len(v) else 0.0
        serie[k] = float(B["is_tv"][m].mean()) > 0.5
    return cand, pos, Cb, med, serie


def bubble_eval(Z, B, split, vicini):
    test, strata, mem = split["test_idx"], split["strata"], B["mem"]
    is_tv, VOT = B["is_tv"], B["VOT"]
    cand, pos, Cb, med, serie = _centri(Z, B, split)
    own = np.zeros(len(test), bool); quart = np.zeros(len(test), bool)
    for k, i in enumerate(test):
        b = int(mem[int(i)])
        if b not in pos:
            continue
        cos = Z[int(i)] @ Cb.T
        vc = float(VOT[int(i)])
        if vc > 0:
            ok = (med >= vc / FATTORE_VOTI) & (med <= vc * FATTORE_VOTI)
            if ok.any():
                cos = np.where(ok, cos, -np.inf)
        stesso = serie == bool(is_tv[int(i)])
        if stesso.any():
            cos = np.where(stesso, cos, -np.inf)
        j = int(np.argmax(cos))
        bp = int(cand[j])
        if bp == b:
            own[k] = True; quart[k] = True
        elif bp in vicini[b]:
            quart[k] = True
    out = {"own": float(own.mean()), "quartiere": float(quart.mean()), "n": int(len(test))}
    per = {}
    for s, nome in STRATI.items():
        m = strata == s
        if m.any():
            per[nome] = {"own": float(own[m].mean()), "quartiere": float(quart[m].mean()),
                         "n": int(m.sum())}
    out["per_strato"] = per
    return out, own, quart


def recall_eval(Z, B, split, S, k=20):
    test, strata = split["test_idx"], split["strata"]
    rec = np.full(len(test), np.nan, np.float32)
    n_neigh = np.zeros(len(test), np.int32)
    for t, i in enumerate(test):
        i = int(i)
        row = S.getrow(i)
        if row.nnz == 0:
            continue
        o = np.argsort(-row.data)[:k]
        veri = set(int(row.indices[x]) for x in o)
        if not veri:
            continue
        cos = Z[i] @ Z.T
        cos[i] = -np.inf
        top = np.argpartition(-cos, k)[:k]
        presi = set(int(x) for x in top)
        rec[t] = len(veri & presi) / len(veri)
        n_neigh[t] = len(veri)
    out = {"recall20": float(np.nanmean(rec)), "n": int(np.sum(~np.isnan(rec)))}
    per = {}
    for s, nome in STRATI.items():
        m = (strata == s) & ~np.isnan(rec)
        if m.any():
            per[nome] = {"recall20": float(np.nanmean(rec[m])), "n": int(m.sum())}
    out["per_strato"] = per
    return out, rec


def salva(nome, bub, coll, rec, extra=None):
    d = {"bolla": bub, "collocatore": coll, "recall": rec}
    if extra:
        d.update(extra)
    (C.DATA / f"{nome}.json").write_text(json.dumps(d, indent=2, ensure_ascii=False), encoding="utf-8")
    return d
