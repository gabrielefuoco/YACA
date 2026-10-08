"""
.scratch/ml-collaborativo/train-ranker.py

IL RANKER. La domanda e' una sola: **riusciamo a ordinare meglio della popolarita'?**

Protocollo (dichiarato prima di guardare i numeri):
  - l'UNIVERSO di candidati e' lo stesso per tutti gli ordinamenti (pool di produzione + 2 hop);
  - TRAIN e TEST sono separati PER ACCOUNT (mai lo stesso account in entrambi);
  - la popolarita' e' SEMPRE in tabella, come controllo banale;
  - il soffitto (quanta verita' e' raggiungibile nell'universo) e' dichiarato.

Uso: offline_graph_builder/venv/Scripts/python.exe .scratch/ml-collaborativo/train-ranker.py
"""
import glob
import json
import os
import pathlib

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score

ROOT = pathlib.Path(__file__).resolve().parents[2]
CACHE = ROOT / ".cache" / "movielens"
FEATS = ["prod", "lpop", "collab", "yeardiff", "genrec", "in1", "in2"]
FEATS_NOGRAPH = ["prod", "lpop", "collab", "yeardiff", "genrec"]


def load():
    rows = []
    pat = os.environ.get("ROWS_GLOB", "ranker-*.ndjson")
    for f in sorted(glob.glob(str(CACHE / pat))):
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def rank_metrics(rows, score_of, n):
    """recall@n medio per account, sullo stesso universo."""
    by = {}
    for r in rows:
        by.setdefault(r["c"], []).append(r)
    hits, tot, ach = 0, 0, 0
    for ctx, rs in by.items():
        gold = {r["k"] for r in rs if r["y"] == 1}
        if not gold:
            continue
        order = sorted(rs, key=lambda r: (-score_of(r), r["k"]))[:n]
        hits += sum(1 for r in order if r["y"] == 1)
        tot += len(gold)
        ach += len(gold)
    return hits / tot if tot else 0.0, tot


def coverage(rows_all, rows_univ):
    """quanta verita' e' nell'universo (il soffitto di ogni ordinamento)."""
    g_all = {r["c"] + "|" + r["k"] for r in rows_all if r["y"] == 1}
    g_univ = {r["c"] + "|" + r["k"] for r in rows_univ if r["y"] == 1}
    return len(g_univ) / len(g_all) if g_all else 0.0


def main():
    rows = load()
    print(f"righe: {len(rows):,} · account: {len(set(r['c'] for r in rows)):,} · positive: {sum(r['y'] for r in rows):,} ({100*sum(r['y'] for r in rows)/len(rows):.2f}%)")
    ctxs = sorted({r["c"] for r in rows})
    strato = {r["c"]: r["s"] for r in rows}
    # split per ACCOUNT, stratificato per strato
    rng = np.random.default_rng(20261008)
    train, test = [], []
    for st in sorted(set(strato.values())):
        c = [x for x in ctxs if strato[x] == st]
        idx = rng.permutation(len(c))
        cut = len(c) // 2
        train += [c[i] for i in idx[:cut]]
        test += [c[i] for i in idx[cut:]]
    tr = [r for r in rows if r["c"] in set(train)]
    te = [r for r in rows if r["c"] in set(test)]
    print(f"train: {len(train)} account ({len(tr):,} righe) · test: {len(test)} account ({len(te):,} righe)")
    tf = os.environ.get("TRIALS_FILE", "graph-candidates-synth.json")
    _raw = json.loads((CACHE / tf).read_text())
    tot_gold = sum(len(t["gold"]) for t in (_raw["trials"] if isinstance(_raw, dict) else _raw))
    print(f"soffitto dell'universo: {sum(r['y'] for r in rows):,} su {tot_gold:,} titoli della verita' = {100*sum(r['y'] for r in rows)/tot_gold:.1f}%")

    Xtr = np.array([[r[f] for f in FEATS] for r in tr], dtype=np.float64)
    ytr = np.array([r["y"] for r in tr])
    Xte = np.array([[r[f] for f in FEATS] for r in te], dtype=np.float64)
    yte = np.array([r["y"] for r in te])
    mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-9
    Ztr, Zte = (Xtr - mu) / sd, (Xte - mu) / sd

    print("\n=== POTERE DI OGNI FEATURE DA SOLA (AUC sul test, account mai visti) ===")
    aucs = {}
    for i, f in enumerate(FEATS):
        a = roc_auc_score(yte, Zte[:, i]) if len(set(yte)) > 1 else float("nan")
        aucs[f] = a
        print(f"  {f:<9} AUC {a:.3f}   (media train {mu[i]:.2f} · sd {sd[i]:.2f})")

    def fit(cols, name):
        idx = [FEATS.index(c) for c in cols]
        m = LogisticRegression(max_iter=2000, C=1.0)
        m.fit(Ztr[:, idx], ytr)
        s = Zte[:, idx] @ m.coef_[0]
        a = roc_auc_score(yte, s)
        print(f"\n=== {name} (AUC {a:.3f}) ===")
        for c, w in sorted(zip(cols, m.coef_[0]), key=lambda x: -abs(x[1])):
            print(f"  {c:<9} peso {w:+.3f}")
        return s

    s_full = fit(FEATS, "RANKER COMPLETO (7 feature)")
    s_nog = fit(FEATS_NOGRAPH, "RANKER SENZA LA SCELTA DEL GRAFO (5 feature)")

    print("\n=== RECALL SULLO STESSO UNIVERSO DI CANDIDATI (test, account mai visti) ===")
    print("| ordinamento | @50 | @200 |")
    print("|---|---|---|")
    ords = {
        "popolarità (controllo banale)": lambda r: r["lpop"],
        "scorer di produzione": lambda r: r["prod"],
        "posizione collaborativa": lambda r: r["collab"],
        "generi condivisi": lambda r: r["genrec"],
        "RANKER (7 feature)": None,
        "RANKER senza grafo (5)": None,
    }
    for name, fn in ords.items():
        if fn is None:
            sc = s_full if "7" in name else s_nog
            scm = {}
            for i, r in enumerate(te):
                scm[id(r)] = sc[i]
            fn = lambda r, scm=scm: scm[id(r)]
        r50, _ = rank_metrics(te, fn, 50)
        r200, _ = rank_metrics(te, fn, 200)
        print(f"| {name} | {100*r50:.1f}% | {100*r200:.1f}% |")

    print("\n=== PER STRATO ===")
    print("| strato | ordinamento | @50 | @200 |")
    print("|---|---|---|---|")
    for st in sorted(set(strato.values())):
        sub = [r for r in te if r["s"] == st]
        scm = {}
        for i, r in enumerate(te):
            scm[id(r)] = s_full[i]
        for name, fn in [("popolarità", lambda r: r["lpop"]), ("scorer di produzione", lambda r: r["prod"]),
                         ("posizione collaborativa", lambda r: r["collab"]), ("RANKER (7 feature)", lambda r, scm=scm: scm[id(r)])]:
            r50, _ = rank_metrics(sub, fn, 50)
            r200, _ = rank_metrics(sub, fn, 200)
            print(f"| {st} | {name} | {100*r50:.1f}% | {100*r200:.1f}% |")


if __name__ == "__main__":
    main()
