"""Lettura del vicinato di b3 (gate per film): 20 titoli + i casi del test di prodotto.

Legge `data/b3.npz` (Z gia' centrato, G = pesi del gate per film) e scrive `lettura-b3.md`.
I titoli dei casi: Povere creature! (isolato in b2), Perfetti sconosciuti (remake), House of the
Dragon (dragon-dominato).

Uso: py .scratch/distillazione-grafo/lettura-b3.py [--nome b3]
"""
from __future__ import annotations
import argparse
import pathlib
import numpy as np
from services.graph_dense import config as C, data as D

SCELTI = [("movie:155", "Il cavaliere oscuro"), ("movie:862", "Toy Story"),
          ("movie:8587", "Il re leone"), ("movie:496243", "Parasite"),
          ("movie:129", "La citta' incantata"), ("movie:381341", "Perfetti sconosciuti"),
          ("movie:694", "Shining"), ("movie:493922", "Hereditary"),
          ("movie:115", "Il grande Lebowski"), ("tv:1396", "Breaking Bad"),
          ("tv:66732", "Stranger Things"), ("movie:62", "2001: Odissea nello spazio"),
          ("movie:597", "Titanic"), ("movie:680", "Pulp Fiction"), ("movie:603", "Matrix"),
          ("movie:872585", "Oppenheimer"), ("movie:346698", "Barbie"),
          ("movie:120", "Il Signore degli Anelli"), ("movie:150540", "Inside Out"),
          ("movie:76341", "Mad Max: Fury Road"),
          ("movie:792307", "Povere creature!"), ("tv:94997", "House of the Dragon")]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--nome", default="b3")
    a = ap.parse_args(argv)
    B = D.basic(); S = D.triangle(); ro = B["row_of"]; N = B["N"]
    d = np.load(C.DATA / f"{a.nome}.npz")
    Z = d["Z"].astype(np.float32); G = d["G"].astype(np.float32) if "G" in d.files else None
    V = D.vocab(); ge = {c: t[3:] for t, c in V.items() if t.startswith("ge:")}
    X = D.features(B, extra=True)
    gen = []
    for i in range(N):
        row = X.getrow(i)
        gen.append(sorted({ge[int(c)] for c in row.indices if int(c) in ge}))

    def tit(i):
        t = B["titoli"][int(i)]; an = int(B["ANNO"][int(i)]) if B["ANNO"][int(i)] > 0 else 0
        return f"{t[:46]} ({an})" if an else t[:46]

    righe = [f"# Lettura del vicinato — {a.nome} (gate per film)\n",
             "20 titoli + i casi del test. ✓ = anche nel top-20 del grafo. `g` = pesi del gate "
             "(trama/keyword/meta).\n"]
    for key, nome in SCELTI:
        i = ro[key]
        row = S.getrow(i); o = np.argsort(-row.data)[:20]
        grafo = set(int(row.indices[x]) for x in o)
        cos = Z[i] @ Z.T; cos[i] = -np.inf; top = np.argsort(-cos)[:20]
        g = G[i] if G is not None else np.zeros(3)
        righe.append(f"\n## {nome} — {gen[i]} · bolla {int(B['mem'][i])} · VOT {int(B['VOT'][i])}"
                     f" · g {g[0]:.2f}/{g[1]:.2f}/{g[2]:.2f}\n")
        for k, j in enumerate(top, 1):
            mark = "✓" if int(j) in grafo else " "
            righe.append(f"{k:2d}. {mark} {tit(j)} — {cos[j]:.3f}\n")
    out = pathlib.Path(f".scratch/distillazione-grafo/lettura-{a.nome}.md")
    out.write_text("".join(righe), encoding="utf-8")
    print(f"scritto {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
