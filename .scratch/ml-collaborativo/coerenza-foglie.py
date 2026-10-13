"""coerenza-foglie.py — COERENZA vs PORTATA. Due cose diverse, misurate separate.

ERRORE CHE QUESTO SCRIPT CORREGGE. In qualita-foglie.py ho misurato "due film della foglia
compaiono nella stessa cronologia piu' del caso?". Quella misura mescola DUE cose:
   COERENZA   i titoli c'entrano l'uno con l'altro        (somiglianza, indipendente dal volume)
   PORTATA    abbastanza persone li hanno visti           (volume, quanti utenti)
Una foglia di due film di nicchia coerenti ha co-occorrenza bassa: il numero la bocciava
senza motivo. Qui le due cose si misurano separate, e si incrociano.

  COERENZA = somiglianza media fra i membri nello spazio Pc centrato, contro un nullo di
             gruppi casuali della stessa dimensione. E' la domanda "questi titoli c'entrano?"
  PORTATA  = quanti utenti distinti hanno >=2 membri nella propria cronologia (MovieLens)

Uso: python coerenza-foglie.py [albero.json] [n_foglie_da_leggere]
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd

t0 = time.time()
ROOT = pathlib.Path(".").resolve()
ML = ROOT / ".cache" / "movielens"
NOME = sys.argv[1] if len(sys.argv) > 1 else "albero.json"
DA_LEGGERE = int(sys.argv[2]) if len(sys.argv) > 2 else 8

z = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
Pc, tmdb, tipo = z["Pc"], z["tmdb"], z["tipo"]
keys = [f"{t}:{int(i)}" for t, i in zip(tipo, tmdb)]
row_of = {k: r for r, k in enumerate(keys)}
n = len(keys)
is_tv = (tipo == "tv")
Q = Pc.astype(np.float64).copy()
Q[~is_tv] -= Pc[~is_tv].mean(0)
Q[is_tv] -= Pc[is_tv].mean(0)
Pcn = Q / (np.linalg.norm(Q, axis=1, keepdims=True) + 1e-9)

TIT = {}
mv = pd.read_parquet(ROOT / ".cache" / "tmdb" / "movies.parquet", columns=["id", "title"])
tv = pd.read_parquet(ROOT / ".cache" / "tmdb" / "tv.parquet", columns=["id", "name"])
for typ, df, col in (("movie", mv, "title"), ("tv", tv, "name")):
    for i, t in zip(df["id"], df[col]):
        TIT[f"{typ}:{int(i)}"] = str(t)

al = json.loads((ML / NOME).read_text(encoding="utf-8"))
foglie = []
for f in al["foglie"]:
    mem = np.array([row_of[k] for k in f["members"] if k in row_of])
    if len(mem):
        foglie.append(mem)
h = len(foglie)
dim = np.array([len(m) for m in foglie])
print(f"albero «{NOME}»: {h:,} foglie · mediana {int(np.median(dim))} · max {dim.max()}")

# ---------- COERENZA: somiglianza media fra i membri, contro gruppi casuali ----------
print("\ncoerenza (somiglianza di contenuto fra i membri)...")
rng = np.random.default_rng(4)
coer = np.zeros(h)
coer_null = np.zeros(h)
for i, mem in enumerate(foglie):
    V = Pcn[mem]
    if len(mem) > 1:
        G = V @ V.T
        coer[i] = (G.sum() - np.trace(G)) / (len(mem) * (len(mem) - 1))
    # nullo: stesso numero di titoli, pescati a caso, con lo stesso mix di medium
    q = min(len(mem), 400)
    idx_cas = []
    for _ in range(q):
        idx_cas.append(rng.choice(np.where(is_tv)[0]) if rng.random() < is_tv[mem].mean()
                       else rng.choice(np.where(~is_tv)[0]))
    W = Pcn[np.array(idx_cas)]
    if len(W) > 1:
        G = W @ W.T
        coer_null[i] = (G.sum() - np.trace(G)) / (len(W) * (len(W) - 1))
print(f"  coerenza media {coer.mean():.3f} · titoli pescati a caso {coer_null.mean():.3f} "
      f"-> le foglie stanno {coer.mean()/max(coer_null.mean(),1e-9):,.0f} volte sopra il caso "
      f"({time.time()-t0:.0f}s)")
print("  NOTA: il nullo e' ~0 per costruzione (lo spazio e' centrato), quindi qui NON si usa un")
print("  rapporto: si legge la coerenza assoluta. Un 'lift' su un nullo nullo e' un numero finto.")

# ---------- PORTATA: utenti distinti che hanno >=2 membri ----------
print("portata (cronologie MovieLens che toccano la foglia)...")
links = pd.read_csv(ML / "ml-32m" / "links.csv")
ml2row = {}
for mid, tid in zip(links["movieId"], links["tmdbId"]):
    if pd.isna(tid):
        continue
    r = row_of.get(f"movie:{int(tid)}")
    if r is not None:
        ml2row[int(mid)] = r
rr = pd.read_parquet(ML / "ratings-puliti.parquet")
rr["row"] = rr["movieId"].map(ml2row)
rr = rr.dropna(subset=["row"])
rr["row"] = rr["row"].astype(np.int64)
foglia_di_riga = np.full(n, -1, np.int64)
for i, mem in enumerate(foglie):
    foglia_di_riga[mem] = i

ut = rr["userId"].values
righe = rr["row"].values
o = np.argsort(ut, kind="stable")
ut, righe = ut[o], righe[o]
bordi = np.flatnonzero(np.r_[True, ut[1:] != ut[:-1]])
utenti_portata = np.zeros(h, np.int64)
eventi = np.zeros(h)
for a, b in zip(bordi, np.r_[bordi[1:], len(ut)]):
    et = foglia_di_riga[righe[a:b]]
    et = et[et >= 0]
    if len(et) < 2:
        continue
    u, c = np.unique(et, return_counts=True)
    m = c >= 2
    utenti_portata[u[m]] += 1
    eventi[u[m]] += c[m] * (c[m] - 1) // 2
# quanti membri della foglia esistono in MovieLens
presenti = np.array([int((np.bincount(righe, minlength=n)[m] > 0).sum()) for m in foglie])
print(f"  utenti con >=2 membri: mediana {int(np.median(utenti_portata))} · "
      f"foglie mai toccate: {int((utenti_portata==0).sum())} ({time.time()-t0:.0f}s)")

# ---------- LA TABELLA ----------
FASCE = ((2, 5), (6, 10), (11, 20), (21, 40), (41, 80), (81, 150), (151, 10 ** 9))
print("")
print("=" * 104)
print(f"{'dimensione':<12} {'foglie':>7} {'COERENZA':>9} {'a caso':>8} "
      f"{'PORTATA (utenti con >=2)':>26} {'mai toccate':>12} {'% membri in ML':>15}")
print("=" * 104)
for lo, hi in FASCE:
    m = (dim >= lo) & (dim <= hi)
    if m.sum() == 0:
        continue
    lab = f"{lo}-{hi}" if hi < 10 ** 9 else f"{lo}+"
    print(f"{lab:<12} {int(m.sum()):>7} {coer[m].mean():>9.3f} {coer_null[m].mean():>8.3f} "
          f"{np.median(utenti_portata[m]):>26,} {100*(utenti_portata[m]==0).mean():>11.1f}% "
          f"{100*(presenti[m]/dim[m]).mean():>14.0f}%")

# ---------- IL QUADRANTE: coerenti ma poco raggiungibili ----------
print("")
print("=" * 104)
print("IL QUADRANTE CHE CONTA")
print("=" * 104)
soglia_c = float(np.median(coer))
soglia_p = float(np.percentile(utenti_portata[utenti_portata > 0], 25))
q = (coer >= soglia_c) & (utenti_portata <= soglia_p)
q2 = (coer < soglia_c) & (utenti_portata <= soglia_p)
print(f"  soglie: coerenza >= {soglia_c:.3f} (mediana) · portata <= {soglia_p:,.0f} utenti (25°ile)")
print(f"  coerenti MA poco raggiungibili : {int(q.sum()):>4} foglie ({100*q.mean():4.1f}%) "
      f"· dimensione mediana {int(np.median(dim[q]))} · {100*(presenti[q]/dim[q]).mean():.0f}% dei membri in MovieLens")
print(f"  incoerenti E poco raggiungibili: {int(q2.sum()):>4} foglie ({100*q2.mean():4.1f}%) "
      f"· dimensione mediana {int(np.median(dim[q2]))} · {100*(presenti[q2]/dim[q2]).mean():.0f}% dei membri in MovieLens")
q3 = (coer >= soglia_c) & (utenti_portata > soglia_p)
print(f"  coerenti e raggiungibili      : {int(q3.sum()):>4} foglie ({100*q3.mean():4.1f}%)")
q4 = (coer < soglia_c) & (utenti_portata > soglia_p)
print(f"  incoerenti ma raggiungibili   : {int(q4.sum()):>4} foglie ({100*q4.mean():4.1f}%) <- qui la portata c'e': sono da sistemare")
print("")
print("  correlazione coerenza/portata:",
      f"Spearman {np.corrcoef(np.argsort(np.argsort(coer)), np.argsort(np.argsort(utenti_portata)))[0,1]:+.3f}")

# ---------- LEGGERE LE FOGLIE PICCOLE ----------
piccole = np.argsort(dim)[:max(1, int((dim <= 6).sum()))]
piccole = [i for i in piccole if dim[i] >= 2]
scelte = [piccole[int(k)] for k in np.linspace(0, len(piccole) - 1, min(DA_LEGGERE, len(piccole))).astype(int)]
print("")
print("=" * 104)
print(f"DA LEGGERE: {len(scelte)} foglie PICCOLE (è qui che si vede se sono coerenti o no)")
print("=" * 104)
for i in scelte:
    mem = foglie[i]
    coppie = len(mem) * (len(mem) - 1) // 2
    print(f"\n  foglia {i} · {dim[i]} titoli · coerenza {coer[i]:.3f} (titoli a caso: {coer_null[i]:.3f})"
          f" · {utenti_portata[i]} utenti con >=2")
    for r in mem:
        print(f"      {'serie' if is_tv[r] else 'film '}  {TIT.get(keys[r],'?')}")
print(f"\n({time.time()-t0:.0f}s)")
