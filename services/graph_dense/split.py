"""Split cold-start induttivo e baseline collocatore V1/V3 sulla stessa split."""
from __future__ import annotations

import json
import sys
from collections import Counter

import numpy as np

from . import config as C
from . import data as D


def _pick(rng, cands, n, mem, sz, frazione=0.25):
    """Sceglie n candidati lasciando almeno il 75% dei membri di ogni bolla in training."""
    cands = np.asarray(cands, dtype=np.int64).copy()
    rng.shuffle(cands)
    scelti, per = [], Counter()
    for i in cands:
        b = int(mem[i])
        massimo = max(1, int(sz[b] * frazione))
        if per[b] >= massimo:
            continue
        scelti.append(int(i)); per[b] += 1
        if len(scelti) >= n:
            break
    return scelti


def make(B, S, seed=C.SEED_SPLIT):
    rng = np.random.default_rng(seed)
    N = B["N"]
    mem, sz, VOT, is_tv = B["mem"], B["sz"], B["VOT"], B["is_tv"]
    has_plot = D.plot_presence(B)
    deg = np.diff(S.indptr)
    elig_main = (VOT >= 20) & (sz[mem] >= 6) & (deg >= 5)
    elig_low = (VOT >= 1) & (VOT < 20) & (sz[mem] >= 6) & (deg >= 3)

    test, strata = [], []

    def add(rows, code):
        for i in rows:
            test.append(int(i)); strata.append(code)

    for tv in (False, True):
        for plot in (True, False):
            cand = np.where(elig_main & (is_tv == tv) & (has_plot == plot))[0]
            rows = _pick(rng, cand, 300, mem, sz, 0.25)
            add(rows, (0 if not tv else 2) + (0 if plot else 1))
    for tv in (False, True):
        cand = np.where(elig_low & (is_tv == tv))[0]
        rows = _pick(rng, cand, C.N_LOW, mem, sz, 0.20)
        add(rows, 4 if not tv else 5)

    mapping = {int(i): int(code) for i, code in zip(test, strata)}
    test_idx = np.array(sorted(mapping), dtype=np.int64)
    strata = np.array([mapping[int(i)] for i in test_idx], dtype=np.int8)
    holdout = np.zeros(N, dtype=bool); holdout[test_idx] = True
    train_b = np.bincount(mem[~holdout], minlength=B["NB"])
    test_b = np.bincount(mem[test_idx], minlength=B["NB"])
    poche = [(int(b), int(test_b[b]), int(train_b[b])) for b in np.where(test_b > 0)[0] if train_b[b] < 2]
    out = {
        "test_idx": test_idx, "holdout": holdout, "strata": strata,
        "has_plot": has_plot, "is_tv": is_tv, "VOT": VOT, "mem": mem,
        "seed": seed, "poche_bolle": poche,
        "conteggi": {
            "film_main_plot": int(((strata == 0)).sum()),
            "film_main_noplot": int(((strata == 1)).sum()),
            "serie_main_plot": int(((strata == 2)).sum()),
            "serie_main_noplot": int(((strata == 3)).sum()),
            "film_low": int(((strata == 4)).sum()),
            "serie_low": int(((strata == 5)).sum()),
        },
    }
    np.savez_compressed(C.DATA / "split.npz", **{k: out[k] for k in
                        ("test_idx", "holdout", "strata", "has_plot", "is_tv", "VOT", "mem")})
    (C.DATA / "split.json").write_text(json.dumps({k: out[k] for k in ("seed", "poche_bolle", "conteggi")},
                                                  indent=2, ensure_ascii=False), encoding="utf-8")
    return out


def collocatore(B, split):
    """Baseline V1/V3 sulla stessa split. Monkeypatch di K.DATA: il vecchio modulo NON si tocca."""
    sys.path.insert(0, str(C.ROOT / "services"))
    from graph import canon as K
    K.DATA = C.SRC  # read-only; la cartella nuova con la copia degli artefatti
    from graph import collocator as CO

    keys = B["keys"]
    test_idx = split["test_idx"]
    mem = B["mem"]
    is_tv = B["is_tv"]
    vicini = D.mappa(B)
    dd_all = D.parquet_rows(keys)
    S3 = CO.carica(v3=True)
    S1 = CO.carica(v3=False)

    res = {}
    for nome, Smacro, S in (("V1_macro", S1, S3), ("V3_macro", S3, S3)):
        own = np.zeros(len(test_idx), dtype=bool)
        quart = np.zeros(len(test_idx), dtype=bool)
        for k, i in enumerate(test_idx):
            key = keys[int(i)]
            dd = dd_all.get(key)
            if dd is None:
                continue
            try:
                b, conf, n, fuori = CO.colloca(dd, "tv" if is_tv[int(i)] else "movie", S, S_macro=Smacro)
            except Exception as e:
                print("  colloca errore", key, e); continue
            if b is None:
                continue
            if int(b) == int(mem[int(i)]):
                own[k] = True; quart[k] = True
            elif int(b) in vicini[int(mem[int(i)])]:
                quart[k] = True
        res[nome] = {
            "own": float(own.mean()), "quartiere": float(quart.mean()),
            "per_strato": {
                str(s): {"own": float(own[split["strata"] == s].mean()) if (split["strata"] == s).any() else 0.0,
                         "quartiere": float(quart[split["strata"] == s].mean()) if (split["strata"] == s).any() else 0.0,
                         "n": int((split["strata"] == s).sum())}
                for s in range(6)
            },
        }
        print(f"  {nome}: own {100*own.mean():.1f}% · quartiere {100*quart.mean():.1f}%")
    (C.DATA / "collocator.json").write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
    return res
