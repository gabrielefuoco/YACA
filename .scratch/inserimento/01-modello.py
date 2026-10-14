"""01-modello.py — TICKET 01: salvare il modello dello studente e i vocabolari.

La verifica che conta: se il mio `features.py` riproduce la costruzione di `spazi-trakt.py`, allora
rifittando la Ridge `FX -> Cf` con gli stessi parametri devo riottenere la `P` di `cf-studente.npz`.
Se non la riottengo, il refactor e' sbagliato, e lo scopriamo qui.
"""
import pathlib
import sys
import time

import numpy as np
from scipy import sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import features as F

T0 = time.time()
ML = F.ML
print("=" * 100)
print("TICKET 01 — il modello dello studente, e i vocabolari che gli servono")
print("=" * 100, flush=True)

# ---------------------------------------------------------------- 1. il catalogo e i vocabolari
cat = F.carica_catalogo()
print(f"\n1. catalogo: {len(cat):,} righe "
      f"({int((cat['type'] == 'movie').sum()):,} film · {int((cat['type'] == 'tv').sum()):,} serie) "
      f"({time.time()-T0:.0f}s)", flush=True)

q = np.load(ML / "spazi-trakt.npz", allow_pickle=True)
print(f"   confronto con spazi-trakt.npz: {len(q['tmdb']):,} righe · "
      f"{int((q['tipo'] == 'movie').sum()):,} film · {int((q['tipo'] == 'tv').sum()):,} serie")
stesso_ordine = (len(q["tmdb"]) == len(cat)
                 and bool((q["tmdb"] == cat["id"].to_numpy()).all())
                 and bool((q["tipo"] == cat["type"].to_numpy()).all()))
print(f"   ** l'ordine delle righe coincide: {stesso_ordine} ** (se no, lo studente e' disallineato)")

cat2, is_tv = F.arricchisci(cat)
voc = F.costruisci_vocabolari(cat2, is_tv)
print(f"   vocabolari: gerarchia {voc['NT']:,} · generi {len(voc['gv']):,} · lingua {len(voc['lv'])} "
      f"· paesi {len(voc['cv'])} · persone {len(voc['pv']):,} · collezioni {len(voc['clv']):,} "
      f"· compagnie {len(voc['cc']):,} · sceneggiatori {len(voc['wc']):,} "
      f"· lingue parlate {len(voc['sc'])} ({time.time()-T0:.0f}s)", flush=True)

# ---------------------------------------------------------------- 2. FX
FX, cat3, _ = F.costruisci_fx(cat, voc)
Sf_salvata = sp.load_npz(ML / "spazi-trakt-tfidf.npz").tocsr()
print(f"\n2. FX costruita: {FX.shape} · nnz {FX.nnz:,}")
print(f"   spazi-trakt-tfidf.npz: {Sf_salvata.shape} · nnz {Sf_salvata.nnz:,}")
print(f"   ** forma identica: {FX.shape == Sf_salvata.shape} **")
print(f"   ** nnz identico: {FX.nnz == Sf_salvata.nnz} ** ({FX.nnz - Sf_salvata.nnz:+,})")

from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.preprocessing import normalize
Sf_mia = normalize(TfidfTransformer().fit_transform(FX)).astype(np.float32)
print(f"   la mia tfidf: {Sf_mia.shape} · nnz {Sf_mia.nnz:,}")
d = abs(Sf_mia - Sf_salvata)
print(f"   ** differenza massima dai valori salvati: {d.max() if d.nnz else 0.0:.6f} **")
print(f"   ** righe identiche al bit: {int((abs(Sf_mia - Sf_salvata).sum(1) == 0).sum()):,} "
      f"su {FX.shape[0]:,} **")
del Sf_mia

# ---------------------------------------------------------------- 3. il refit e il confronto
Cf = np.load(ML / "cf-spazio.npz")["Cf"]
ha = np.linalg.norm(Cf, axis=1) > 1e-6
print(f"\n3. il refit: target Cf {Cf.shape} · titoli con pubblico {int(ha.sum()):,}", flush=True)
from sklearn.linear_model import Ridge
t = time.time()
# ⚠️ Si addestra sulla TF-IDF, non sui conteggi grezzi: e' quello che fa `cf-edges.py:95`
# (`F = spazi-trakt-tfidf.npz`). Addestrare su FX dava un modello con correlazione 0,76 col vero
# e proiezioni con 0/50 vicini in comune: l'errore che mi ha fatto sospettare un'instabilita'
# che non esisteva.
Sf_mia2 = normalize(TfidfTransformer().fit_transform(FX)).astype(np.float32)
modello = Ridge(alpha=10.0, solver="lsqr", max_iter=600).fit(Sf_mia2[ha], Cf[ha])
P_nuova = modello.predict(Sf_mia2).astype(np.float32)
print(f"   rifit: {time.time()-t:.0f}s · coef_ {modello.coef_.shape} · intercept_ {modello.intercept_.shape}")

P_salvata = np.load(ML / "cf-studente.npz")["P"]
diff = np.abs(P_nuova - P_salvata)
print(f"\n   ** differenza massima dalla P salvata: {diff.max():.6f} **")
print(f"   ** differenza media: {diff.mean():.8f} **")
print(f"   ** righe identiche (entro 1e-5): {int((diff.max(1) < 1e-5).sum()):,} su {len(P_nuova):,} "
      f"({100*float((diff.max(1) < 1e-5).mean()):.2f}%) **")
righe_ok = diff.max(1) < 1e-5
if not righe_ok.all():
    print(f"   le righe che NON coincidono: {int((~righe_ok).sum()):,}")
    vett = np.linalg.norm(P_nuova, axis=1) > 1e-6
    print(f"     di cui con vettore non nullo nella nuova: {int((~righe_ok & vett).sum()):,}")

# ---------------------------------------------------------------- 4. si salva tutto
if not (FX.shape == Sf_salvata.shape and FX.nnz == Sf_salvata.nnz):
    print("\n!! LA COSTRUZIONE NON COINCIDE: non salvo il modello, prima va capito")
    sys.exit(1)
np.savez_compressed(
    ML / "inserimento-modello.npz",
    coef=modello.coef_.astype(np.float32),
    intercept=np.asarray(modello.intercept_, np.float32),
    n_col=np.array([FX.shape[1]]),
    alpha=np.array([10.0]),
    n_addestramento=np.array([int(ha.sum())]),
)
import pickle
with open(ML / "inserimento-vocabolari.pkl", "wb") as fh:
    pickle.dump(voc, fh)
print(f"\n4. salvati: inserimento-modello.npz "
      f"({(ML / 'inserimento-modello.npz').stat().st_size/1e6:.1f} MB · coef "
      f"{modello.coef_.nbytes/1e6:.1f} MB) e inserimento-vocabolari.pkl "
      f"({(ML / 'inserimento-vocabolari.pkl').stat().st_size/1e6:.1f} MB)")
print(f"\nFINE ({time.time()-T0:.0f}s)")
