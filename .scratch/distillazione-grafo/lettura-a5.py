"""Lettura a occhio: grafo vs A1 (senza keyword) vs A5 (set di cluster keyword).

Per ogni titolo stampa i primi vicini dei tre sistemi. I giudizi si scrivono a mano dopo.
"""
from __future__ import annotations

import sys

import numpy as np

from services.graph_dense import config as C
from services.graph_dense import data as D

NOMI = [
    ("movie:557", "Spider-Man (2002)"),
    ("movie:2309", "Inkheart (2008)"),
    ("movie:1265", "Un ponte per Terabithia (2007)"),
    ("movie:27205", "Inception (2010)"),
    ("movie:381341", "Perfetti sconosciuti (2016)"),
    ("tv:1396", "Breaking Bad (2008)"),
    ("movie:8587", "Il re leone (1994)"),
    ("movie:862", "Toy Story (1995)"),
    ("movie:603", "Matrix (1999)"),
    ("movie:13", "Forrest Gump (1994)"),
    ("movie:238", "Il padrino (1972)"),
    ("movie:155", "Il cavaliere oscuro (2008)"),
    ("movie:120", "Il Signore degli Anelli - La Compagnia (2001)"),
    ("movie:11", "Guerre stellari (1977)"),
    ("tv:1399", "Il Trono di Spade (2011)"),
    ("tv:60625", "Rick and Morty (2013)"),
    ("tv:66732", "Stranger Things (2016)"),
    ("tv:456", "I Simpson (1989)"),
    ("movie:24428", "The Avengers (2012)"),
    ("movie:293660", "Deadpool (2016)"),
    ("movie:76341", "Mad Max: Fury Road (2015)"),
    ("movie:274", "Il silenzio degli innocenti (1991)"),
    ("movie:807", "Seven (1995)"),
    ("movie:550", "Fight Club (1999)"),
    ("movie:496243", "Parasite (2019)"),
    ("movie:324857", "Spider-Man: Un nuovo universo (2018)"),
    ("movie:872585", "Oppenheimer (2023)"),
    ("movie:346698", "Barbie (2023)"),
    ("movie:680", "Pulp Fiction (1994)"),
    ("movie:597", "Titanic (1997)"),
]

TOP = 10


def _tit(B, r):
    t = B["titoli"][int(r)]
    anno = int(B["ANNO"][int(r)]) if B["ANNO"][int(r)] > 0 else 0
    return f"{t[:58]} ({anno})" if anno else t[:58]


def main():
    B = D.basic(); S = D.triangle()
    A1 = np.load(C.DATA / "a1.npz")["Z"].astype(np.float32)
    nome5 = sys.argv[1] if len(sys.argv) > 1 else "a7"
    A5 = np.load(C.DATA / f"{nome5}.npz")["Z"].astype(np.float32)
    ro = B["row_of"]
    righe = []
    for key, nome in NOMI:
        r = ro.get(key)
        if r is None:
            continue
        graf = []
        row = S.getrow(r)
        for j in np.argsort(-row.data)[:TOP]:
            graf.append((int(row.indices[j]), float(row.data[j])))
        out = {}
        for tag, Z in (("A1", A1), (nome5, A5)):
            cos = Z[r] @ Z.T
            cos[r] = -np.inf
            idx = np.argsort(-cos)[:TOP]
            out[tag] = [(int(i), float(cos[i])) for i in idx]
        o1 = len({i for i, _ in graf} & {i for i, _ in out["A1"]})
        o5 = len({i for i, _ in graf} & {i for i, _ in out[nome5]})
        o15 = len({i for i, _ in out["A1"]} & {i for i, _ in out[nome5]})
        righe.append(f"\n## {nome}  ·  bolla {int(B['mem'][r])} · "
                     f"VOT {int(B['VOT'][r])} · {'serie' if B['is_tv'][r] else 'film'}\n")
        righe.append(f"intersezione con il grafo: A1 {o1}/{TOP} · A5 {o5}/{TOP} · A1∩A5 {o15}/{TOP}\n")
        for tag, lst in (("grafo", graf), ("A1", out["A1"]), (nome5, out[nome5])):
            righe.append(f"\n**{tag}**\n\n")
            for k, (i, v) in enumerate(lst, 1):
                mark = " *(anche nel grafo)*" if tag != "grafo" and i in {x for x, _ in graf} else ""
                righe.append(f"{k:2d}. {_tit(B, i)} — {v:.3f}{mark}\n")
    p = C.ROOT / ".scratch" / "distillazione-grafo" / "lettura-a5.md"
    p.write_text("".join(righe), encoding="utf-8")
    print(f"scritto {p} · {len(NOMI)} titoli")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
