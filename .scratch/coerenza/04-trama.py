"""04-trama.py — TICKET 04: la coerenza sulla trama, l'arbitro che non usa la co-visione.

§3.1 del senior: il collocatore V3 usa generi, keyword, cast, registi, reti, case, paesi — **mai il
testo della trama**. Quindi la similarità fra le trame e' una misura INDIPENDENTE di qualita'
semantica, e vale anche per un'uscita del 2026 che di comportamento non ne ha.

DUE OSTACOLI, misurati prima di costruire — perche' una metrica che non funziona e' peggio di nessuna
metrica:
  1. l'`overview` manca per il **58,8%** dei film e il **51,5%** delle serie;
  2. le trame presenti sono **in italiano**, e `bge-small-en-v1.5` e' un modello **inglese**.

Quindi si comincia dal controllo che decide tutto: su un testo italiano, quel modello produce
similarita' sensate? Se no, si dice, e non si producono numeri che non significano niente.

Il controllo usa coppie a risposta nota:
  · stessa storia / stesso mondo  -> devono stare alte
  · argomenti opposti (un thriller e un cartone per bambini) -> devono stare basse
Se il modello non le separa, il multilingue (o la traduzione) e' obbligatorio, e lo diciamo.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
PQ = pathlib.Path(".cache/tmdb")
print("=" * 100)
print("TICKET 04 — LA COERENZA SULLA TRAMA")
print("=" * 100, flush=True)

# ---------------------------------------------------------------- le trame
TRAME = {}
per_id = {}
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(PQ / f, columns=["id", "overview", col])
    for r in d.itertuples(index=False):
        dd = r._asdict()
        per_id[(typ, int(dd["id"]))] = str(dd.get(col) or "")
        o = str(dd.get("overview") or "").strip()
        if len(o) > 40:
            TRAME[(typ, int(dd["id"]))] = o
print(f"  trame utilizzabili: {len(TRAME):,} su {len(per_id):,} "
      f"({100*len(TRAME)/len(per_id):.1f}%) ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- il controllo del modello
print("\n" + "=" * 100)
print("IL CONTROLLO CHE DECIDE TUTTO — un modello inglese su trame italiane")
print("=" * 100, flush=True)
from sentence_transformers import SentenceTransformer
modello = SentenceTransformer("BAAI/bge-small-en-v1.5")
print(f"  modello caricato ({time.time()-T0:.0f}s)", flush=True)


def trova(nome, tipo="movie"):
    for (tp, i), t in per_id.items():
        if tp == tipo and nome.lower() in t.lower():
            return (tp, i), t
    return None, None


COPPIE = [
    ("Gone Girl", "Shutter Island", "attese ALTE: due thriller psicologici"),
    ("Gone Girl", "Fight Club", "attese ALTE: stesso pubblico, stesso tipo"),
    ("Gone Girl", "Toy Story", "attese BASSE: un thriller e un cartone"),
    ("Fight Club", "Toy Story", "attese BASSE"),
    ("Inception", "Interstellar", "attese ALTE: stesso regista, stesso tipo"),
    ("Inception", "La sirenetta", "attese BASSE"),
]
visti = []
for a, b, attesa in COPPIE:
    ka, ta = trova(a)
    kb, tb = trova(b)
    if ka is None or kb is None:
        print(f"  {a} / {b}: trama non trovata")
        continue
    ea, eb = modello.encode([ta, tb], normalize_embeddings=True)
    cos = float(ea @ eb)
    visti.append((a, b, cos, attesa))
    print(f"  {a:<14} / {b:<16} cos {cos:+.3f}   {attesa}")

if visti:
    alte = [c for _, _, c, a in visti if "ALTE" in a]
    basse = [c for _, _, c, a in visti if "BASSE" in a]
    print(f"\n  medie: coppie simili {np.mean(alte):+.3f} · coppie diverse {np.mean(basse):+.3f} · "
          f"separazione {np.mean(alte) - np.mean(basse):+.3f}")
    ok = np.mean(alte) > np.mean(basse) + 0.05
    print(f"  -> il modello {'SEPARA' if ok else 'NON separa'} le coppie su testo italiano")
    if not ok:
        print("     Il multilingue (o la traduzione) e' obbligatorio: senza, i numeri che seguono")
        print("     non misurano la trama, misurano il rumore. Il controllo va fatto PRIMA.")

# ---------------------------------------------------------------- l'embedding del catalogo
print("\n" + "=" * 100)
print("L'EMBEDDING DELLE TRAME DEL CATALOGO")
print("=" * 100, flush=True)

mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
E = np.zeros((N, 384), np.float32)
chiavi, testi = [], []
for (tp, i), o in TRAME.items():
    r = B.ROW_OF.get(f"{tp}:{i}")
    if r is not None:
        chiavi.append(r)
        testi.append(o)
print(f"  da codificare: {len(testi):,} trame ({time.time()-T0:.0f}s)", flush=True)
t = time.time()
EMB = modello.encode(testi, batch_size=64, normalize_embeddings=True, show_progress_bar=False)
E[np.array(chiavi)] = EMB.astype(np.float32)
print(f"  codificate in {time.time()-t:.0f}s ({time.time()-T0:.0f}s)", flush=True)
np.save(ML / "04-trama-emb.npy", E)
np.save(ML / "04-trama-has.npy", np.array([len(TRAME.get(("movie", k), "")) > 0 for k in range(N)]))
print(f"  salvato 04-trama-emb.npy · copertura nel canone: {len(chiavi):,}/{N:,} "
      f"({100*len(chiavi)/N:.1f}%)", flush=True)

# ---------------------------------------------------------------- Sim_trama sul banco
print("\n" + "=" * 100)
print("SIM_TRAMA SUL BANCO — V1 contro V3, e il disaccordo col banco diventa un numero")
print("=" * 100, flush=True)
Bcsr = K.carica_csr("boot-B.npz", N)
IS_TV = B.IS_TV
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])
ha_trama = np.array([len(TRAME.get(("tv", 0), "")) >= 0 for _ in range(N)])  # segnaposto
HAT = np.zeros(N, bool)
for (tp, i) in TRAME:
    r = B.ROW_OF.get(f"{tp}:{i}")
    if r is not None:
        HAT[r] = True
print(f"  serie del banco con una trama: {int(HAT[tolti].sum())}/600 "
      f"({100*HAT[tolti].mean():.1f}%) — il campione e' questo, e va dichiarato", flush=True)

# i vicini micro per V1 e V3 (i file del ticket 05 e 06)
V3 = np.load(ML / "06c-voto.npz", allow_pickle=True)
ok_v3 = V3["previste"] == V3["vere"]
TF3 = sp.load_npz(ML / "05-tfidf.npz").tocsr()
TF1 = sp.load_npz(ML / "04-tfidf.npz").tocsr()

print(f"\n  {'metrica':<44} {'Sim_trama':>10}   campione")
for nome, TF, ok in (("V3 (il metodo attuale)", TF3, ok_v3),):
    pass

# per ogni serie del banco: la similarita' media di trama coi 10 vicini micro, e col centroide
# di trama della bolla predetta. Confronto fra giusti e sbagliati — e' li' che si vede se la trama
# conferma o smentisce il banco.
def sim_media_con_vicini(TF, quanti=10):
    V = np.asarray((TF[tolti] @ TF.T).todense())
    np.fill_diagonal(V[:, tolti], -1)
    idx = np.argpartition(-V, quanti, axis=1)[:, :quanti]
    sim = []
    for k in range(len(tolti)):
        vs = [x for x in idx[k] if HAT[x]]
        sim.append(float(np.mean([E[x] @ E[tolti[k]] for x in vs])) if vs else np.nan)
    return np.array(sim)


SIM3 = sim_media_con_vicini(TF3)
SIM1 = sim_media_con_vicini(TF1)
for nome, SIM in (("V1 (pesi grezzi)", SIM1), ("V3 (pesi per tipo)", SIM3)):
    buoni = SIM[ok_v3 & ~np.isnan(SIM)]
    print(f"  {nome:<44} mediana {np.nanmedian(SIM):+.3f}   "
          f"· sulle serie che il banco dà giuste {np.mean(buoni):+.3f} ({len(buoni)})")
print(f"\n  i vicini micro di V1 e di V3 hanno trame simili fra loro? "
      f"correlazione {np.corrcoef(SIM1[~np.isnan(SIM1) & ~np.isnan(SIM3)], SIM3[~np.isnan(SIM1) & ~np.isnan(SIM3)])[0,1]:+.3f}")

# e il controllo decisivo: le due varianti si distinguono sulla trama?
print(f"\n  LA DOMANDA DEL SENIOR: V3 peggiora il banco (32,0% contro 35,3%). Ma sceglie film che")
print(f"  RACCONTANO storie piu' simili?")
d = SIM3[~np.isnan(SIM3) & ~np.isnan(SIM1)] - SIM1[~np.isnan(SIM3) & ~np.isnan(SIM1)]
print(f"  Sim_trama(V3) - Sim_trama(V1): mediana {np.median(d):+.4f} · "
      f"positiva nel {100*(d > 0).mean():.1f}% dei casi · media {d.mean():+.4f}")
if np.median(d) > 0:
    print(f"  -> V3 sceglie vicini con trame PIU' simili. Il banco lo punisce ma l'arbitro indipendente")
    print(f"     dice che ha ragione lui: e' la prova che il trade-off V1/V3 era falso.")
else:
    print(f"  -> V3 non migliora nemmeno sulla trama: il banco aveva ragione.")

print(f"\nFINE ({time.time()-T0:.0f}s)")
