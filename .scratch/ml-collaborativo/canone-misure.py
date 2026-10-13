"""canone-misure.py — TUTTE LE MISURE CHIAVE SUL GRAFO CANONICO, IN UN SOLO POSTO.

1. PRODOTTO  — 1.000 utenti di VERIFICA, catalogo film. Deve riprodurre 29,61/63,35/87,86:
               se non li riproduce, l'implementazione canonica e' sbagliata e si smette qui.
2. CURATO    — camminata (mascherata e non), teacher veri, controlli, e il riferimento del
               report 41 rifatto sul grafo canonico (finora il confronto era falso).
3. CATALOGHI — la fusione sui due cataloghi: il +75% sul catalogo serie regge?
"""
import pathlib, sys, time
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]
print(f"titoli: {n:,} · film: {len(IDX_FILM):,} · serie: {int(is_tv.sum()):,}")

print("componenti ...", flush=True)
CMP = K.Componenti(n)
C = CMP(60)
print(f"  pronti ({time.time()-t0:.0f}s)", flush=True)

PESI = {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}
M = K.costruisci(C, PESI, wc=0.60, beta=0.50)
print(f"grafo canonico pronto: {M.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

# =====================================================================  1. PRODOTTO
print("")
print("=" * 100)
print("1. PRODOTTO — 1.000 utenti di VERIFICA, catalogo film  (atteso 29,61 / 63,35 / 87,86)")
print("=" * 100)
PROF, ORO = K.banco_prodotto(row_of, quanti=1000, parte="verifica")
US = np.array(list(PROF.keys()))
print(f"  {len(US)} utenti ({time.time()-t0:.0f}s)", flush=True)
E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0
X = K.rwr(M, E, alpha=0.30)
for j, u in enumerate(US):
    X[PROF[u], j] = -1e9
R = K.ranghi(X)
r_prod = K.recall_film(R, US, PROF, ORO, IDX_FILM)
K.stampa("CAMMINATA CANONICA (CF5 k60 beta0.5 wc0.60)", r_prod)
print(f"  ({time.time()-t0:.0f}s)", flush=True)

# =====================================================================  2. CURATO
print("")
print("=" * 100)
print("2. CURATO — 1.002 legami cross-medium, 249 sorgenti (tutte SERIE)")
print("=" * 100)
SOGG, BERS, USC, COLC = K.banco_curato(row_of)
print(f"  {len(BERS):,} legami da {len(USC)} sorgenti · serie {int(is_tv[USC].sum())} · film {int((~is_tv[USC]).sum())}")
EC = np.zeros((n, len(USC)), np.float32)
EC[USC, np.arange(len(USC))] = 1.0

XC = K.rwr(M, EC, alpha=0.70)
r_unmask = K.recall_curato(K.ranghi(XC), BERS, COLC)
K.stampa("camminata alpha 0.70 — sorgente NON mascherata (come il report 57)", r_unmask)
XCm = XC.copy()
XCm[USC, np.arange(len(USC))] = -1e9
Rc = K.ranghi(XCm)
r_walk = K.recall_curato(Rc, BERS, COLC)
K.stampa("camminata alpha 0.70 — sorgente mascherata (protocollo corretto)", r_walk)

VET = CMP.vettori_normalizzati()
teacher = {}
for nome in ("CF", "CFst", "Kc"):
    teacher[nome] = VET[nome] @ VET[nome][USC].T
# la co-visione come teacher: i vicini diretti
Badj = K.normalizza(C["B"] + C["B"].T)
teacher["co-visione"] = np.asarray(Badj[USC].todense()).T
print("")
print("  norma dei teacher sulle sorgenti (CF dev'essere 0: le sorgenti sono serie)")
for nome, T in teacher.items():
    print(f"    {nome:<12} {np.linalg.norm(T, axis=0).mean():.4f}")

# i controlli: teacher senza informazione
rnd = np.random.default_rng(3)
R_ind = np.tile(np.arange(n, dtype=np.int32)[:, None], (1, len(USC)))
R_rand = np.tile(rnd.permutation(n).astype(np.int32)[:, None], (1, len(USC)))

print("")
print("  --- teacher da soli ---")
for nome, T in teacher.items():
    K.stampa(f"teacher SOLO — {nome}", K.recall_curato(K.ranghi(T), BERS, COLC))
K.stampa("teacher SOLO — CONTROLLO ordine di indice", K.recall_curato(R_ind, BERS, COLC))
K.stampa("teacher SOLO — CONTROLLO casuale", K.recall_curato(R_rand, BERS, COLC))

print("")
print("  --- fusioni: camminata + teacher ---")
ris = {}
for nome, T in list(teacher.items()) + [("INDICE(ctrl)", R_ind), ("CASUALE(ctrl)", R_rand)]:
    Rk = K.ranghi(T) if T.dtype != np.int32 else T
    for k0 in (60, 3000):
        Rr = K.ranghi(3.0 / (k0 + Rc) + 0.5 / (k0 + Rk))
        d = K.recall_curato(Rr, BERS, COLC)
        ris[f"{nome} k{k0}"] = d
        K.stampa(f"RRF camminata+{nome} k={k0}", d)

print("")
print("  --- il riferimento del report 41 (3,0/0,5 · k=3000 · grafo VECCHIO: 18,90% @10 · 36,90% @100) ---")
Rr = K.ranghi(3.0 / (3000 + Rc) + 0.5 / (3000 + K.ranghi(teacher["CFst"])))
K.stampa("RRF camminata+CFst k=3000 (il migliore con teacher VERO)", K.recall_curato(Rr, BERS, COLC))
print(f"  ({time.time()-t0:.0f}s)", flush=True)

# =====================================================================  3. CATALOGHI
print("")
print("=" * 100)
print("3. I DUE CATALOGHI — la fusione regge il +75% sul catalogo serie?")
print("=" * 100)
CASI = K.banco_trakt(row_of)
print(f"  {len(CASI)} utenti del banco ({time.time()-t0:.0f}s)", flush=True)
PF = {i: c["pf"] for i, c in enumerate(CASI)}
GF = {i: c["gf"] for i, c in enumerate(CASI)}
PS = {i: c["ps"] for i, c in enumerate(CASI)}
GS = {i: c["gs"] for i, c in enumerate(CASI)}


def attiva(semi_di, alpha, lotto=120):
    chiavi = list(semi_di)
    X = np.zeros((n, len(chiavi)), np.float32)
    for i in range(0, len(chiavi), lotto):
        ch = chiavi[i:i + lotto]
        E = np.zeros((n, len(ch)), np.float32)
        for j, u in enumerate(ch):
            E[semi_di[u], j] = 1.0
        Y = K.rwr(M, E, alpha)
        for j, u in enumerate(ch):
            Y[semi_di[u], j] = -1e9
        X[:, i:i + len(ch)] = Y
    return X, chiavi


Xf, chf = attiva(PF, 0.30)
Xs, chs = attiva(PS, 0.30)
print(f"  camminate fatte ({time.time()-t0:.0f}s)", flush=True)


def teacher_profilo(nome, semi_di, chiavi):
    V = VET[nome]
    T = np.zeros((n, len(chiavi)), np.float32)
    for j, u in enumerate(chiavi):
        T[:, j] = V @ V[semi_di[u]].T.mean(1)
    return T


Tf_cf = teacher_profilo("CF", PF, chf)
Tf_st = teacher_profilo("CFst", PF, chf)
Tf_kc = teacher_profilo("Kc", PF, chf)
Ts_st = teacher_profilo("CFst", PS, chs)
Ts_kc = teacher_profilo("Kc", PS, chs)

for etichetta, (X, ch, cat, gold, T1, T2) in {
    "CATALOGO FILM (semi film)": (Xf, chf, ~is_tv, GF, Tf_cf, Tf_kc),
    "CATALOGO SERIE (semi serie)": (Xs, chs, is_tv, GS, Ts_st, Ts_kc),
    "CATALOGO SERIE (semi FILM)": (Xf, chf, is_tv, GS, Tf_st, Tf_kc),
    "CATALOGO FILM (semi serie)": (Xs, chs, ~is_tv, GF, Tf_st, Ts_kc),
}.items():
    print("")
    print(f"  --- {etichetta} ---")
    Rs = K.ranghi(X, cat)
    K.stampa("camminata sola", K.recall_catalogo(Rs, gold, ch, cat))
    for nomeT, T in (("comportamento/CFst", T1), ("metadati", T2)):
        Rk = K.ranghi(T, cat)
        K.stampa(f"teacher SOLO — {nomeT}", K.recall_catalogo(Rk, gold, ch, cat))
        for k0 in (60, 3000):
            Rr = K.ranghi(3.0 / (k0 + Rs) + 0.5 / (k0 + Rk), cat)
            K.stampa(f"RRF camminata+{nomeT} k={k0}", K.recall_catalogo(Rr, gold, ch, cat))

print(f"\nFINE ({time.time()-t0:.0f}s)")
