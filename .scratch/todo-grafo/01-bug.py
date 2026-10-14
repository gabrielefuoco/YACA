"""01-bug.py — i tre bug di `todo grafo.md` §0, piu' il quarto non segnalato. Quanto pesano.

L'esperto ha letto `digest_2.txt`, che non e' il codice aggiornato: i numeri di riga non tornano e
una delle tre accuse (min_sim in `bolle.py`) punta al posto sbagliato. Qui ogni accusa e' verificata
sul codice vero, e — quando e' possibile — **quantificata**.

  A. BUG 1 (genres) e BUG 4 (networks/countries/companies costruiti e buttati via)
  B. BUG 2 (min_sim 0.12 con shrinkage L2)
  C. BUG 3 (potatura_nucleo legge meta' degli archi)

Niente viene corretto: la correzione e' il ticket 02. Qui si misura.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
N = B.N
ML = K.ML
PQ = K.ROOT / ".cache" / "tmdb"


def t():
    return f"{time.time()-T0:.0f}s"


print("=" * 100)
print("TICKET 01 — LE ACCUSE DELL'ESPERTO, VERIFICATE SUL CODICE")
print("=" * 100, flush=True)

# =====================================================================================
print(f"\n[{t()}] costruisco gli insiemi dai metadati (come fa bolle.py, senza correzioni)", flush=True)
INS = B.costruisci_insiemi()

# ------------------------------------------------------------------ BUG 4
print("\n" + "=" * 100)
print("BUG 4 — quello che `costruisci_insiemi` calcola e butta via (non segnalato dall'esperto)")
print("=" * 100)
print(f"  chiavi restituite: {sorted(INS.keys())}")
print("  dentro la funzione, e mai fuori:")
print("    RETE  <- networks              (letto da COLS_T, usato solo per `rt:` in SIG)")
print("    PAE   <- production_countries   (usato solo per `pg:` in SIG)")
print("    COMP  <- production_companies   (usato solo per `co:` in SIG)")
print("  Non e' un difetto di per se': SIG li usa. Ma il profilo di una serie — rete, studio,")
print("  paese — non arriva a nessuno studente, perche' non viene restituito.")

# ------------------------------------------------------------------ BUG 1
print("\n" + "=" * 100)
print("BUG 1 — `genres` non e' letto: GEN vuoto per tutti i titoli")
print("=" * 100)
GEN = INS["GEN"]
pieni = sum(1 for g in GEN if g)
print(f"  titoli con almeno un genere: {pieni:,}/{N:,}")

# le firme PROD: cosi' si vede l'effetto 2
SIG = INS["SIG"]
tipi = {"co:": 0, "rt:": 0, "pg:": 0}
for s in SIG:
    for x in s:
        for k in tipi:
            if x.startswith(k):
                tipi[k] += 1
print(f"  firme PROD generate:  co:studio {tipi['co:']:,} · rt:rete {tipi['rt:']:,} · "
      f"pg:paese|decennio|genere {tipi['pg:']:,}")
print("  Effetto 2 confermato: il ciclo `for g in GEN[r]` gira a vuoto, quindi le firme `pg:`")
print("  non nascono mai. I titoli con firma restano quelli con uno studio o una rete di nicchia.")

# --- il controfattuale: GEN come sarebbe se la colonna fosse letta
COLS = {"movie": ["id", "genres"], "tv": ["id", "genres"]}
GEN2 = [set() for _ in range(N)]
for typ, f in (("movie", "movies.parquet"), ("tv", "tv.parquet")):
    d = pd.read_parquet(PQ / f, columns=COLS[typ])
    for riga in d.itertuples(index=False):
        dd = dict(zip(COLS[typ], riga))
        r = B.ROW_OF.get(f"{typ}:{int(dd['id'])}")
        if r is None:
            continue
        try:
            v = json.loads(dd["genres"]) if isinstance(dd["genres"], str) else (dd["genres"] or [])
        except Exception:
            v = []
        for x in v:
            if isinstance(x, dict) and x.get("name"):
                GEN2[r].add(str(x["name"]).lower())
pieni2 = sum(1 for g in GEN2 if g)
print(f"  con la colonna letta: titoli con almeno un genere: {pieni2:,}/{N:,} "
      f"({len({x for s in GEN2 for x in s})} generi distinti)")

# --- quanto taglia la maschera, rotta e riparata
print(f"\n[{t()}] la maschera di genere sugli archi veri (dalla cache, non mascherata)", flush=True)
KW = INS["KW"]
KWF = [frozenset(k) for k in KW]


def conta_maschera(nome):
    f = ML / f"bolle-nitrile-{nome}.npz"
    if not f.exists():
        print(f"  {nome}: cache assente, salto")
        return None
    M = K.carica_csr(f.name, N)
    Mc = M.tocoo()
    r, c = Mc.row, Mc.col
    # il confronto e' costoso su 66k x archi: si fa a campione se serve
    n = len(r)
    ok_kw = np.fromiter((bool(KWF[i] & KWF[j]) for i, j in zip(r, c)), bool, n)
    ok_g1 = np.fromiter((bool(GEN[i] & GEN[j]) for i, j in zip(r, c)), bool, n)
    ok_g2 = np.fromiter((bool(GEN2[i] & GEN2[j]) for i, j in zip(r, c)), bool, n)
    rotto = ok_kw | ok_g1          # com'e' oggi: il genere non contribuisce mai
    giusto = ok_kw | ok_g2         # com'e' con la colonna letta
    print(f"  {nome}: {M.nnz:,} archi (simmetrizzati) → tenuti con GEN vuoto {int(rotto.sum()):,} "
          f"({100*rotto.mean():.1f}%) · tenuti con GEN vero {int(giusto.sum()):,} "
          f"({100*giusto.mean():.1f}%)")
    print(f"        solo-keyword {int(ok_kw.sum()):,} · solo-genere(rotto, sempre 0) "
          f"{int(ok_g1.sum()):,} · solo-genere(vero) {int(ok_g2.sum()):,}")
    return int(rotto.sum()), int(giusto.sum())


for nome in ("DIR", "CAST"):
    conta_maschera(nome)

# ------------------------------------------------------------------ BUG 2
print("\n" + "=" * 100)
print("BUG 2 — `min_sim=0.12` con shrinkage L2")
print("=" * 100)
print("  Nel modulo `bolle.py` il default e' gia' 0.02 (riga 72). Ma il chiamante che produce la")
print("  mappa, `10-vicinanza.py` riga ~62, passa esplicitamente 0.12 sia per KW sia per CAST.")
print("  Il difetto e' nel chiamante: l'esperto aveva ragione sul fatto, non sul posto.")
for nome, f in (("CAST (nuova, in cache)", ML / "bolle-nitrile-CAST.npz"),
                ("CAST (vecchia, senza shrinkage)", ML / "nuovo-CAST.npz"),
                ("KW (nuova, in cache)", ML / "bolle-nitrile-KW.npz")):
    if not f.exists():
        continue
    M = K.carica_csr(f.name, N)
    g = np.asarray((M > 0).sum(1)).ravel()
    print(f"  {nome:<34} {M.nnz:>10,} archi · grado mediano {int(np.median(g)):>3} · "
          f"titoli con archi {int((g>0).sum()):>7,} ({100*(g>0).mean():.1f}%)")

print(f"\n[{t()}] ricostruisco CAST con shrinkage e MISURO la soglia, invece di fidarmi", flush=True)
A = B.matrice_idf(INS["CA"])
M0 = B.topk_shrink(A, min_sim=0.0, shrinkage=True, etichetta="CAST@0")
del A
if M0.nnz:
    vals = M0.data
    print(f"  coseni dei {M0.nnz:,} archi tenuti dal k-NN (top-{B.TOPK} per riga, shrinkage):")
    for q in (50, 75, 90, 95, 99):
        print(f"    {q}° percentile: {np.percentile(vals, q):.3f}")
    for soglia in (0.02, 0.04, 0.06, 0.12):
        m = M0.copy()
        m.data = np.where(m.data > soglia, m.data, 0.0)
        m.eliminate_zeros()
        g = np.asarray((m > 0).sum(1)).ravel()
        print(f"    con min_sim {soglia:.2f}: {m.nnz:>9,} archi · grado mediano {int(np.median(g)):>3}"
              f" · titoli con archi {int((g>0).sum()):>7,}")
else:
    print("  nessun arco: il componente CAST e' vuoto")
del M0

# ------------------------------------------------------------------ BUG 3
print("\n" + "=" * 100)
print("BUG 3 — `potatura_nucleo` legge meta' degli archi")
print("=" * 100)
print("  `fuori = peso.tocsr()` e poi `fuori.getrow(r)`: se `M` e' il triangolo superiore, la riga r")
print("  contiene solo i j > r, e tutti i vicini con indice minore spariscono. L'helper `versus`")
print("  nella stessa funzione gestisce il triangolo esplicitamente: la svista e' solo li' dentro.")
fV7 = ML / "bolle-nitrile-V7.npy"
fT = ML / "bolle-nitrile-V7-triangolo.npz"
if fV7.exists() and fT.exists():
    mem = np.load(fV7)
    q = np.load(fT)
    W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(N, N)).tocsr()
    # quanto e' triangolo?
    tri = sp.triu(W, k=1)
    solo_sup = abs(tri.nnz - W.nnz) / max(W.nnz, 1)
    print(f"  V7: {int(mem.max())+1:,} bolle · il file triangolo e' triangolare al "
          f"{100*(1-solo_sup):.1f}% ({tri.nnz:,} archi su {W.nnz:,})")
    Ws = (W + W.T).tocsr()
    bolle = {}
    for r in range(N):
        b = int(mem[r])
        if b >= 0:
            bolle.setdefault(b, []).append(r)
    # nucleo come nella funzione
    peso = W
    usate = 0
    diverse = 0
    espulsi = 0
    dettaglio = []
    for b, membri in bolle.items():
        if len(membri) <= 4:
            continue
        sub = peso[membri][:, membri]
        interno = (np.asarray(sub.sum(1)).ravel() + np.asarray(sub.sum(0)).ravel())
        ordine = np.argsort(-interno)
        nucleo = [membri[k] for k in ordine[:4]]
        aff = (np.asarray(peso[membri][:, nucleo].sum(1)).ravel()
               + np.asarray(peso[nucleo][:, membri].sum(0)).ravel())
        for k, r in enumerate(membri):
            if aff[k] > 0:
                continue
            espulsi += 1
            # i due modi di leggere i vicini
            def vince(fuori_):
                riga = fuori_.getrow(r)
                conta = {}
                for j in riga.indices:
                    b2 = int(mem[j])
                    if b2 != b:
                        conta[b2] = conta.get(b2, 0) + 1
                return max(conta, key=conta.get) if conta else None

            vb = vince(W)
            vc = vince(Ws)
            if vb != vc:
                diverse += 1
                if len(dettaglio) < 8:
                    dettaglio.append((b, r, vb, vc, W.getrow(r).nnz, Ws.getrow(r).nnz))
    print(f"  su V7: membri espulsi (affinita' zero col nucleo) {espulsi:,}")
    print(f"  riassegnati a una bolla DIVERSA leggendo il triangolo invece di tutto: {diverse:,} "
          f"({100*diverse/max(espulsi,1):.1f}%)")
    for b, r, vb, vc, n1, n2 in dettaglio:
        print(f"    bolla {b}, titolo {r}: col triangolo → bolla {vb} ({n1} vicini letti), "
              f"corretto → bolla {vc} ({n2})")
else:
    print("  V7 o il triangolo non trovati: salto")

print(f"\n[{t()}] fine")
