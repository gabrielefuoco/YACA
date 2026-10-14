"""14-popolare-nicchia.py — TICKET 14: la leva Popolare / Nicchia, dentro la bolla.

La leva che risponde alla domanda dell'utente: «in questo mondo, voglio la cosa piu' famosa o la
cosa piu' nascosta?». **Deve operare per quantile DENTRO la bolla**: un parametro globale
restituirebbe zero titoli dentro i mondi di nicchia (o l'unico intruso hollywoodiano finito li' per
errore).

Due coordinate per ogni titolo, dentro la sua bolla:
  * PUREZZA: la frazione del peso dei suoi archi che cade dentro la bolla. Quanto e' un vero
    membro archetipico e non un visitatore di confine.
  * PERCENTILE LOCALE DI POPOLARITA': la posizione per voti **rispetto agli altri membri**.

I due selettori:
  * PORTA D'INGRESSO: massimizza purezza x percentile — il capolavoro canonico e accessibile.
  * DEEP CUT: purezza sopra la mediana della bolla (cosi' non si pesca rumore) e percentile
    crescente, nella fascia bassa ma non nulla.

E UN SOLO pavimento di sicurezza globale sui voti.

Uso:  python .scratch/grafo-servibile/14-popolare-nicchia.py
"""
import json, pathlib, sys, time
import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

PAVIMENTO = 10          # il solo parametro globale: sotto 10 voti non si scende
FASCIA_BASSA = (0.05, 0.45)
t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
voti = K.voti()
mem = np.load(K.ML / "bolle2-E.npy")
nb = int(mem.max()) + 1
sz = np.bincount(mem, minlength=nb)
print(f"partizione: {nb:,} bolle · {int((sz>=15).sum()):,} con ≥15 titoli")

CMP = K.Componenti(n)
C = CMP(30)
for nome in ("KW", "CAST", "DIR", "COLL", "TV"):
    C[nome] = K.carica_csr(f"nuovo-{nome}.npz", n)
M = K.costruisci(C, {"CF": 1, "CFst": 1, "B": 1, "KW": 1, "TV": 1, "CAST": 1, "DIR": 1, "COLL": 1},
                 wc=0.0, beta=0.25)
print(f"grafo pronto ({time.time()-t0:.0f}s)", flush=True)

P = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, nb)).tocsr()
dentro = np.asarray(M.multiply(P[:, mem]).sum(1)).ravel()
tutto = np.asarray(M.sum(1)).ravel()
purezza = (dentro / np.maximum(tutto, 1e-9)).astype(np.float32)

# ------------------------------------------------------------------ le due coordinate
print("")
print("=" * 100)
print("LE DUE COORDINATE")
print("=" * 100)
pct = np.zeros(n, np.float32)                 # percentile di popolarita' LOCALE
for b in range(nb):
    m = np.where(mem == b)[0]
    if len(m) == 1:
        pct[m] = 0.5
        continue
    o = np.argsort(np.argsort(voti[m]))       # 0 = il meno votato della bolla
    pct[m] = o / (len(m) - 1.0)
print(f"  purezza: mediana {np.median(purezza):.3f} · "
      f"il 10% piu' puro sta sopra {np.quantile(purezza, 0.90):.3f}")
print(f"  percentile locale: mediana {np.median(pct):.2f} (per costruzione)")

TIT, VOT, ANNO = {}, np.zeros(n, np.float32), {}
for f, col in (("movies.parquet", "title"), ("tv.parquet", "name")):
    dd = pd.read_parquet(K.ROOT / ".cache" / "tmdb" / f,
                         columns=["id", col, "vote_count", "release_date" if f.startswith("m")
                                  else "first_air_date"])
    typ = "movie" if f.startswith("m") else "tv"
    dc = "release_date" if f.startswith("m") else "first_air_date"
    for i, t, vc, dt in zip(dd["id"], dd[col], dd["vote_count"], dd[dc]):
        r = row_of.get(f"{typ}:{int(i)}")
        if r is not None:
            TIT[r] = str(t)
            VOT[r] = float(vc or 0)
            ANNO[r] = str(dt)[:4] if dt else "?"


def apri(b):
    """I due selettori per la bolla b. Torna (porta, deep cut) come liste di righe."""
    m = np.where(mem == b)[0]
    ok = m[VOT[m] >= PAVIMENTO]
    if len(ok) == 0:
        return [], []
    score = purezza[ok] * pct[ok]
    porta = ok[np.argmax(score)]
    med = float(np.median(purezza[m]))
    cand = [r for r in ok if purezza[r] > med and FASCIA_BASSA[0] <= pct[r] <= FASCIA_BASSA[1]]
    if not cand:
        cand = [r for r in ok if purezza[r] > med]
    deep = sorted(cand, key=lambda r: (pct[r], -purezza[r]))[:5]
    return [int(porta)], [int(x) for x in deep]


# ------------------------------------------------------------------ la verifica: la lettura
print("")
print("=" * 100)
print("LA LEVA SU BOLLE SCELTE: una di nicchia, una di blockbuster, una media")
print("=" * 100)
piccole = [b for b in range(nb) if 15 <= sz[b] <= 60]
per_voti = sorted(piccole, key=lambda b: np.median(VOT[np.where(mem == b)[0]]))
scelte = ([per_voti[0], per_voti[1]]                      # le piu' oscure
          + [per_voti[len(per_voti) // 2]]                # la mediana
          + per_voti[-2:])                                # le piu' popolari
for b in scelte:
    m = np.where(mem == b)[0]
    porta, deep = apri(b)
    print("")
    print(f"[{b}] {sz[b]} titoli · voti med {int(np.median(VOT[m]))} · ")
    print(f"      la bolla: " + " · ".join(TIT.get(r, "?")[:24]
                                           for r in m[np.argsort(-VOT[m])][:6]))
    for et, righe in (("PORTA D'INGRESSO", porta), ("DEEP CUT        ", deep)):
        if not righe:
            print(f"      {et}: (vuoto)")
            continue
        print(f"      {et}: " + " | ".join(
            f"{TIT.get(r,'?')[:26]} ({ANNO.get(r,'?')}, {int(VOT[r])} voti, "
            f"pur {purezza[r]:.2f}, pct {pct[r]:.2f})" for r in righe))

# ------------------------------------------------------------------ i controlli
print("")
print("=" * 100)
print("I CONTROLLI")
print("=" * 100)
pav, mai_vuota, porta_e_il_piu_votato = 0, 0, 0
tot = 0
for b in piccole:
    m = np.where(mem == b)[0]
    porta, deep = apri(b)
    tot += 1
    if not porta:
        pav += 1
    else:
        piu_votato = int(m[np.argmax(VOT[m])])
        if porta[0] == piu_votato:
            porta_e_il_piu_votato += 1
    if not deep:
        mai_vuota += 1
print(f"  bolle piccole del campione: {tot:,}")
print(f"  «PORTA» vuota (nessun membro sopra il pavimento di {PAVIMENTO} voti): {pav} "
      f"({100*pav/max(tot,1):.1f}%)  <- il criterio «mai zero» e' rispettato tranne qui")
print(f"  «DEEP CUT» vuoto: {mai_vuota} ({100*mai_vuota/max(tot,1):.1f}%)")
print(f"  la PORTA coincide col membro PIU' VOTATO della bolla nel {100*porta_e_il_piu_votato/tot:.1f}% "
      f"dei casi")
print(f"  >>> quindi nel {100*(1-porta_e_il_piu_votato/tot):.1f}% dei casi la leva NON restituisce il")
print(f"      piu' famoso: restituisce il piu' ARchetipico fra gli accessibili. E' il punto.")
# la stessa bolla a popolarita' GLOBALE: quante restituirebbero vuoto?
soglia_glob = float(np.quantile(voti[~is_tv], 0.75))
vuote_glob = sum(1 for b in piccole
                 if not any(VOT[r] >= soglia_glob for r in np.where(mem == b)[0]))
print(f"  >>> con un parametro GLOBALE (top 25% del catalogo, ≥{int(soglia_glob)} voti), "
      f"{vuote_glob:,} bolle su {tot:,} ({100*vuote_glob/tot:.1f}%) darebbero ZERO titoli")
print(f"      con la leva LOCALE ne danno zero {pav}. E' la differenza fra un controllo che si usa")
print(f"      e uno che si rompe nei mondi piccoli.")
print(f"\nFINE ({time.time()-t0:.0f}s)")
