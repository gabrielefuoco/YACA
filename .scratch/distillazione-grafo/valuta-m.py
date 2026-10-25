"""Valutazione comparata delle varianti sul target Mercury: grafo, curato, flag, casi chiave.
Uso: py -u .scratch/distillazione-grafo/valuta-m.py [m0 m1 m2 bm]
"""
import sys
import numpy as np
from services.graph_dense import config as C, data as D, eval as E
from services.graph import canon as K

B = D.basic(); S = D.triangle(); N = B["N"]
sp_ = np.load(C.DATA / "split.npz"); split = {k: sp_[k] for k in sp_.files}
test = split["test_idx"]
SOG, BERS, US, COL, WARM = K.banco_curato_split(B["row_of"]); warm = WARM[COL]
mt = np.load(C.DATA / "mercury-target.npz")
none = mt["none"]; kept = mt["kept"]; choice = mt["choice"]; filled = mt["idx"][:, 0] >= 0
date = np.load(C.DATA / "uscite-ordinali.npy")
MODELS = sys.argv[1:] or ["m0", "m1", "m2", "bm"]
CASES = [("movie:597", "Titanic"), ("movie:346698", "Barbie"), ("movie:792307", "Povere creature!"),
         ("movie:150540", "Inside Out"), ("tv:94997", "House of the Dragon"), ("movie:872585", "Oppenheimer"),
         ("movie:381341", "Perfetti"), ("movie:8587", "Lion King"), ("movie:129", "Spirited Away"),
         ("movie:694", "Shining")]


def yr(i):
    return int(date[i] // 365.25 + 1970) if date[i] > 0 else "?"


def t(j):
    j = int(j)
    return f"{B['titoli'][j]} ({yr(j)})"


def per_row(Z):
    rows = []
    for i in test:
        i = int(i); row = S.getrow(i)
        o = np.argsort(-row.data)[:20]
        veri = {int(row.indices[x]) for x in o}
        if not veri:
            continue
        cos = Z[i] @ Z.T; cos[i] = -np.inf
        top = np.argpartition(-cos, 20)[:20]
        rows.append((i, len(veri & {int(x) for x in top}) / len(veri)))
    a = np.array(rows)
    return a[:, 1], a[:, 0].astype(int)


def curated(Z):
    rank = np.zeros(len(SOG), np.float32)
    for j, u in enumerate(US):
        sc = Z[int(u)] @ Z.T; sc[int(u)] = -np.inf
        for i in np.where(COL == j)[0]:
            tg = int(BERS[i]); rank[i] = 1 + float((sc > sc[tg]).sum())
    return rank


def main():
    righe = ["# Valutazione varianti (target Mercury)\n",
             "| modello | grafo@20 | curato @10 calde/fredde | @50 calde/fredde | grafo (flag) | grafo (no flag) |\n",
             "|---|---:|---|---|---|---|\n"]
    for nome in MODELS:
        f = C.DATA / f"{nome}.npz"
        if not f.exists():
            print(f"{nome}: manca"); continue
        Z = np.load(f)["Z"].astype(np.float32)
        r, _ = E.recall_eval(Z, B, split, S, 20)
        rec, rows = per_row(Z)
        fl = none[rows] > 0.3
        rf = rec[fl].mean() if fl.any() else float("nan")
        rn = rec[~fl].mean() if (~fl).any() else float("nan")
        rank = curated(Z)
        cur10 = f"{np.mean(rank[warm] < 10):.3f}/{np.mean(rank[~warm] < 10):.3f}"
        cur50 = f"{np.mean(rank[warm] < 50):.3f}/{np.mean(rank[~warm] < 50):.3f}"
        print(f"{nome}: grafo {r['recall20']:.4f} · curato @10 {cur10} · @50 {cur50} · "
              f"flag {rf:.3f} ({int(fl.sum())}) · no-flag {rn:.3f}")
        righe.append(f"| {nome} | {r['recall20']:.4f} | {cur10} | {cur50} | {rf:.3f} ({int(fl.sum())}) | {rn:.3f} |\n")
        righe.append(f"\n### {nome} — casi chiave\n")
        for key, label in CASES:
            i = ro_i = B["row_of"].get(key)
            if i is None:
                continue
            cos = Z[i] @ Z.T; cos[i] = -np.inf
            top = np.argsort(-cos)[:5]
            righe.append(f"- **{label}**: " + " · ".join(t(j) for j in top) + "\n")
        righe.append("\n")
    (C.DATA / "valutazione-m.md").write_text("".join(righe), encoding="utf-8")
    print("\nscritto valutazione-m.md")


if __name__ == "__main__":
    main()
