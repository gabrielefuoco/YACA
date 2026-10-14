"""02-03-coerenza.py — TICKET 02 e 03: N_eff (frammentazione) e l'indice di chimera (PMI).

Sono le due metriche che il senior propone in §1.B per **misurare automaticamente** se un mondo e'
frantumato o se una bolla e' una chimera, senza chiedere a un umano.

  N_eff(t) = 1 / somma_b P(b|t)^2      l'inverso di Herfindahl sui titoli che portano il tropo t
                                       se vale 2, il mondo e' raccolto; se vale 18, e' polverizzato
  PMI(x,y) = log( P(x,y) / (P(x)P(y)) ) calcolata fra i 5 token tematici di testa di ogni bolla
                                       se e' NEGATIVA, i due descrittori si escludono: chimera

Il senior prevede `N_eff(film noir) ≈ 2,1` e `N_eff(psychological thriller) ≈ 18,5`. Sono previsioni
da **verificare**: se non tornano, o sbaglia il metodo o sbaglia la previsione, e in tutti e due i
casi va scritto.

Le ancore: i token `kw:` e `ge:` con `30 <= df <= 1500`. Sotto i 30 e' libero testo di TMDB (le
`baffled` di Verity), sopra i 1500 e' un macro-genere che non identifica niente.
"""
import json
import pathlib
import sys
import time

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
print("=" * 104)
print("TICKET 02-03 — FRAMMENTAZIONE (N_eff) E CHIMERE (PMI)")
print("=" * 104, flush=True)

TF = sp.load_npz(ML / "05-tfidf.npz").tocsr()
vocab = json.load(open(ML / "05-vocab.json", encoding="utf-8"))
inv = {i: t for t, i in vocab.items()}
META = np.load(ML / "05-centroidi-meta.npz")
SUM = sp.load_npz(ML / "05-centroidi.npz").tocsr()
TUTTE = np.concatenate([META["bolle_serie"], META["bolle_film"]])
pos = {int(b): k for k, b in enumerate(TUTTE)}
mem = np.load(ML / "bolle-nitrile-V8.npy")
N = len(mem)
NB = int(mem.max()) + 1
sz = np.bincount(mem)
print(f"  caricati: TF {TF.shape} · centroidi {SUM.shape} · {NB:,} bolle ({time.time()-T0:.0f}s)",
      flush=True)

# il numero di titoli per token: gli nnz per colonna
TFc = TF.tocsc()
df = np.diff(TFc.indptr)
print(f"  df per token: mediana {int(np.median(df))} · massimo {int(df.max()):,}", flush=True)

# ============================================================ 1. N_eff per tropo
print("\n" + "=" * 104)
print("1. L'INDICE DI FRAMMENTAZIONE N_eff(t) — quale mondo e' frantumato")
print("=" * 104, flush=True)
print("  Per ogni tropo t: come si distribuiscono i titoli che lo portano sulle bolle.")
print("  N_eff = 1 se tutti in una bolla · N_eff = numero di bolle se sparsi uniformi.\n", flush=True)

# i titoli per ogni bolla, una volta sola
ordine = np.argsort(mem, kind="stable")
confini = np.searchsorted(mem[ordine], np.arange(NB + 1))
MEMBRI = [ordine[confini[b]:confini[b + 1]] for b in range(NB)]

cand = [j for j, d in enumerate(df) if 30 <= d <= 1500 and inv[j][:3] in ("kw:", "ge:")]
print(f"  ancore (kw: e ge: con 30 <= df <= 1500): {len(cand):,}", flush=True)

RIS = []
for j in cand:
    righe = TFc.indices[TFc.indptr[j]:TFc.indptr[j + 1]]
    if len(righe) < 30:
        continue
    b_di = mem[righe]
    conteggi = np.bincount(b_di, minlength=NB).astype(float)
    p = conteggi / conteggi.sum()
    n_eff = 1.0 / float((p ** 2).sum())
    top = np.argsort(-conteggi)[:3]
    RIS.append((inv[j], len(righe), n_eff, [(int(b), int(conteggi[b])) for b in top if conteggi[b] > 0]))

RIS.sort(key=lambda z: z[2])
print(f"\n  LE VENTI ANCORE PIU' COESE (il mondo esiste):")
print(f"  {'tropo':<40} {'titoli':>7} {'N_eff':>7}  dove stanno")
for nome, n, ne, top in RIS[:20]:
    dove = " · ".join(f"b{b} ({c})" for b, c in top)
    print(f"  {nome[:38]:<40} {n:>7,} {ne:>7.2f}  {dove}")

print(f"\n  LE VENTI PIU' FRANTUMATE (il mondo non esiste):")
for nome, n, ne, top in RIS[-20:]:
    dove = " · ".join(f"b{b} ({c})" for b, c in top)
    print(f"  {nome[:38]:<40} {n:>7,} {ne:>7.2f}  {dove}")

print(f"\n  E LE PREVISIONI DEL SENIOR:")
for chiave in ("kw:film noir", "kw:psychological thriller", "kw:spaghetti western", "kw:cyberpunk",
               "kw:iyashikei", "kw:true crime", "kw:superhero", "kw:slasher"):
    j = vocab.get(chiave)
    if j is None or not (30 <= df[j] <= 1500):
        print(f"    {chiave:<34} non e' un'ancora (df {int(df[j]) if j is not None else 'assente'})")
        continue
    righe = TFc.indices[TFc.indptr[j]:TFc.indptr[j + 1]]
    p = np.bincount(mem[righe], minlength=NB).astype(float)
    p /= p.sum()
    ne = 1.0 / float((p ** 2).sum())
    print(f"    {chiave:<34} {len(righe):>5,} titoli · N_eff {ne:>6.2f}")

# ============================================================ 2. l'indice di chimera
print("\n" + "=" * 104)
print("2. L'INDICE DI CHIMERA — PMI fra i 5 token di testa di ogni bolla")
print("=" * 104, flush=True)
print("  PMI(x,y) = log( P(x,y) / (P(x)·P(y)) ) sul catalogo intero. Negativa = i due si escludono.\n")

n_titoli = TF.shape[0]
COLONNE = {t: TFc.indices[TFc.indptr[j]:TFc.indptr[j + 1]] for t, j in vocab.items()}


def conta_insieme(righe):
    """I titoli che portano il token, come boolean sparsa: serve per l'intersezione veloce."""
    m = np.zeros(n_titoli, bool)
    m[righe] = True
    return m


def pmi(t1, t2):
    a = COLONNE.get(t1)
    b = COLONNE.get(t2)
    if a is None or b is None or len(a) == 0 or len(b) == 0:
        return None
    ma, mb = conta_insieme(a), conta_insieme(b)
    n_xy = int((ma & mb).sum())
    if n_xy == 0:
        return -np.inf
    p_xy = n_xy / n_titoli
    p_x = len(a) / n_titoli
    p_y = len(b) / n_titoli
    return float(np.log(p_xy / (p_x * p_y)))


CHIMERE = []
for k, b in enumerate(TUTTE):
    b = int(b)
    v = SUM[k].toarray().ravel()
    top = np.argsort(-v)[:5]
    # FILTRO DI SUPPORTO, imparato dalla prima esecuzione: senza, i 5 token di testa di una bolla
    # piccola sono rari, non co-occorrono mai, e la PMI va a -inf per ragioni banali — cosi' le
    # prime quindici "chimere" erano tutte bolle da 5-31 titoli, che sono le MIGLIORI. Si tengono
    # solo i token con df >= 30 (la stessa soglia delle ancore): se ne restano meno di 3, la bolla
    # non e' giudicabile e si salta.
    termini = [inv[int(t)] for t in top
               if v[t] > 0 and inv[int(t)][:3] in ("kw:", "ge:") and df[int(t)] >= 30]
    if len(termini) < 3:
        continue
    pmis = []
    for i in range(len(termini)):
        for j2 in range(i + 1, len(termini)):
            p = pmi(termini[i], termini[j2])
            if p is not None:
                pmis.append(p)
    if not pmis:
        continue
    CHIMERE.append((b, int(sz[b]), float(np.median(pmis)), float(min(pmis)), termini))

CHIMERE.sort(key=lambda z: z[2])
print(f"  bolle esaminate: {len(CHIMERE):,}\n")
print(f"  LE QUINDICI PIU' CHIMERICHE (PMI mediana più negativa):")
for b, s, med, mn, termini in CHIMERE[:15]:
    print(f"    bolla {b:>4} ({s:>3} tit.) PMI mediana {med:+.3f} · minima {mn:+.3f}")
    print(f"       {' · '.join(termini)}")
print(f"\n  LE QUINDICI PIU' COERENTI (PMI mediana più alta):")
for b, s, med, mn, termini in CHIMERE[-15:]:
    print(f"    bolla {b:>4} ({s:>3} tit.) PMI mediana {med:+.3f}")
    print(f"       {' · '.join(termini)}")

# i tre casi che il senior nomina
print(f"\n  I CASI CHE IL SENIOR NOMINA:")
for b, perche in ((594, "spaghetti western con dentro horror italiani e turchi"),
                  (289, "supereroi (col vicino 1145: Emmanuelle)"),
                  (820, "il minestrone di Verity"),
                  (750, "il fantasy anni '80 — il controllo, deve essere coerente")):
    riga = [c for c in CHIMERE if c[0] == b]
    if not riga:
        print(f"    bolla {b}: non fra quelle esaminate")
        continue
    _, s, med, mn, termini = riga[0]
    print(f"    bolla {b:>4} ({s:>3} tit.) PMI mediana {med:+.3f} · minima {mn:+.3f} — {perche}")
    print(f"       {' · '.join(termini)}")

# chi e' nella 594 davvero
TIT, _ = B.titoli_leggibili()
for b in (594, 1145):
    m_ = np.where(mem == b)[0][:12]
    print(f"\n  e chi sta davvero nella bolla {b}: {[TIT[x][:26] for x in m_]}")

np.savez_compressed(ML / "coerenza-neff.npz",
                    nome=np.array([r[0] for r in RIS]),
                    titoli=np.array([r[1] for r in RIS]),
                    neff=np.array([r[2] for r in RIS]),
                    bolle=np.array([r[0] for r in CHIMERE]),
                    sz=np.array([r[1] for r in CHIMERE]),
                    pmi_mediana=np.array([r[2] for r in CHIMERE]),
                    pmi_minima=np.array([r[3] for r in CHIMERE]))
print(f"\nFINE ({time.time()-T0:.0f}s)")
