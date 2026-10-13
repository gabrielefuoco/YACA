"""01-tie.py — PERCHE' IL NUMERO CANONICO DEL PRODOTTO NON SI RIPRODUCE AL DECIMALE.

Misurato da 01-recall.py: 6,00 / 29,56 / 63,31 / 87,85. Il canonico e': 5,99 / 29,61 / 63,35 / 87,86.

L'unica differenza fra i due: la' i ranghi sono calcolati su tutto il catalogo (`K.ranghi(X)`), qui
sul solo catalogo servito (`K.ranghi(X, ~is_tv)`).

Ipotesi: la camminata NON raggiunge decine di migliaia di titoli, che restano a punteggio ZERO
ESATTO. Fra pari merito l'ordine e' quello di indice, e le due classifiche riempiono i posti alti
con sottinsiemi diversi di film a zero — perche' senza il filtro nelle posizioni alte ci finiscono
in mezzo anche le serie, che poi vengono ignorate.

Se e' cosi', quel numero canonico non e' un numero: e' un artefatto di ordine di indice sul bordo.
E' la stessa classe di errore dell'artefatto del report 58, in piccolo.
"""
import pathlib, sys, time
import numpy as np

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
import canone as K

t0 = time.time()
keys, row_of, n, is_tv = K.titoli()
IDX_FILM = np.where(~is_tv)[0]

CMP = K.Componenti(n)
C = CMP(60)
M = K.costruisci(C, {"CF": 5, "CFst": 1, "Kc": 1, "B": 1, "T": 1}, wc=0.60, beta=0.50)
print(f"grafo canonico: {M.nnz:,} archi ({time.time()-t0:.0f}s)", flush=True)

PROF, ORO = K.banco_prodotto(row_of, quanti=1000, parte="verifica")
US = np.array(list(PROF.keys()))
E = np.zeros((n, len(US)), np.float32)
for j, u in enumerate(US):
    E[PROF[u], j] = 1.0
X = K.rwr(M, E, alpha=0.30)
for j, u in enumerate(US):
    X[PROF[u], j] = -1e9
print(f"camminata fatta ({time.time()-t0:.0f}s)", flush=True)

# ---------- quanti titoli restano a zero esatto ----------
zero = (X == 0.0).sum(0)
print("")
print("=" * 100)
print("QUANTI TITOLI RESTANO IRRAGGIUNGIBILI (punteggio zero esatto)")
print("=" * 100)
print(f"  per utente: mediana {int(np.median(zero)):,} · min {int(zero.min()):,} · max {int(zero.max()):,} "
      f"su {n:,} titoli ({100*np.median(zero)/n:.1f}%)")
zf = (X[IDX_FILM] == 0.0).sum(0)
print(f"  di cui FILM: mediana {int(np.median(zf)):,} su {len(IDX_FILM):,} "
      f"({100*np.median(zf)/len(IDX_FILM):.1f}% del catalogo film)")

# ---------- i due protocolli ----------
R1 = K.ranghi(X)                 # canonico: ranghi su tutto il catalogo
R2 = K.ranghi(X, ~is_tv)         # ristretto al catalogo servito
r1 = K.recall_film(R1, US, PROF, ORO, IDX_FILM)
r2 = K.recall_film(R2, US, PROF, ORO, IDX_FILM)
print("")
print("=" * 100)
print("I DUE PROTOCOLLI DI RANGO")
print("=" * 100)
K.stampa("ranghi su TUTTO il catalogo (il canonico)", r1)
K.stampa("ranghi sul catalogo SERVITO (film)", r2)
print("")
print(f"  atteso dal canonico: 5,99 / 29,61 / 63,35 / 87,86")
ok = all(abs(r1[N] - v) < 0.02 for N, v in ((10, 5.99), (100, 29.61), (500, 63.35), (2000, 87.86)))
print(f"  >>> il protocollo senza filtro {'RIPRODUCE il canonico' if ok else 'non lo riproduce nemmeno lui'}")

# ---------- e allora cosa cambia: chi entra nei primi N ----------
print("")
print("=" * 100)
print("CHI ENTRA NEI PRIMI N — e perche' il bordo e' arbitrario")
print("=" * 100)
for N in (10, 100, 500):
    d = []
    for j in range(len(US)):
        a = set(IDX_FILM[np.argpartition(R1[IDX_FILM, j], N)[:N]].tolist())
        b = set(IDX_FILM[np.argpartition(R2[IDX_FILM, j], N)[:N]].tolist())
        d.append(len(a ^ b))
    print(f"  @{N:<5} titoli diversi fra i due protocolli: mediana {int(np.median(d)):>4} su {N} "
          f"({100*np.median(d)/N:.1f}%) · casi identici {sum(1 for x in d if x == 0)}/{len(US)}")
print("")
# quanti di quelli che differiscono hanno punteggio zero?
tot_diff = tot_zero = 0
for j in range(0, len(US), 7):
    a = set(IDX_FILM[np.argpartition(R1[IDX_FILM, j], 100)[:100]].tolist())
    b = set(IDX_FILM[np.argpartition(R2[IDX_FILM, j], 100)[:100]].tolist())
    for x in a ^ b:
        tot_diff += 1
        if X[x, j] == 0.0:
            tot_zero += 1
print(f"  >>> dei titoli che cambiano fra i due protocolli (@100, 143 utenti campionati), "
      f"il {100*tot_zero/max(tot_diff,1):.1f}% ha punteggio ZERO ESATTO ({tot_zero:,}/{tot_diff:,})")
print(f"      Se e' ~100%, il bordo della classifica e' deciso dall'ordine di indice, non dai punteggi.")
print(f"\n({time.time()-t0:.0f}s)")
