"""Secondo lotto di 20 titoli per b3-en: italiani, documentari, serie, titoli oscuri, recenti."""
from __future__ import annotations
import argparse, numpy as np, pathlib
from services.graph_dense import config as C, data as D

SCELTI=[("movie:637","La vita e' bella"),("movie:429","Il buono, il brutto, il cattivo"),
("movie:11216","Nuovo Cinema Paradiso"),("movie:179144","La grande bellezza"),
("movie:656690","The Social Dilemma"),("movie:9372","Super Size Me"),("movie:1430","Bowling a Columbine"),
("movie:177566","Jack the Giant Killer"),("movie:11387","Lord Jim"),("movie:37610","Il ponticello sul fiume dei guai"),
("tv:1399","Il Trono di Spade"),("tv:71446","La casa di carta"),("tv:93405","Squid Game"),
("tv:76479","The Boys"),("tv:85271","WandaVision"),("movie:10193","Toy Story 3"),
("movie:508883","Il ragazzo e l'airone"),("tv:119051","Mercoledi"),("movie:666277","Past Lives"),
("movie:1008042","Talk to Me")]
ap=argparse.ArgumentParser(); ap.add_argument("--nome",default="b3-en-b3"); a=ap.parse_args()
B=D.basic(); S=D.triangle(); ro=B["row_of"]; N=B["N"]
d=np.load(C.DATA/f"{a.nome}.npz"); Z=d["Z"].astype(np.float32); G=d["G"].astype(np.float32)
X=D.features(B,extra=True); V=D.vocab(); ge={c:t[3:] for t,c in V.items() if t.startswith("ge:")}
keep=np.load(C.DATA/"blocks.npz")["keep"]; orig=np.where(keep)[0]; inv={c:t for t,c in V.items()}
tok={k:inv.get(int(c),"") for k,c in enumerate(orig)}
def gen(i):
    row=X.getrow(i); return sorted({tok[int(c)][3:] for c in row.indices if tok.get(int(c),"").startswith("ge:")})
def t(i):
    a=int(B["ANNO"][int(i)]) if B["ANNO"][int(i)]>0 else 0
    return f"{B['titoli'][int(i)][:44]} ({a})" if a else B["titoli"][int(i)][:44]
righe=[f"# Lettura b3-en — secondo lotto (20 titoli)\n",
       "Italiani, documentari, serie, titoli oscuri, recenti. ✓ = nel top-20 del grafo; g = gate (trama/kw/meta).\n"]
for key,nome in SCELTI:
    i=ro[key]; row=S.getrow(i); o=np.argsort(-row.data)[:20]
    grafo=set(int(row.indices[x]) for x in o)
    cos=Z[i]@Z.T; cos[i]=-np.inf; top=np.argsort(-cos)[:20]
    g=G[i]
    righe.append(f"\n## {nome} — {gen(i)} · bolla {int(B['mem'][i])} · VOT {int(B['VOT'][i])} · g {g[0]:.2f}/{g[1]:.2f}/{g[2]:.2f}\n")
    for k,j in enumerate(top,1):
        mark="✓" if int(j) in grafo else " "
        righe.append(f"{k:2d}. {mark} {t(j)} — {cos[j]:.3f}\n")
out=pathlib.Path(f".scratch/distillazione-grafo/lettura-{a.nome}-2.md")
out.write_text("".join(righe),encoding="utf-8"); print("scritto",out)
