"""genera-esempi.py — le bolle lette, per far capire la struttura.

Produce `.scratch/mappa-pesata/bolle-esempi.md`: per una dozzina di bolle, l'identita' (id, titoli,
quota di serie), i termini che le definiscono, i membri piu' centrali, e i vicini pesati. Serve al
digest: chi legge deve **vedere** cosa e' una bolla, non dedurlo dai numeri.

Le bolle scelte mostrano apposta i casi diversi:
  · le nicchie riuscite (il fantasy anni '80, il seinen anime, il K-BL, il K-drama)
  · il caso cross-medium (Guerre stellari <-> The Mandalorian)
  · il minestrone che non va (la bolla 820, quella di Verity)
  · la piu' grossa, la piu' piccola, e una trovata per termine (film noir)

I termini dei centroidi vengono dagli artefatti V3 (`05-centroidi.npz`, `05-vocab.json`): sono quelli
che leggono meglio, perche' e' la variante senza il rumore delle keyword rare.
"""
import json
import pathlib
import sys

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

ML = K.ML
mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
IS_TV = B.IS_TV
q_tv = np.zeros(NB)
np.add.at(q_tv, mem, IS_TV.astype(float))
quota_tv = q_tv / np.maximum(sz, 1)
TIT, VOT = B.titoli_leggibili()

SUM = sp.load_npz(ML / "05-centroidi.npz").tocsr()
META = np.load(ML / "05-centroidi-meta.npz")
TUTTE = np.concatenate([META["bolle_serie"], META["bolle_film"]])
pos = {int(b): k for k, b in enumerate(TUTTE)}
vocab = json.load(open(ML / "05-vocab.json", encoding="utf-8"))
inv = {i: t for t, i in vocab.items()}

# il grafo delle bolle, pesato
q = np.load(ML / "bolle-nitrile-V8-triangolo.npz")
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (Ws + Ws.T).tocsr()
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()


def termini(b, quanti=9):
    j = pos.get(int(b))
    if j is None:
        return []
    v = SUM[j].toarray().ravel()
    top = np.argsort(-v)[:quanti]
    return [inv[int(t)] for t in top if v[t] > 0]


def membri(b, quanti=12):
    m_ = np.where(mem == b)[0]
    ordine = np.argsort(-VOT[m_])
    return [TIT[x] for x in m_[ordine[:quanti]]]


def vicini(b, quanti=6):
    riga = BB.getrow(int(b))
    o = np.argsort(-riga.data)[:quanti]
    return [(int(riga.indices[t]), float(riga.data[t])) for t in o]


def blocco(b, perche):
    if b >= NB or sz[b] == 0:
        return ""
    medio = "serie" if quota_tv[b] > 0.5 else "film"
    righe = [f"### {perche} — bolla {b}", ""]
    righe.append(f"*{int(sz[b])} titoli · {100*quota_tv[b]:.0f}% serie ({medio}) · "
                 f"purezza {max(quota_tv[b], 1-quota_tv[b]):.2f}*")
    righe.append("")
    t = termini(b)
    if t:
        righe.append(f"**La definiscono:** `" + "` · `".join(t) + "`")
        righe.append("")
    righe.append("**Dentro (i più votati):**")
    righe.append("")
    for nome in membri(b):
        righe.append(f"- {nome}")
    righe.append("")
    v = vicini(b)
    if v:
        righe.append("**I sei vicini più pesanti sulla mappa (peso):**")
        righe.append("")
        for j, peso in v:
            es = ", ".join(TIT[x][:34] for x in np.where(mem == j)[0][:3])
            righe.append(f"- bolla {j} ({peso:.0f}) — {int(sz[j])} titoli: {es}")
        righe.append("")
    return "\n".join(righe) + "\n"


# ---------------------------------------------------------------- le bolle da mostrare
SCELTE = [
    (12, "La più grossa: true crime e documentari"),
    (750, "Il fantasy/avventura anni '80 — una nicchia riuscita"),
    (525, "Il seinen anime — una nicchia riuscita"),
    (738, "Il K-BL coreano — una nicchia riuscita"),
    (775, "Il K-drama — una nicchia riuscita"),
    (560, "I late-night talk show — un mondo che nessuno aveva chiesto"),
    (1313, "Guerre stellari, i film — il caso cross-medium, lato film"),
    (1090, "Star Wars, le serie — il caso cross-medium, lato serie"),
    (1508, "Una bolla piccolissima (5 titoli)"),
    (1443, "La famiglia reale britannica (6 titoli)"),
    (820, "⚠️ IL MINESTRONE: la bolla dove finisce Verity, e non dovrebbe"),
]

# e tre trovate per termine
CERCA = [("kw:film noir", "Il film noir, trovato per termine"),
         ("kw:spaghetti western", "Lo spaghetti western, trovato per termine"),
         ("kw:superhero", "I supereroi, trovati per termine")]

testo = ["# Le bolle, lette",
         "",
         "Dodici bolle della partizione **V8** (1.625 bolle, mediana 33 titoli, purezza di medium",
         "0,946), scelte per far vedere la struttura: le nicchie che funzionano, il caso cross-medium,",
         "il minestrone che non funziona, la più grossa e la più piccola.",
         "",
         "I termini sono quelli che pesano di più nel centroide della bolla (artefatti **V3**:",
         "`df ≥ 3`, idf con tetto, pesi per tipo). I vicini sono i sei archi più pesanti sulla mappa",
         "pesata, quella del ticket 01-02 di `mappa-pesata`.",
         "",
         "---",
         ""]

for b, perche in SCELTE:
    testo.append(blocco(b, perche))
    testo.append("---\n")

for termine, perche in CERCA:
    k = vocab.get(termine)
    if k is None:
        continue
    col = np.asarray(SUM[:, k].todense()).ravel()
    if col.max() <= 0:
        continue
    b = int(TUTTE[int(np.argmax(col))])
    testo.append(blocco(b, perche))
    testo.append("---\n")

# ---------------------------------------------------------------- una nota sulla distribuzione
testo.append("## La forma della partizione, in numeri\n")
testo.append("| | |")
testo.append("|---|---|")
testo.append(f"| bolle | {NB:,} |")
testo.append(f"| titoli | {N:,} |")
testo.append(f"| mediana | {int(np.median(sz))} titoli |")
testo.append(f"| la più piccola | {int(sz.min())} · la più grossa {int(sz.max())} |")
for lo, hi in ((0, 5), (5, 15), (15, 30), (30, 60), (60, 120), (120, 10**6)):
    m = (sz >= lo) & (sz < hi)
    testo.append(f"| bolle da {lo} a {hi if hi < 10**6 else '∞'} titoli | {int(m.sum()):,} "
                 f"({100*m.mean():.0f}% delle bolle, {100*sz[m].sum()/N:.0f}% dei titoli) |")
testo.append(f"| purezza di medium | media {np.maximum(quota_tv, 1-quota_tv).mean():.3f} |")
testo.append(f"| bolle monomedium | {int((np.maximum(quota_tv, 1-quota_tv) == 1).sum()):,} |")
testo.append("")
testo.append("Un quinto delle bolle ha meno di 15 titoli e contiene l'1% dei titoli; il 60% dei")
testo.append("titoli sta in bolle da oltre 60. È la ragione per cui la collocazione a freddo riesce")
testo.append("al 100% sulle bolle sotto i 10 titoli e al 21% su quelle sopra i 120.\n")

out = QUI / "bolle-esempi.md"
out.write_text("\n".join(testo), encoding="utf-8")
print(f"scritto {out} ({out.stat().st_size/1024:.0f} KB)")
print(f"bolle mostrate: {len(SCELTE) + sum(1 for t, _ in CERCA if t in vocab)}")
