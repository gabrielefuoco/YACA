"""19-pesi.py — TICKET 19: i pesi appresi dai 3.417 legami curati.

I legami scritti a mano da un intenditore sono conoscenza reale. Come ARCHI nel grafo fanno male
(wormhole che distorcono la camminata). Qui si usano per **apprendere i pesi di combinazione**: 9
pesi scalari non negativi, uno per componente, che massimizzano il margine fra i legami curati e
negativi appaiati per popolarita'.

IL CONTEGGIO E' IL PUNTO: 3.417 vincoli su 9 gradi di liberta' non possono andare in overfitting.
E' il contrario di addestrare un embedding denso, che su 3.417 coppie su 60.000 titoli memorizza i
nodi dei legami.

PROTOCOLLO, e la sua trappola:
  * si apprende sui legami delle sorgenti a indice PARI (le stesse che stanno nel grafo);
  * si valuta sui 1.002 legami delle sorgenti a indice DISPARI (tenuti fuori);
  * LA CURATELA NON ENTRA FRA I PESI APPRESI: `K` e' costruita proprio da quei legami di training,
    quindi su di essi e' un predittore perfetto e l'ottimizzatore le darebbe peso infinito. `K`
    resta a peso fisso (il valore canonico) e si apprendono gli altri nove. E' la differenza fra
    «imparare dai legami» e «rileggere i legami».

Uso:  python .scratch/grafo-servibile/19-pesi.py
"""
import json, pathlib, sys, time
import numpy as np
import scipy.sparse as sp
from scipy.optimize import minimize

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

NS = (10, 50, 100, 500)
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()

COMP = ["CF", "CFst", "Kc", "B", "T", "TV", "KW", "DIR", "CAST"]
print("carico i componenti ...", flush=True)
CMP = K.Componenti(n)
C = CMP(60)
for nome in ("TV", "KW", "DIR", "CAST"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
C["K"] = K.carica_csr("boot-Kpari.npz", n)
VET = CMP.vettori_normalizzati()
print(f"  pronti ({time.time()-t0:.0f}s)", flush=True)


def sim(nome, a, b):
    """La similarita' di un componente fra due titoli (vettorializzata su due array di righe)."""
    if nome in VET:
        V = VET[nome]
        return np.einsum("ij,ij->i", V[a], V[b])
    A = C[nome].tocsr()
    v = np.asarray(A[a, b]).ravel()
    return v.astype(np.float64)


# ------------------------------------------------------------------ 1. i legami
d = json.loads((K.GOLD / "cross-merged.json").read_text(encoding="utf-8"))
src = d["sources"]
train, test = [], []
for i, s in enumerate(src):
    a = row_of.get(s["id"])
    if a is None:
        continue
    links = []
    for l in s["links"]:
        b = row_of.get(l["id"])
        if b is None or l["type"] == s["id"].split(":")[0]:
            continue
        links.append((a, b))
    (train if i % 2 == 0 else test).append((s["id"], links))
POS_T = np.array([p for _, ls in train for p in ls], np.int64)
print(f"  legami di training (sorgenti pari): {len(POS_T):,} da "
      f"{sum(1 for _, ls in train if ls)} sorgenti")
print(f"  legami di test (sorgenti dispari): {sum(len(ls) for _, ls in test):,}")

# ------------------------------------------------------------------ 2. i negativi appaiati
voti_f = np.where(~is_tv, np.asarray(K.voti(), np.float64), -1.0)
banda = np.digitize(voti_f, np.quantile(voti_f[~is_tv], np.linspace(0, 1, 51)))
PER_POS = 10
rng = np.random.default_rng(19)
per_banda = {}
for b in np.unique(banda):
    per_banda[int(b)] = np.where(banda == b)[0]
NEG_T = np.empty((len(POS_T), PER_POS, 2), np.int64)
for i, (a, b) in enumerate(POS_T):
    # l'appaiamento e' sulla popolarita' del BERSAGLIO, non della sorgente: le sorgenti sono
    # TUTTE serie (che hanno voti_f = -1 e cadono tutte nella banda 0), e appaiare su quelle
    # darebbe negativi pescati solo fra i film meno votati — un margine finto.
    sc = rng.choice(per_banda[int(banda[b])], PER_POS, replace=True)
    NEG_T[i, :, 0] = a
    NEG_T[i, :, 1] = sc
print(f"  negativi appaiati per popolarita': {NEG_T.shape[0]*NEG_T.shape[1]:,} "
      f"({PER_POS} per positivo)")
NEG_R = np.empty_like(NEG_T)                       # il controllo: negativi a caso
NEG_R[:, :, 0] = POS_T[:, 0][:, None]
NEG_R[:, :, 1] = rng.choice(np.where(~is_tv)[0], NEG_T.shape[:2], replace=True)

# ------------------------------------------------------------------ 3. le matrici di similarita'
print("calcolo le similarita' ...", flush=True)
SP = np.column_stack([sim(c, POS_T[:, 0], POS_T[:, 1]) for c in COMP])
SN = np.column_stack([sim(c, NEG_T[:, :, 0].ravel(), NEG_T[:, :, 1].ravel()) for c in COMP])
SN = SN.reshape(len(POS_T), PER_POS, len(COMP))
SR = np.column_stack([sim(c, NEG_R[:, :, 0].ravel(), NEG_R[:, :, 1].ravel()) for c in COMP])
SR = SR.reshape(len(POS_T), PER_POS, len(COMP))
print(f"  fatto ({time.time()-t0:.0f}s)")
print("")
print("  --- la separazione grezza: media per componente sui legami curati contro i negativi ---")
print(f"  {'componente':<10} {'positivi':>10} {'negativi':>10} {'casuali':>10} {'margine':>10}")
for i, c in enumerate(COMP):
    print(f"  {c:<10} {SP[:,i].mean():>10.4f} {SN[:,:,i].mean():>10.4f} {SR[:,:,i].mean():>10.4f} "
          f"{SP[:,i].mean()-SN[:,:,i].mean():>+10.4f}")

# ------------------------------------------------------------------ 4. l'apprendimento
def perdita(w, SNv, etichetta=""):
    """Logistica sul margine: per ogni positivo, il suo punteggio contro i suoi negativi."""
    sp_ = SP @ w
    sn = np.einsum("pkc,c->pk", SNv, w)
    z = sp_[:, None] - sn
    l = np.logaddexp(0.0, -z).mean()
    return l


def grad(w, SNv):
    sp_ = SP @ w
    sn = np.einsum("pkc,c->pk", SNv, w)
    z = sp_[:, None] - sn
    s = -1.0 / (1.0 + np.exp(z))
    g = np.zeros(len(w))
    g += (SP * s.mean(1)[:, None]).mean(0)
    g -= np.einsum("pkc,pk->c", SNv, s) / s.shape[0]
    return g


vincoli = [{"type": "eq", "fun": lambda w: w.sum() - 1.0, "jac": lambda w: np.ones(len(w))}]
limiti = [(0.0, 1.0)] * len(COMP)


def impara(SNv, etichetta):
    r = minimize(perdita, np.full(len(COMP), 1.0 / len(COMP)), args=(SNv,),
                 jac=grad, bounds=limiti, constraints=vincoli, method="SLSQP",
                 options={"maxiter": 500, "ftol": 1e-12})
    w = np.maximum(r.x, 0.0)
    w = w / w.sum()
    print(f"  {etichetta}: perdita {r.fun:.5f}")
    return w


print("")
print("=" * 100)
print("I PESI APPRESI (somma 1, non negativi, 9 incognite su "
      f"{len(POS_T):,} vincoli = {len(POS_T)//9} vincoli per incognita)")
print("=" * 100)
w_app = impara(SN, "negativi APPAIATI per popolarita'")
w_cas = impara(SR, "negativi CASUALI (il controllo)")

CANON = {"CF": 5.0, "CFst": 1.0, "Kc": 1.0, "B": 1.0, "T": 1.0}
massa = (1.0 - 0.60)
w_a_mano = np.array([CANON.get(c, 0.0) * massa / sum(CANON.values()) for c in COMP])

print("")
print(f"  {'componente':<10} {'appreso':>10} {'a mano':>10} {'differenza':>12}")
for i, c in enumerate(COMP):
    print(f"  {c:<10} {w_app[i]:>10.4f} {w_a_mano[i]:>10.4f} {w_app[i]-w_a_mano[i]:>+12.4f}")
print(f"  {'somma':<10} {w_app.sum():>10.4f} {w_a_mano.sum():>10.4f}")
print("")
print("  --- il controllo dei negativi casuali ---")
for i, c in enumerate(COMP):
    print(f"  {c:<10} appaiati {w_app[i]:>8.4f} · casuali {w_cas[i]:>8.4f} "
          f"· differenza {w_app[i]-w_cas[i]:>+8.4f}")
corr = float(np.corrcoef(w_app, w_cas)[0, 1])
print(f"  correlazione fra le due soluzioni: {corr:+.3f} "
      f"({'i pesi NON sono la popolarita' if corr > 0.5 else 'ATTENZIONE: le due soluzioni divergono'})")

# ------------------------------------------------------------------ 5. la valutazione sul TEST
print("")
print("=" * 100)
print("LA VALUTAZIONE — 1.002 legami di TEST, mai visti dall'apprendimento")
print("=" * 100)
SOGG, BERS, US, COL = [], [], [], []
for _, ls in test:
    for a, b in ls:
        SOGG.append(a); BERS.append(b)
SOGG, BERS = np.array(SOGG), np.array(BERS)
US = np.unique(SOGG)
col_of = {int(u): i for i, u in enumerate(US)}
COL = np.array([col_of[int(x)] for x in SOGG])
print(f"  {len(BERS):,} legami da {len(US)} sorgenti")


def valuta(w, etichetta, con_curatela=True):
    pesi = {c: float(w[i]) for i, c in enumerate(COMP) if w[i] > 1e-6}
    M = K.costruisci(C, pesi, wc=0.60 if con_curatela else 0.0, beta=0.50)
    EC = np.zeros((n, len(US)), np.float32)
    EC[US, np.arange(len(US))] = 1.0
    XC = K.rwr(M, EC, alpha=0.70)
    XC[US, np.arange(len(US))] = -1e9
    r = K.recall_curato(K.ranghi(XC), BERS, COL, NS)
    K.stampa(etichetta, r)
    return r


r_mano = valuta(w_a_mano, "pesi A MANO (la ricetta canonica) + curatela 0,60")
r_app = valuta(w_app, "pesi APPRESI + curatela 0,60")
r_cas = valuta(w_cas, "pesi appresi sui negativi CASUALI + curatela")
r_ind = K.ranghi(np.tile(np.arange(n, dtype=np.int32)[:, None], (1, len(US))))
K.stampa("CONTROLLO ordine di indice", K.recall_curato(r_ind, BERS, COL, NS))
print("")
print(f"  {'':<40} " + " ".join(f"{'@' + str(N):>9}" for N in NS))
for et, r in (("appresi - a mano", r_app), ("casuali - a mano", r_cas)):
    print(f"  {et:<40} " + " ".join(f"{r[N]-r_mano[N]:>+9.2f}" for N in NS))
print(f"\nFINE ({time.time()-t0:.0f}s)")
