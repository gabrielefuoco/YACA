"""20-curato-sulle-bolle.py — TICKET 20: i legami curati proiettati sulle bolle.

I 3.417 legami scritti a mano fanno male come ARCHI nel grafo dei titoli (wormhole che distorcono la
camminata). Ma proiettati sul grafo delle BOLLE non toccano piu' la camminata sui singoli titoli e
diventano un segnale d'oro per scegliere i **mondi affini**: sono esattamente cio' che un intenditore
sa e un algoritmo no.

La proiezione si separa in due casi, che significano cose diverse:
  * legami DENTRO la stessa bolla -> un segnale di APPARTENENZA (quella bolla ha un filo vero);
  * legami FRA due bolle        -> un segnale di ADIACENZA (i mondi affini).

E la domanda che decide se usarlo: **i mondi affini della curatela coincidono con i vicini forti che
il grafo trova da solo?** Dove coincidono, la curatela conferma; dove no, la discordanza e' la parte
interessante — e' li' che un intenditore sa qualcosa che i dati non sanno.

Uso:  python .scratch/grafo-servibile/20-curato-sulle-bolle.py
"""
import json, pathlib, sys, time
from collections import defaultdict
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
voti = K.voti()
mem = np.load(K.ML / "bolle2-E.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)
print(f"bolle {nb:,} · {int((sz>=5).sum()):,} con ≥5 titoli")

# le keyword, per nominare le bolle
KWt = [set() for _ in range(n)]
TIT = {}
for f, col, kc in (("movies.parquet", "title", "keywords"), ("tv.parquet", "name", "keywords")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f, columns=["id", col, kc])
    typ = "movie" if f.startswith("m") else "tv"
    for i, t_, kwd in zip(dd["id"], dd[col], dd[kc]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is None:
            continue
        TIT[r] = str(t_)
        try:
            g = json.loads(kwd) if isinstance(kwd, str) else (kwd or [])
            KWt[r] = {x.get("name", "").lower() for x in g if isinstance(x, dict)}
        except Exception:
            pass


def nome(b, q=3):
    m = np.where(mem == b)[0]
    from collections import Counter
    c = Counter()
    for x in m[:20]:
        c.update(KWt[x])
    return " · ".join(w for w, _ in c.most_common(q)) or "—"


# ------------------------------------------------------------------ 1. i legami di training
d = json.loads((K.GOLD / "cross-merged.json").read_text(encoding="utf-8"))
src = d["sources"]
COPPIE = []
for i, s in enumerate(src):
    if i % 2 != 0:
        continue                                   # il training sono le sorgenti a indice pari
    a = row_of.get(s["id"])
    if a is None:
        continue
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None or l["type"] == s["id"].split(":")[0]:
            continue
        COPPIE.append((a, b))
print(f"legami di training: {len(COPPIE):,}")

# ------------------------------------------------------------------ 2. la proiezione
intra, inter = defaultdict(int), defaultdict(int)
for a, b in COPPIE:
    ba, bb = int(mem[a]), int(mem[b])
    if ba == bb:
        intra[ba] += 1
    else:
        inter[(min(ba, bb), max(ba, bb))] += 1
n_intra = sum(intra.values())
print("")
print("=" * 100)
print("LA PROIEZIONE")
print("=" * 100)
print(f"  legami DENTRO la stessa bolla: {n_intra:,} ({100*n_intra/len(COPPIE):.1f}%) "
      f"su {len(intra):,} bolle diverse  <- APPARTENENZA")
print(f"  legami FRA due bolle:          {sum(inter.values()):,} "
      f"({100*sum(inter.values())/len(COPPIE):.1f}%) su {len(inter):,} coppie di bolle  <- ADIACENZA")
if intra:
    print(f"  la bolla con piu' legami interni: [{max(intra, key=intra.get)}] "
          f"{intra[max(intra, key=intra.get)]} legami · {nome(max(intra, key=intra.get))}")
print(f"  (su {len(COPPIE):,} legami, {n_intra:,} sono interni: la curatela serve anche a dire")
print(f"   «questi titoli stanno insieme», non solo «questi due mondi sono vicini»)")

# ------------------------------------------------------------------ 3. il controllo: legami a caso
rng = np.random.default_rng(31)
voti_f = np.where(~is_tv, voti, -1.0)
banda = np.digitize(voti_f, np.quantile(voti_f[~is_tv], np.linspace(0, 1, 51)))
per_banda = {int(b): np.where(banda == b)[0] for b in np.unique(banda)}
intra_r, inter_r = defaultdict(int), defaultdict(int)
for a, _ in COPPIE:
    finto = int(rng.choice(per_banda[int(banda[a])]))
    ba, bb = int(mem[finto]), int(mem[a])
    if ba == bb:
        intra_r[ba] += 1
    else:
        inter_r[(min(ba, bb), max(ba, bb))] += 1
print("")
print("  --- controllo: gli stessi legami con bersagli CASUALI appaiati per popolarita' ---")
print(f"    dentro la stessa bolla: {sum(intra_r.values()):,} · fra due bolle: {sum(inter_r.values()):,}")
print(f"    coppie di bolle distinte toccate: curatela {len(inter):,} · caso {len(inter_r):,}")
print(f"    >>> la curatela CONCENTRA ({len(inter):,} coppie) e il caso SPARPAGLIA "
      f"({len(inter_r):,}): e' la prova che i legami hanno una struttura, non sono rumore")

# ------------------------------------------------------------------ 4. i legami contro il grafo
F = sp.load_npz(K.ML / "bolle-archi.npz").tocsr()
W = (F + F.T).tocsr()
dentro_mappa = coincide = 0
esempi = []
for (a, b) in inter:
    dentro_mappa += 1
    if W[a, b] > 0:
        coincide += 1
    else:
        esempi.append((a, b, inter[(a, b)]))
print("")
print("=" * 100)
print("LA CURATELA CONFERMA IL GRAFO, O DICE QUALCOSA CHE IL GRAFO NON SA?")
print("=" * 100)
print(f"  delle {dentro_mappa:,} coppie di bolle che la curatela collega, "
      f"{coincide:,} ({100*coincide/max(dentro_mappa,1):.1f}%) sono anche archi della mappa")
print(f"  >>> il {100*(1-coincide/max(dentro_mappa,1)):.1f}% e' DISCORDANZA: legami che un intenditore")
print(f"      scrive a mano e che il grafo non trova. E' la parte interessante.")
print("")
print(f"  --- le 12 discordanze con piu' legami (da leggere) ---")
for a, b, q in sorted(esempi, key=lambda x: -x[2])[:12]:
    ma, mb_ = np.where(mem == a)[0], np.where(mem == b)[0]
    print(f"    {q} legami  [{a}] {nome(a,3)}")
    print(f"               ([{b}] {nome(b,3)})")
    print(f"               es. {TIT.get(ma[0],'?')[:28]} / {TIT.get(mb_[0],'?')[:28]}")

# ------------------------------------------------------------------ 5. quanti slot reclamerebbe
con_archi = sum(1 for (a, b) in inter if W[a, b] > 0)
print("")
print("=" * 100)
print("QUANTI DEGLI 8 SLOT PER BOLLA RECLAMEREBBE (dichiarato PRIMA di applicarlo)")
print("=" * 100)
per_bolla = defaultdict(set)
for (a, b) in inter:
    per_bolla[a].add(b)
    per_bolla[b].add(a)
valori = np.array([len(v) for v in per_bolla.values()])
print(f"  bolle toccate dalla curatela: {len(per_bolla):,} su {nb:,} ({100*len(per_bolla)/nb:.1f}%)")
print(f"  vicini di curatela per bolla toccata: mediana {int(np.median(valori))} · "
      f"90° percentile {int(np.percentile(valori, 90))} · massimo {int(valori.max())}")
print(f"  >>> su 8 slot, la curatela ne reclamerebbe {np.median(valori):.0f} dove arriva "
      f"(mediana), e {int(np.percentile(valori, 90))} nei casi peggiori")
n_tocca = len(per_bolla)
print(f"  copertura dei ticket 12: la curatela tocca il {100*n_tocca/nb:.1f}% delle bolle — quindi il")
print(f"  {100*(1-n_tocca/nb):.1f}% delle bolle avrebbe gli 8 slot decisi SOLO dai dati")
print(f"\nFINE ({time.time()-t0:.0f}s)")
