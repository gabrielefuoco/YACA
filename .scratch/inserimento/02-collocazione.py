"""02-collocazione.py — TICKET 02: dove va un titolo nuovo.

Due prove, e la prima e' quella che conta.

PARTE A — il test con la risposta giusta, su 1.500 TITOLI.
  Si prendono titoli CHE SONO NEL GRAFO, si nasconde il loro comportamento (come se fossero appena
  usciti), si proiettano dai soli metadati, e si guarda se i vicini trovati sono quelli veri.
  **E il modello si riaddestra SENZA di loro**: la Ridge ha 128x7.934 = 1 milione di parametri su
  49.041 titoli, quindi puo' ricordarseli. Un test di inserimento fatto col modello che li ha visti
  non misura niente.

PARTE B — la lettura sui titoli che il grafo non ha davvero (le uscite 2026).
  Verity e altri. La risposta non e' nota: si legge.
"""
import pathlib
import sys
import time

import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import features as F
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))

ML = F.ML
T0 = time.time()
TIT, VOT = None, None
print("=" * 100)
print("TICKET 02 — la collocazione di un titolo nuovo")
print("=" * 100, flush=True)

Cf = np.load(ML / "cf-spazio.npz")["Cf"]
P_tutti = np.load(ML / "cf-studente.npz")["P"]
mem = np.load(ML / "bolle-nitrile-V7.npy")
import bolle as B

TIT, VOT = B.titoli_leggibili()
sz = np.bincount(mem)
ha = np.linalg.norm(Cf, axis=1) > 1e-6
is_film = ~B.IS_TV
print(f"titoli con comportamento: {int(ha.sum()):,} · partizione V7: {len(sz):,} bolle", flush=True)

# ============================================================ PARTE A
NASCosti = 1500
rng = np.random.default_rng(7)
candidati = np.where(ha & is_film)[0]
nascosti = rng.choice(candidati, NASCosti, replace=False)
print(f"\n### PARTE A — {NASCosti:,} titoli col comportamento nascosto ###", flush=True)

from sklearn.linear_model import Ridge
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.preprocessing import normalize

cat = F.carica_catalogo()
cat2, is_tv = F.arricchisci(cat)
voc = F.costruisci_vocabolari(cat2, is_tv)
FX, _, _ = F.costruisci_fx(cat, voc)
TFIDF = TfidfTransformer().fit(FX)          # l'IDF si CONGELA sul catalogo
Sf = normalize(TFIDF.transform(FX)).astype(np.float32)
print(f"  FX pronta ({time.time()-T0:.0f}s)", flush=True)

t = time.time()
maschera = np.ones(Sf.shape[0], bool)
maschera[nascosti] = False
m_cieco = Ridge(alpha=10.0, solver="lsqr", max_iter=600).fit(Sf[ha & maschera], Cf[ha & maschera])
print(f"  modello riaddestrato SENZA i {NASCosti:,} ({time.time()-t:.0f}s)", flush=True)
P_cieco = m_cieco.predict(Sf[nascosti]).astype(np.float32)

# --- i vicini veri (dal comportamento) e quelli proiettati (dai metadati)
Cfn = Cf / (np.linalg.norm(Cf, axis=1, keepdims=True) + 1e-9)
Pfn = P_cieco / (np.linalg.norm(P_cieco, axis=1, keepdims=True) + 1e-9)
K = 50
acc = {10: [], 50: []}
bolla_ok = 0
bolla_ok_10 = 0
for k, i in enumerate(nascosti):
    vero = Cfn[i] @ Cfn.T
    vero[i] = -9
    top_vero = np.argsort(-vero)[:K]
    freddo = Pfn[k] @ Pfn.T
    fro = np.argsort(-freddo)[:K]
    for N in acc:
        acc[N].append(len(set(top_vero[:N].tolist()) & set(fro[:N].tolist())) / N)
    bolla_ok += int(mem[top_vero[0]] == mem[fro[0]])
    bolla_ok_10 += int(len({int(mem[x]) for x in top_vero[:10]} & {int(mem[x]) for x in fro[:10]}) > 0)

print(f"\n  ** la collocazione proiettata ritrova i vicini veri? **")
for N in sorted(acc):
    print(f"     vicini in comune sui primi {N}: {100*np.mean(acc[N]):.1f}% "
          f"(caso: {100*N/B.N:.3f}%)")
print(f"  ** la bolla del vicino piu' prossimo e' la stessa: {100*bolla_ok/NASCosti:.1f}% **")
print(f"  ** almeno una bolla in comune fra i primi 10: {100*bolla_ok_10/NASCosti:.1f}% **")

# --- e quanto vale il comportamento stesso? il tetto
acc_tetto = []
for k, i in enumerate(nascosti[:300]):
    vero = Cfn[i] @ Cfn.T
    vero[i] = -9
    top = np.argsort(-vero)[:50]
    # "tetto": tolgo UN solo vicino dal calcolo e rimisuro -> non e' un tetto, e' un controllo di rumore
    acc_tetto.append(1.0)
print(f"\n  controllo: caso = {100*10/B.N:.3f}% · quindi il segnale e' "
      f"{np.mean(acc[10])/(10/B.N):.0f}x il caso")

# ============================================================ PARTE B
print(f"\n\n### PARTE B — le uscite che il grafo NON ha ###", flush=True)
import pandas as pd
dv = pd.read_parquet(F.PQ / "movies.parquet")
dv["data"] = pd.to_datetime(dv["release_date"], errors="coerce")
ric = dv[(dv["data"] >= "2026-01-01") & (dv["vote_count"] >= 5)].sort_values("vote_count", ascending=False)
# i titoli del 2026 che NON sono nel grafo
fuori = ric[ric["id"].map(lambda x: B.ROW_OF.get(f"movie:{int(x)}") is None)]
print(f"  film del 2026 con >=5 voti e NON nel grafo: {len(fuori):,}")
scelti = fuori.head(8)
print(f"\n  i piu' votati fra loro, proiettati con il modello completo (quello salvato):")
coef = np.load(ML / "inserimento-modello.npz")["coef"]
interc = np.load(ML / "inserimento-modello.npz")["intercept"]
import json


def una_riga(d):
    """La riga di FX per UN titolo, con i vocabolari congelati."""
    riga = dict(d)
    riga["type"] = "movie"
    riga["date"] = d["release_date"]
    riga["directors"] = d.get("directors")
    riga["year"] = pd.to_numeric(str(d.get("release_date"))[:4], errors="coerce")
    riga["kwn"] = [str(k.get("name", "")).lower() for k in json.loads(d["keywords"] or "[]") if isinstance(k, dict)]
    riga["countries"] = []
    riga["people"] = F.jids(d.get("cast"), "id")[:8] + F.jids(d.get("directors"), "id")
    riga["colls"] = [] if pd.isna(d.get("collection_id")) else [int(d["collection_id"])]
    riga["gm"] = F.mapg(d.get("genres") or "[]", False)
    riga["companies"] = F.jids(d.get("production_companies"), "id")
    riga["writers"] = F.jids(d.get("writers"), "id")
    riga["spoken"] = []
    riga["bayes"] = 0.0
    riga["_rating"] = 1.0 if str(d.get("content_rating") or "").upper() in ("R", "NC-17", "TV-MA") else 0.0
    riga["_budget"] = float(np.log1p(d.get("budget") or 0))
    riga["_revenue"] = float(np.log1p(d.get("revenue") or 0))
    num = F._numeriche(riga)
    cb, vb = F._righe_una(riga, voc, num)
    from scipy.sparse import csr_matrix
    return csr_matrix((np.asarray(vb, np.float32), ([0] * len(cb), cb)),
                      shape=(1, coef.shape[1])).tocsr()


for r in scelti.itertuples(index=False):
    d = r._asdict()
    try:
        riga = una_riga(d)
    except Exception as e:
        print(f"\n  {str(d['title'])[:44]:<46} !! {type(e).__name__}: {e}")
        continue
    tn = TFIDF.transform(riga)              # trasformo con l'IDF del catalogo, non ne calcolo uno nuovo
    tn = normalize(tn).astype(np.float32)
    p = (np.asarray(tn @ coef.T) + interc).astype(np.float32)[0]
    p = p / (np.linalg.norm(p) + 1e-9)
    sim = P_tutti / (np.linalg.norm(P_tutti, axis=1, keepdims=True) + 1e-9)
    v = sim @ p
    v[~ha] = -9
    top = np.argsort(-v)[:8]
    bolle_v = {}
    for x in np.argsort(-v)[:30]:
        bolle_v[int(mem[x])] = bolle_v.get(int(mem[x]), 0) + 1
    b_top = max(bolle_v.items(), key=lambda z: z[1])
    print(f"\n  {str(d['title'])[:52]:<54} ({str(d['release_date'])[:10]}, {d['vote_count']} voti)")
    print(f"     bolla votata: {b_top[0]} ({b_top[1]}/30 voti, {int(sz[b_top[0]])} titoli)")
    print(f"     vicini: " + " | ".join(str(TIT[x])[:30] for x in top[:6]))

print(f"\nFINE ({time.time()-T0:.0f}s)")
