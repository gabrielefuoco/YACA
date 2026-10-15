"""05-voto-diretto.py — TICKET 05: il voto 1 (matching diretto sui centroidi) sul banco vero.

La domanda: il matching diretto contro i centroidi delle bolle-serie (§1.B.1) porta il 2,2% delle
serie nella propria bolla piu' in alto? E di quanto?

Il banco e' **quello del ticket 04 di `inserimento`**, riprodotto identico: `serie = is_tv & grado>0`
su `boot-B.npz`, seed 13, 600 serie. Non se ne cambia una virgola, altrimenti il confronto col 2,2%
e con l'1,3% non vale niente.

DUE PRECAUZIONI, e cambiano il risultato.

1. **Leave-one-out.** Il banco non toglie le serie dal catalogo: nasconde il loro COMPORTAMENTO, non
   i metadati. Quindi la serie in esame **fa parte** del centroide della propria bolla, e confrontarsi
   con quel centroide e' un autoscoring. Un titolo nuovo non e' membro di nessuna bolla: la
   simulazione onesta toglie la serie dal centroide della SUA bolla prima di leggere i punteggi. Le
   altre bolle non la contengono e non vanno toccate.
   Con pesi uniformi: `(somma·v_i − 1) / (n − 1)`. Con pesi `w`: `(somma_w·v_i − w_i) / (1 − w_i)`.

2. **Il medium si rispetta.** Si sceglie fra le sole bolle-serie: nel prodotto i film e le serie sono
   due cataloghi separati, ed e' la stessa scelta del ticket 04 di `inserimento` (`v[~IS_TV] = -9`).
   Ma si misura ANCHE senza il vincolo, per sapere quanto pesa.

Le due pesature dei membri (ticket 04) si misurano entrambe e si sceglie dopo.
"""
import pathlib
import sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
from graph import bubbles as B
from graph import canon as K

T0 = time.time()
ML = K.ML
print("=" * 104)
print("TICKET 05 — IL VOTO DIRETTO: coseno fra i metadati di una serie e i centroidi delle bolle")
print("=" * 104, flush=True)

# ---------------------------------------------------------------- dati
TFIDF = sp.load_npz(K.A("04-tfidf.npz")).tocsr()
C4 = np.load(K.A("04-centroidi.npz"))
bolle_serie, bolle_film, sz, peso_interno = C4["bolle_serie"], C4["bolle_film"], C4["sz"], C4["peso_interno"]
N = TFIDF.shape[0]
mem = np.load(K.A("bolle-nitrile-V8.npy"))
IS_TV = B.IS_TV
q = np.load(K.A("bolle-nitrile-V8-triangolo.npz"))
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (Ws + Ws.T).tocsr()

ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(len(sz) + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(len(sz))]
PESO = np.zeros(N, np.float32)          # peso interno normalizzato, per bolla
for b in bolle_serie:
    m_ = MEMBRI[b]
    p = np.asarray(Ws[m_][:, m_].sum(1)).ravel() + 1e-6
    PESO[m_] = p / p.sum()
print(f"  caricati: TF-IDF {TFIDF.shape}, {len(bolle_serie)} bolle-serie, {len(bolle_film)} bolle-film, "
      f"V8 con {len(sz):,} bolle ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- le somme per bolla
SOMMA = {}
for nome_p in ("uniforme", "grado"):
    M = np.zeros((len(bolle_serie), TFIDF.shape[1]), np.float32)
    for k, b in enumerate(bolle_serie):
        m_ = MEMBRI[b]
        sub = TFIDF[m_]
        if nome_p == "grado":
            M[k] = np.asarray(sub.multiply(PESO[m_][:, None]).sum(0)).ravel()
        else:
            M[k] = np.asarray(sub.sum(0)).ravel() / len(m_)
    SOMMA[nome_p] = M
    print(f"  somme per bolla '{nome_p}': {M.shape} ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- il banco, identico al ticket 04
Bcsr = K.carica_csr("boot-B.npz", N)
grado_b = np.asarray((Bcsr > 0).sum(1)).ravel()
serie = np.where(IS_TV & (grado_b > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
print(f"\n  banco: {len(serie):,} serie con comportamento in B · estratte {len(tolti):,} "
      f"(seed 13, come il ticket 04 di inserimento)", flush=True)

# ---------------------------------------------------------------- la mappa delle bolle
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, len(sz)))
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
vicini_di = {b: set(BB.getrow(b).indices.tolist()) for b in range(len(sz))}
NB = len(sz)
BASE_OWN = 1.0 / NB
BASE_ADJ = float(BB.nnz) / (NB * (NB - 1) / 2)
print(f"  mappa: {BB.nnz:,} adiacenze", flush=True)
print(f"  TASSI BASE: propria bolla {100*BASE_OWN:.3f}% · adiacente {100*BASE_ADJ:.1f}%", flush=True)

# ---------------------------------------------------------------- la misura
pos = {b: k for k, b in enumerate(bolle_serie)}


def misura(nome_p, con_medium=True):
    S = np.asarray(TFIDF[tolti] @ SOMMA[nome_p].T)      # (600, n bolle-serie)
    stessa = vicina = lontana = 0
    righe = []
    for k, i in enumerate(tolti):
        b_vera = int(mem[i])
        v = S[k].copy()
        # leave-one-out sul centroide della sua bolla
        if b_vera in pos:
            kk = pos[b_vera]
            if nome_p == "uniforme":
                n_b = len(MEMBRI[b_vera])
                v[kk] = (S[k, kk] * n_b - 1.0) / max(n_b - 1, 1)
            else:
                w = float(PESO[i])
                v[kk] = (S[k, kk] - w) / max(1.0 - w, 1e-6)
        j = int(np.argmax(v))
        b_trovata = int(bolle_serie[j])
        if b_trovata == b_vera:
            stessa += 1
        elif b_trovata in vicini_di.get(b_vera, set()):
            vicina += 1
        else:
            lontana += 1
        righe.append((i, b_vera, b_trovata, float(v[j])))
    return stessa, vicina, lontana, righe


ESITI = {}
for nome_p in ("uniforme", "grado"):
    stessa, vicina, lontana, righe = misura(nome_p)
    ESITI[nome_p] = (stessa, vicina, lontana, righe)
    print(f"\n  VOTO DIRETTO '{nome_p}' (600 serie, medium rispettato):")
    print(f"     ** torna nella PROPRIA bolla:      {stessa:>4}/600 ({100*stessa/600:.1f}%) "
          f"· lift {100*stessa/600/(100*BASE_OWN):.0f}x **")
    print(f"     ** cade in una bolla ADIACENTE:    {vicina:>4}/600 ({100*vicina/600:.1f}%) "
          f"· lift {100*vicina/600/(100*BASE_ADJ):.2f}x **")
    print(f"     ** cade in una bolla non collegata:{lontana:>4}/600 ({100*lontana/600:.1f}%) **",
          flush=True)

# ---------------------------------------------------------------- confronto con le baseline
print("\n" + "=" * 104)
print("CONFRONTO CON LE BASELINE MISURATE (ticket 04 e 06 di `inserimento`, sulla partizione V7)")
print("=" * 104)
print(f"  studente dei FILM applicato alle serie:    2,2% nella propria bolla · 1,8% scollegate")
print(f"  studente delle SERIE:                      1,3% · 0,2%")
print(f"  caso:                                      {100*BASE_OWN:.3f}%")
for nome_p in ("uniforme", "grado"):
    stessa, vicina, lontana, _ = ESITI[nome_p]
    print(f"  VOTO DIRETTO '{nome_p}':                  {100*stessa/600:.1f}% · "
          f"{100*lontana/600:.1f}% scollegate")
print("  (le baseline sono su V7, 1.617 bolle; qui V8, 1.625: la differenza e' dello 0,5%)")

print("\n  con il contratto di tasso base del ticket 03:")
ene = None
for nome_p in ("uniforme", "grado"):
    _, _, _, righe = ESITI[nome_p]
    pred = np.array([r[2] for r in righe])
    vero = np.array([r[1] for r in righe])
    K.stampa_tasso(f"voto diretto '{nome_p}' (permutazione)", pred, vero)
print(f"  e il caso giusto per questa misura, che sceglie fra {len(bolle_serie)} bolle-serie:")
print(f"    1/{len(bolle_serie)} = {100/len(bolle_serie):.3f}%  (fra tutte le {NB:,} bolle: "
      f"{100*BASE_OWN:.3f}%)")
for nome_p in ("uniforme", "grado"):
    stessa = ESITI[nome_p][0]
    print(f"    voto diretto '{nome_p}': lift {100*stessa/600/(100/len(bolle_serie)):.0f}x "
          f"sulle bolle-serie · {100*stessa/600/(100*BASE_OWN):.0f}x su tutte")

# ---------------------------------------------------------------- chi sbaglia, e dove
print("\n" + "=" * 104)
print("CHI SBAGLIA")
print("=" * 104)
PQ = K.ROOT / ".cache" / "tmdb"
TIT = np.array([""] * N, dtype=object)
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(PQ / f, columns=["id", col])
    for i, t in zip(d["id"], d[col]):
        r = B.ROW_OF.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)
_, _, _, righe = ESITI["uniforme"]
sbagli = [r for r in righe if r[1] != r[2]]
giusti = [r for r in righe if r[1] == r[2]]
print(f"  {len(sbagli)} sbagli su 600 · {len(giusti)} giusti. I primi dieci sbagli:")
for i, b_vera, b_tro, sc in sbagli[:10]:
    print(f"    {TIT[i][:36]:<38} vera {b_vera:>4} ({int(sz[b_vera]):>3} tit.) → "
          f"trovata {b_tro:>4} ({int(sz[b_tro]):>3}) · coseno {sc:.3f}")
print(f"\n  e i primi cinque giusti, per controllo:")
for i, b_vera, b_tro, sc in giusti[:5]:
    print(f"    {TIT[i][:36]:<38} bolla {b_vera:>4} ({int(sz[b_vera]):>3} tit.) · coseno {sc:.3f}")

# ---------------------------------------------------------------- di che dimensione sono le bolle giuste
print("\n" + "=" * 104)
print("DOVE RIESCE — la dimensione della bolla conta?")
print("=" * 104)
dim_vera = np.array([sz[r[1]] for r in righe])
ok = np.array([r[1] == r[2] for r in righe])
for lo, hi in ((0, 10), (10, 30), (30, 60), (60, 120), (120, 10**6)):
    m = (dim_vera >= lo) & (dim_vera < hi)
    if m.sum():
        print(f"  bolla vera da {lo:>3} a {hi if hi < 10**6 else '∞':>3} titoli: "
              f"{int(ok[m].sum()):>4}/{int(m.sum()):>4} ({100*ok[m].mean():.1f}%)")
print(f"\nFINE ({time.time()-T0:.0f}s)")
