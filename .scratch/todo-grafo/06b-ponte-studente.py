"""06b-ponte-studente.py — tre cose che il ticket 06 ha reso necessarie.

1. IL TETTO DEL METODO. Si sceglie fra 336 bolle-serie, ma non tutte le 600 serie del banco hanno la
   propria bolla fra quelle 336 (il ticket 04 scarta le bolle sotto i 5 titoli). Quante ne restano
   fuori decide il massimo raggiungibile, e va scritto: un 63,7% su un tetto dell'80% non e' la
   stessa cosa di un 63,7% su un tetto del 100%.

2. IL PONTE CON LO STUDENTE DEI FILM, cioe' la ricetta esatta dell'esperto. Il ticket 06 l'ha
   deviata usando il voto diretto sulle bolle-film, e la deviazione va pagata: se il ponte non
   funziona, bisogna sapere se e' colpa del ponte o della deviazione. Qui si usa la Ridge
   `FX -> Cf` salvata da `inserimento` (quella che fa il 27,7% sui film).

3. COSENO O PRODOTTO SCALARE. Il ticket 05 ha dato 29,7% e il ticket 06 63,7% sulla **stessa**
   misura. La differenza e' una normalizzazione: `v·mu` contro `v·mu/||mu||`. Il secondo e' il
   coseno, ed e' quello che si vuole — ma la differenza fra i due numeri e' il doppio, quindi va
   misurata e capita, non nascosta.
"""
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
sys.path.insert(0, str(QUI.parent / "inserimento"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 104)
print("TICKET 06b — IL TETTO, IL PONTE VERO, E COSENO CONTRO PRODOTTO SCALARE")
print("=" * 104, flush=True)

TFIDF = sp.load_npz(ML / "04-tfidf.npz").tocsr()
C4 = np.load(ML / "04-centroidi.npz")
bolle_serie, bolle_film, sz, quota_tv = C4["bolle_serie"], C4["bolle_film"], C4["sz"], C4["quota_tv"]
N = TFIDF.shape[0]
mem = np.load(ML / "bolle-nitrile-V8.npy")
IS_TV = B.IS_TV
NB = len(sz)
q = np.load(ML / "bolle-nitrile-V8-triangolo.npz")
Ws = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
Ws = (Ws + Ws.T).tocsr()
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]

Bcsr = K.carica_csr("boot-B.npz", N)
serie = np.where(IS_TV & (np.asarray((Bcsr > 0).sum(1)).ravel() > 0))[0]
rng = np.random.default_rng(13)
tolti = rng.choice(serie, 600, replace=False)
vere = np.array([int(mem[i]) for i in tolti])

# ============================================================ 1. il tetto
print("\n1. IL TETTO DEL METODO")
print("-" * 104)
dentro = np.isin(vere, bolle_serie)
print(f"  serie la cui bolla vera e' fra le 336 candidate: {int(dentro.sum())}/600 "
      f"({100*dentro.mean():.1f}%)")
print(f"  -> il massimo raggiungibile dal voto diretto e' {100*dentro.mean():.1f}%, non il 100%")
fuori = np.where(~dentro)[0]
if len(fuori):
    dim = [int(sz[vere[k]]) for k in fuori]
    print(f"  le {len(fuori)} escluse stanno in bolle da {min(dim)} a {max(dim)} titoli "
          f"(mediana {int(np.median(dim))}) · a maggioranza film: "
          f"{int((quota_tv[vere[fuori]] <= 0.5).sum())}/{len(fuori)}")
print("  NON sono bolle minuscole: sono i casi CROSS-MEDIUM, dove una serie vive in una bolla di film.")
print("  Sono esattamente quelli che §1.B voleva recuperare col ponte — e il vincolo di medium li esclude.")

# ============================================================ 2. i tre voti
print("\n2. I TRE VOTI")
print("-" * 104)
# somme sparse + norme
def somme(gruppo):
    r_, c_, v_ = [], [], []
    for k, b in enumerate(gruppo):
        s = np.asarray(TFIDF[MEMBRI[b]].sum(0)).ravel()
        nz = np.nonzero(s)[0]
        r_.extend([k] * len(nz))
        c_.extend(nz.tolist())
        v_.extend(s[nz].tolist())
    return sp.csr_matrix((v_, (r_, c_)), shape=(len(gruppo), TFIDF.shape[1]), dtype=np.float32)


SS = somme(bolle_serie)
NORMA_S = np.sqrt(np.asarray(SS.multiply(SS).sum(1)).ravel()) + 1e-9
V = np.asarray((TFIDF[tolti] @ SS.T).todense())          # (600, 336) prodotto scalare grezzo
pos = {b: k for k, b in enumerate(bolle_serie)}

# il LOO si applica DOPO aver scelto la metrica, e la correzione e' una sola per entrambe:
# togliere il contributo della serie in esame dal centroide della sua bolla (fa 1 di coseno con se
# stessa, quindi si sottrae 1 dal numeratore e si divide per i membri rimasti)
DOT = V / np.maximum(np.array([len(MEMBRI[b]) for b in bolle_serie]), 1)[None, :]   # la media
COS = V / NORMA_S[None, :]                                                          # /||mu||
for k, i in enumerate(tolti):
    b = vere[k]
    if b in pos:
        kk = pos[b]
        nb = max(len(MEMBRI[b]) - 1, 1)
        DOT[k, kk] = (V[k, kk] - 1.0) / nb
        COS[k, kk] = (V[k, kk] - 1.0) / NORMA_S[kk]

# il ponte VERO: lo studente dei film
import colloca as CO
s = CO.carica()
print(f"  studente dei film caricato: coef {s['coef'].shape}, Pn {s['Pn'].shape} "
      f"({time.time()-T0:.0f}s)", flush=True)
Sf = s["Sf"]
p = (Sf[tolti] @ s["coef"].T + s["interc"]).astype(np.float32)
p = p / (np.linalg.norm(p, axis=1, keepdims=True) + 1e-9)
S1 = sp.csr_matrix((np.ones(N, np.float32), (np.arange(N), mem)), shape=(N, NB))
Agglo = np.asarray(S1.T @ s["Pn"])            # (NB, 128): la media dello spazio CF per bolla
S_film_bolla = Agglo @ p.T                                # (NB, 600) — P(b_film | s), grezzo
print(f"  P(bolla | serie) dallo studente: {S_film_bolla.shape} · "
      f"positivi {100*(S_film_bolla > 0).mean():.1f}%", flush=True)

# BB~ film->serie
BB = (S1.T @ Ws @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()
BBn = BB.multiply(1.0 / (np.asarray(abs(BB).sum(1)).ravel() + 1e-9)[:, None]).tocsr()
BF = BBn[bolle_film][:, bolle_serie].toarray()
# dal grezzo alla distribuzione: solo la parte positiva, e righe normalizzate
FF = np.clip(S_film_bolla[bolle_film], 0, None)
print(f"  P(b_film | s) dopo clip(0): righe non nulle "
      f"{int((FF.sum(0) > 0).sum())}/600 · media {FF.mean():.6f}", flush=True)
S_ponte_vero = (FF * (1.0 / (FF.sum(0)[None, :] + 1e-9))).T @ BF     # (600, 336)

vicini_di = {b: set(BB.getrow(b).indices.tolist()) for b in range(NB)}
def valuta(S, etichetta):
    a = np.array([int(bolle_serie[int(np.argmax(S[k]))]) for k in range(600)])
    ok = (a == vere)
    adj = np.array([a[k] in vicini_di.get(vere[k], set()) for k in range(600)])
    print(f"  {etichetta:<46} propria {int(ok.sum()):>3}/600 ({100*ok.mean():5.1f}%) · "
          f"adiacente {int(adj.sum()):>3} · scollegata {int((~ok & ~adj).sum()):>3}")
    return ok, a

print()
ok_cos, a_cos = valuta(COS, "diretto, COSENO (v·mu/||mu||)")
ok_dot, _ = valuta(DOT, "diretto, PRODOTTO SCALARE (v·mu), come §1.B.1")
ok_pon, a_pon = valuta(S_ponte_vero, "ponte VERO (studente dei film)")
for lam in (0.25, 0.5, 1.0, 2.0):
    valuta(COS + lam * S_ponte_vero / max(S_ponte_vero.max(), 1e-9), f"fusione coseno + {lam}*ponte")

print(f"\n  e i due voti su quante serie sono d'accordo: {int((a_cos == a_pon).sum())}/600 "
      f"({100*(a_cos == a_pon).mean():.1f}%)")
print(f"  il diretto ha ragione dove il ponte sbaglia: {int((ok_cos & ~ok_pon).sum())}")
print(f"  il ponte ha ragione dove il diretto sbaglia: {int((ok_pon & ~ok_cos).sum())}")
print(f"  sbagliano tutti e due:                       {int((~ok_cos & ~ok_pon).sum())}")

# ============================================================ 3. coseno contro prodotto scalare
print("\n3. COSENO CONTRO PRODOTTO SCALARE — perche' i due numeri differiscono del doppio")
print("-" * 104)
dim_vere = np.array([sz[b] for b in vere])
qs = [0, 25, 50, 75, 100]
print(f"  ||mu|| dei centroidi-serie: "
      + " · ".join(f"p{q}={np.percentile(NORMA_S, q):.2f}" for q in qs))
print(f"  la norma del centroide CRESCE con la dimensione della bolla (mediana membri per fascia):")
d_cent = np.array([len(MEMBRI[b]) for b in bolle_serie])
for lo, hi in ((0, 10), (10, 30), (30, 60), (60, 120), (120, 10**6)):
    m = (d_cent >= lo) & (d_cent < hi)
    if m.sum():
        print(f"    bolla da {lo:>3} a {hi if hi < 10**6 else '∞':>3} titoli: ||mu|| mediana "
              f"{np.median(NORMA_S[m]):.2f} · successi coseno {100*ok_cos[np.isin(vere, bolle_serie[m])].mean():5.1f}%"
              f" · prodotto scalare {100*ok_dot[np.isin(vere, bolle_serie[m])].mean():5.1f}%")
print(f"\n  Il prodotto scalare premia i centroidi con norma grande, cioe' le bolle GRANDI e diffuse:")
print(f"  e' un metro che non confronta cose confrontabili. Il coseno divide per la norma e toglie")
print(f"  quel premio. Sui {int(dentro.sum())} casi con la bolla in gara: "
      f"coseno {100*ok_cos[dentro].mean():.1f}% contro prodotto scalare {100*ok_dot[dentro].mean():.1f}%.")
np.savez_compressed(ML / "06b-ponte.npz", COS=COS, DOT=DOT, S_ponte_vero=S_ponte_vero,
                    tolti=tolti, vere=vere, dentro=dentro)
print(f"\nFINE ({time.time()-T0:.0f}s)")
