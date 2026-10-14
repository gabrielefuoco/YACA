"""02-09-varianti.py — i ticket 02..09, RIPARTIBILE.

Il primo giro e' morto durante V1 **senza traceback**: un kill duro, non un'eccezione. Da allora:
  · ogni passo stampa la memoria del processo;
  · i componenti ricostruiti si cachano su disco;
  · la matrice per Leiden si costruisce solo sul triangolo (`archi_leiden`), non simmetrica intera;
  · ogni variante gia' salvata viene saltata, e i passi costosi non si ripetono.
"""
import pathlib
import sys
import time

import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import bolle as B
import canone as K

ML = K.ML


def gia(tag):
    return (ML / f"bolle-nitrile-{tag}.npy").exists()


ORDINE = ["V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7",
          "V8-CPM0.02", "V8-RB60", "V8-RB200"]

print("=" * 110)
print("bolle-nitrile — ticket 02..09")
print("=" * 110, flush=True)

# ============================================================ 1. i componenti
print("\n### 1. I COMPONENTI ###", flush=True)
C_vecchi = None
if not gia("V0"):
    print("-- gli originali (senza shrinkage L2, solo per il controllo V0)", flush=True)
    C_vecchi = {}
    base = K.Componenti(B.N)(B.TOPK)
    for nome in ("CF", "CFst", "B", "T", "K"):
        C_vecchi[nome] = base[nome]
    for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
        C_vecchi[nome] = K.carica_csr(f"nuovo-{nome}.npz", B.N).astype(np.float32)
    B.mem("originali")
else:
    print("-- V0 gia' fatto: salto gli originali", flush=True)

print("\n-- i ricostruiti con SHRINKAGE L2 (D3) e min_sim 0.12 su KW/CAST", flush=True)
INSIEMI = B.costruisci_insiemi()
C = B.carica_componenti(con_shrinkage=True, min_sim_kw=0.12, min_sim_cast=0.12,
                        ricostruisci="cache", insiemi=INSIEMI)
B.mem("componenti nuovi")
GEN, KW_ins = INSIEMI["GEN"], INSIEMI["KW"]
import sonda as S

TIT, VOT = B.titoli_leggibili()
del INSIEMI
B.mem("metadati")

BASE = {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1}


# ============================================================ 2. V0 — il controllo
if not gia("V0"):
    print("\n### V0 — IL CONTROLLO (pipeline originale) ###", flush=True)
    import igraph as ig
    import leidenalg as la
    M0 = K.costruisci(C_vecchi, BASE, wc=0.0, beta=0.25)
    B.mem("V0 miscela")
    r0, c0, v0 = B.triangolo(M0)
    del M0
    g0 = ig.Graph(n=B.N, edges=np.column_stack((r0, c0)), directed=False)
    del r0, c0
    g0.es["weight"] = v0.astype(float).tolist()
    del v0
    B.mem("V0 grafo")
    p0 = la.find_partition(g0, la.RBConfigurationVertexPartition, weights="weight",
                           resolution_parameter=100, seed=42, n_iterations=2)
    np.save(ML / "bolle-nitrile-V0.npy", np.array(p0.membership))
    print(f"  -> bolle-nitrile-V0.npy ({time.time()-B.T0:.0f}s)", flush=True)
    del g0, p0
    del C_vecchi
else:
    print("\n### V0 — gia' fatto ###", flush=True)

a = np.load(ML / "bolle2-E.npy")
b = np.load(ML / "bolle-nitrile-V0.npy")
ident = int((a == b).sum()) if len(a) == len(b) else -1
print(f"  CONTROLLO: bolle2-E {len(np.bincount(a)):,} bolle · V0 {len(np.bincount(b)):,} · "
      f"identici {ident:,}/{B.N:,} ({100*ident/B.N:.2f}%)", flush=True)
del a, b

CD = dict(C)
CD["DIR"] = B.maschera_genere(C["DIR"], GEN, KW_ins, etichetta="DIR")
CD["CAST"] = B.maschera_genere(C["CAST"], GEN, KW_ins, etichetta="CAST")
del GEN, KW_ins
B.mem("maschera di genere")


def miscela(pesi, soffice=True):
    if soffice:
        return B.costruisci_2(C if "LIST" not in pesi else CD, pesi, beta=0.25, tau_rel=1.0,
                              caldi_sopra=5)
    return K.costruisci(C, pesi, wc=0.0, beta=0.25)


def triangolo_di(M, etichetta):
    W = B.archi_leiden(M, etichetta=etichetta)
    del M
    B.mem(f"{etichetta} triangolo")
    return W


# ============================================================ 3. QUANTO COSTA LA CONVERGENZA
print("\n\n### LA CONVERGENZA DI LEIDEN (D1) — misuriamo invece di indovinare ###", flush=True)
print("  Il primo giro con `n_iterations=-1` non e' finito in 17 minuti. Ma non sappiamo se erano",
      flush=True)
print("  17 minuti per una partizione che sarebbe finita, o se stava divergendo. Lo misuriamo:",
      flush=True)
print("  stessa miscela, 2 passate contro 6, e vediamo cosa cambia.", flush=True)
PROVA = ML / "bolle-nitrile-prova-convergenza.npy"
M_prova = None
if not PROVA.exists():
    t = time.time()
    M_prova = B.costruisci_2(C, BASE, beta=0.25, tau_rel=1.0, caldi_sopra=5)
    M_prova = B.archi_leiden(M_prova, etichetta="prova")
    print(f"  miscela e triangolo pronti in {time.time()-t:.0f}s", flush=True)
    out = {}
    for n_iter in (2, 6):
        t = time.time()
        m = B.partizione(M_prova, 100, "RB", n_iterations=n_iter, etichetta=f"{n_iter} passate")
        dt = time.time() - t
        out[n_iter] = m
        sz = np.bincount(m)
        print(f"  ** {n_iter} passate: {dt:.0f}s · {len(sz):,} bolle · {int((sz>=15).sum()):,} "
              f"con >=15 · mediana {int(np.median(sz))}", flush=True)
    a, b = out[2], out[6]
    su = int((a == b).sum())
    print(f"  ** 2 contro 6 passate: {su:,}/{B.N:,} titoli nella stessa bolla "
          f"({100*su/B.N:.2f}%)", flush=True)
    np.save(PROVA, b)
    np.save(ML / "bolle-nitrile-prova-2pass.npy", a)
    del M_prova
else:
    print("  prova gia' fatta", flush=True)

N_ITER = 6      # deciso dalla misura qui sopra (la convergenza piena non sta nel tempo disponibile)
print(f"  -> uso N_ITER = {N_ITER}", flush=True)


# ============================================================ 4. le varianti
N_ITER = 6     # deciso dalla misura sopra: `-1` (convergenza piena) non sta nel tempo disponibile


def esegui(tag, descrizione, pesi, tipo="RB", res=100, soffice=True, con_maschera=False,
           con_chiusura=True, con_consenso=False, con_potatura=True, n_iter=None):
    n_iter = N_ITER if n_iter is None else n_iter
    """Una variante: miscela -> triangolo -> partizione -> (potatura). Riutilizza se gia' fatta."""
    if gia(tag):
        print(f"\n### {tag} — gia' fatto ###", flush=True)
        return np.load(ML / f"bolle-nitrile-{tag}.npy")
    print(f"\n### {tag} — {descrizione} ###", flush=True)
    fonte = CD if con_maschera else C
    if soffice:
        M = B.costruisci_2(fonte, pesi, beta=0.25, tau_rel=1.0, caldi_sopra=5)
    else:
        M = K.costruisci(fonte, pesi, wc=0.0, beta=0.25)
    B.mem(f"{tag} miscela")
    if con_chiusura:
        M = B.chiusura_triangolare(M, alpha0=0.1, etichetta=tag)
        B.mem(f"{tag} chiusura")
    if con_consenso:
        M = B.consenso_multivista(M, CD, pesi)
        B.mem(f"{tag} consenso")
    W = triangolo_di(M, tag)
    mem = B.partizione(W, res, tipo, n_iterations=n_iter, etichetta=tag)
    if con_potatura:
        mem = B.potatura_nucleo(mem, W, quanti_nucleo=4, etichetta=tag)
    del W
    np.save(ML / f"bolle-nitrile-{tag}.npy", mem)
    sz = np.bincount(mem)
    print(f"  -> bolle-nitrile-{tag}.npy · {len(sz):,} bolle · {int((sz>=15).sum()):,} con >=15",
          flush=True)
    B.mem(tag)
    S.stampa_confronto(tag, mem, np.load(ML / "bolle2-E.npy"), "bolle2-E", TIT, VOT)
    return mem


# V1: i tre difetti, miscela dura (per isolare l'effetto dei soli bug). NIENTE chiusura triangolare:
# quella e' il ticket 04, cioe' V3. Il primo giro le aveva attaccate tutte e due insieme.
esegui("V1", "i tre difetti senza parametri (ticket 02)", BASE, soffice=False, con_potatura=False,
       con_chiusura=False)
# V2: + shrinkage di riga e CFst freddi (sempre senza chiusura)
esegui("V2", "shrinkage di riga d+tau, CFst solo sui freddi (ticket 03)", BASE, con_potatura=False,
       con_chiusura=False)
# V3: + chiusura triangolare
esegui("V3", "chiusura triangolare (ticket 04)", BASE, con_potatura=False)
# V4: + potatura al nucleo
esegui("V4", "potatura al nucleo (ticket 05)", BASE)
# V5: + maschera di genere e COLL a 3
B5 = {**BASE, "COLL": 3}
esegui("V5", "maschera genere su DIR/CAST, COLL a 3 (ticket 06)", B5, con_maschera=True)
# V6: + consenso multi-vista
esegui("V6", "consenso multi-vista (ticket 07)", B5, con_maschera=True, con_consenso=True)
# V7: + LIST
B7 = {**B5, "LIST": 1}
esegui("V7", "LIST dentro le bolle (ticket 08)", B7, con_maschera=True, con_consenso=True)
# V8: CPM e risoluzione. Le partizioni condividono la STESSA miscela e lo STESSO triangolo.
#
# DEVIATI DAL TICKET 09, e va detto: il ticket proponeva risoluzioni **piu' basse** (CPM 0.005-0.02,
# RB 30-60) perche' dava per scontato che il grafo fosse troppo fine. Ma la misura dice il
# contrario: gli interventi lo hanno reso molto PIU' GROSSO (da 5.297 bolle con mediana 9 a 1.430 con
# mediana 39). Quindi provo le due risoluzioni del ticket (CPM 0.02, RB 60) e in piu' una PIU' ALTA
# (RB 200), che e' l'unica che risponde alla domanda che abbiamo davvero.
SPEC = (("V8-CPM0.02", "CPM", 0.02), ("V8-RB60", "RB", 60), ("V8-RB200", "RB", 200))
da_fare = [s for s in SPEC if not gia(s[0])]
if da_fare:
    print("\n### V8 — CPM E RISOLUZIONE (ticket 09) ###", flush=True)
    W8 = triangolo_di(t08(), "V8")
    for tag, tipo, res in da_fare:
        print(f"\n  -- {tag} --", flush=True)
        m = B.partizione(W8, res, tipo, n_iterations=N_ITER, etichetta=tag)
        m = B.potatura_nucleo(m, W8, quanti_nucleo=4, etichetta=tag)
        np.save(ML / f"bolle-nitrile-{tag}.npy", m)
        sz = np.bincount(m)
        print(f"  -> bolle-nitrile-{tag}.npy · {len(sz):,} bolle · {int((sz>=15).sum()):,} con >=15",
              flush=True)
        S.stampa_confronto(tag, m, np.load(ML / "bolle2-E.npy"), "bolle2-E", TIT, VOT)
    del W8
else:
    print("\n### V8 — gia' fatto ###", flush=True)

# ============================================================ la convergenza di Leiden
print("\n\n### RIEPILOGO DELLA CONVERGENZA ###", flush=True)
print("  vedi la misura in testa al log: 2 passate contro 6 sulla stessa miscela", flush=True)

# ============================================================ 5. il banco sonda finale
print("\n\n" + "#" * 110)
print("# IL BANCO SONDA — riepilogo")
print("#" * 110, flush=True)
print("# IL BANCO SONDA — 20 titoli sentinella su ogni variante")
print("#" * 110, flush=True)
riferimento = np.load(ML / "bolle2-E.npy")
for tag in ORDINE:
    f = ML / f"bolle-nitrile-{tag}.npy"
    if f.exists():
        S.stampa_confronto(tag, np.load(f), riferimento, "bolle2-E", TIT, VOT)

print("\n\n### RIASSUNTO ###")
print(f"{'variante':<14}{'bolle':>8}{'>=15':>7}{'mediana':>9}")
for tag in ORDINE:
    f = ML / f"bolle-nitrile-{tag}.npy"
    if f.exists():
        mem = np.load(f)
        sz = np.bincount(mem)
        print(f"{tag:<14}{len(sz):>8,}{int((sz>=15).sum()):>7,}{int(np.median(sz)):>9}")
print(f"\nFINE ({time.time()-B.T0:.0f}s)")
