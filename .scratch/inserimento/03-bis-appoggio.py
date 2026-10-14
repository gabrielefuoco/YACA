"""03-bis-appoggio.py — le serie possono usare i FILM come appoggio?

Il ticket 03 ha messo un vincolo di medium sugli archi strutturali, e l'utente ha obiettato: le serie
potrebbero servirsi dei film come appoggio. Ha ragione a chiederlo, perche' il vincolo serve alla
**consegna** (Stremio ha due cataloghi separati), non necessariamente alla **collocazione**.

Il meccanismo proposto: una serie nuova entra, atterra **presso i film del suo mondo**, e da li' si
passa alle **serie adiacenti a quei film**. E' un passaggio in due tempi che usa la mappa — che e'
esattamente cio' per cui la mappa esiste.

Qui si misura se l'impalcatura **c'e' gia'**: per ogni bolla a maggioranza serie, esiste una bolla a
maggioranza film fra i suoi vicini? E quella bolla e' dello stesso mondo?
"""
import pathlib
import sys

import numpy as np
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
# ORDINE IMPORTANTE: `ml-collaborativo` contiene un ALTRO `bolle.py` (fase precedente, che stampa
# all'import). Va messo DOPO, altrimenti `import bolle` prende quello sbagliato.
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import canone as K

ML = K.ML
mem = np.load(ML / "bolle-nitrile-V7.npy")
sz = np.bincount(mem)
keys, row_of, n, IS_TV = K.titoli()
import bolle as B
TIT, VOT = B.titoli_leggibili()

print("=" * 100)
print("LE SERIE POSSONO USARE I FILM COME APPOGGIO?")
print("=" * 100, flush=True)

# --- la mappa delle bolle
q = np.load(ML / "bolle-nitrile-V7-triangolo.npz")
W = sp.csr_matrix((q["data"], q["indices"], q["indptr"]), shape=(n, n)).tocsr()
S1 = sp.csr_matrix((np.ones(n, np.float32), (np.arange(n), mem)), shape=(n, len(sz)))
BB = (S1.T @ (W + W.T) @ S1).tocsr()
BB.setdiag(0)
BB.eliminate_zeros()

# --- quante serie ha ogni bolla
serie_per_bolla = np.bincount(mem[IS_TV], minlength=len(sz))
film_per_bolla = sz - serie_per_bolla
quota_serie = serie_per_bolla / np.maximum(sz, 1)
serieside = (quota_serie > 0.5) & (sz >= 5)
filmside = (~(quota_serie > 0.5)) & (sz >= 5)
print(f"\nbolle con >=5 titoli: {int((sz>=5).sum()):,}")
print(f"  a maggioranza SERIE: {int(serieside.sum()):,} ({int(serie_per_bolla[serieside].sum()):,} serie)")
print(f"  a maggioranza FILM:  {int(filmside.sum()):,} ({int(film_per_bolla[filmside].sum()):,} film)")

# --- per ogni bolla-serie, i vicini: quanti sono bolle-film?
k = 8
con_appoggio, senza = 0, 0
esempi = []
for b in np.where(serieside)[0]:
    riga = BB.getrow(b)
    if riga.nnz == 0:
        senza += 1
        continue
    ordine = np.argsort(-riga.data)[:k]
    vic = [int(riga.indices[j]) for j in ordine]
    film_vicini = [v for v in vic if filmside[v]]
    if film_vicini:
        con_appoggio += 1
        if len(esempi) < 40:
            esempi.append((b, film_vicini[0], float(riga.data[ordine[0]])))
    else:
        senza += 1

tot = int(serieside.sum())
print(f"\n** bolle-serie con almeno un vicino film fra i primi {k}: {con_appoggio:,}/{tot:,} "
      f"({100*con_appoggio/tot:.1f}%) **")
print(f"** bolle-serie SENZA nessun vicino film: {senza:,}/{tot:,} "
      f"({100*senza/tot:.1f}%) **")

# --- e gli esempi si leggono
print(f"\n--- gli esempi, da leggere: la bolla-serie e il suo vicino film ---")
rng = np.random.default_rng(3)
scelti = rng.choice(len(esempi), min(10, len(esempi)), replace=False) if esempi else []
for i in scelti:
    b, f_b, w = esempi[i]
    m_s = np.where(mem == b)[0]
    m_f = np.where(mem == f_b)[0]
    top_s = sorted(m_s, key=lambda x: -VOT[x])[:4]
    top_f = sorted(m_f, key=lambda x: -VOT[x])[:4]
    print(f"\n  bolla SERIE {b} ({int(sz[b])} tit.): " +
          " | ".join(str(TIT[x])[:24] for x in top_s))
    print(f"   -> vicino FILM {f_b} ({int(sz[f_b])} tit., peso {w:.1f}): " +
          " | ".join(str(TIT[x])[:24] for x in top_f))

# --- il caso che ha aperto la domanda
print(f"\n--- I CASI NOTI ---")
from collections import Counter
dv_cache = {}
for nome in ("Guerre stellari", "The Mandalorian", "Star Trek: Discovery", "Banana Fish"):
    riga = None
    for r in range(n):
        if str(TIT[r]).strip().lower().startswith(nome.strip().lower()[:14]):
            riga = r
            break
    if riga is None:
        continue
    b = int(mem[riga])
    m_s = np.where(mem == b)[0]
    quota = float((IS_TV[m_s]).mean())
    print(f"\n  {TIT[riga]!r} -> bolla {b} ({int(sz[b])} titoli, {100*quota:.0f}% serie)")
    riga_b = BB.getrow(b)
    ordine = np.argsort(-riga_b.data)[:6]
    for j in ordine:
        v = int(riga_b.indices[j])
        qs = float((IS_TV[np.where(mem == v)[0]]).mean())
        top = sorted(np.where(mem == v)[0], key=lambda x: -VOT[x])[:3]
        print(f"     vicino {v:>5} ({int(sz[v]):>3} tit., {100*qs:>3.0f}% serie, peso {riga_b.data[j]:>7.1f})"
              f" · " + " | ".join(str(TIT[x])[:22] for x in top))
