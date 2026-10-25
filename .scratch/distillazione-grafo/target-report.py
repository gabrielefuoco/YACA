"""Report del target Mercury: distribuzione, flag e casi chiave. Uso: py -u target-report.py"""
import numpy as np
from services.graph_dense import config as C, data as D

B = D.basic(); ro = B["row_of"]; N = B["N"]
date = np.load(C.DATA / "uscite-ordinali.npy")
z = np.load(C.DATA / "mercury-target.npz")
idx, w = z["idx"], z["w"]
none, kept, maxp, choice = z["none"], z["kept"], z["maxp"], z["choice"]
filled = idx[:, 0] >= 0


def yr(i):
    return int(date[i] // 365.25 + 1970) if date[i] > 0 else "?"


def t(j):
    j = int(j)
    return f"{B['titoli'][j]} ({yr(j)})"


def main():
    from collections import Counter
    print(f"pieni {int(filled.sum()):,}/{N:,} ({filled.mean():.1%})")
    print("scelte:", dict(Counter(choice[filled].tolist())))
    k = kept[filled]
    print(f"kept: mediana {int(np.median(k))} · 0-2 {int((k <= 2).sum())} · 0 {int((k == 0).sum())}")
    print(f"none>0.3: {int((none[filled] > 0.3).sum())} · maxp<0.2: {int((maxp[filled] < 0.2).sum())}")
    CASES = [("movie:597", "Titanic"), ("movie:346698", "Barbie"), ("movie:792307", "Povere creature!"),
             ("movie:150540", "Inside Out"), ("tv:94997", "House of the Dragon"), ("movie:872585", "Oppenheimer"),
             ("movie:381341", "Perfetti"), ("movie:8587", "Lion King"), ("movie:129", "Spirited Away"),
             ("movie:694", "Shining"), ("tv:1396", "Breaking Bad"), ("movie:862", "Toy Story")]
    righe = ["# Target Mercury — report\n",
             f"Pieni {int(filled.sum()):,}/{N:,} · scelte {dict(Counter(choice[filled].tolist()))}\n",
             f"kept mediana {int(np.median(k))} · 0-2 {int((k <= 2).sum())} · none>0.3 {int((none[filled] > 0.3).sum())}\n"]
    for key, nome in CASES:
        i = ro.get(key)
        if i is None or not filled[i]:
            print(f"\n{nome}: non ancora fatto"); continue
        top = [t(j) for j in idx[i][:10]]
        flag = f"choice {choice[i]} · none {none[i]:.2f} · kept {int(kept[i])} · maxp {maxp[i]:.2f}"
        print(f"\n{nome} · {flag}\n  " + " · ".join(top[:6]))
        righe.append(f"\n## {nome} · {flag}\n" + "\n".join("- " + x for x in top) + "\n")
    (C.DATA / "target-report.md").write_text("".join(righe), encoding="utf-8")
    print("\nscritto target-report.md")


if __name__ == "__main__":
    main()
