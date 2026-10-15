"""01-componente-trama.py — il componente di TRAMA: dagli embedding agli archi del grafo.

L'architettura dell'utente: **un unico grafo eterogeneo**. Gli embedding non sono un canale a valle ma
un **nuovo tipo di arco**, come KW, CAST, CF. Quindi diventano una matrice sparsa di archi pesati, che
Leiden vede come vede tutte le altre viste.

COME SI FA:
  1. gli embedding (35.829 × 1024, gia' calcolati con qwen3, payload «titolo. trama»);
  2. **normalizzati** — Ollama li restituisce grezzi, e il coseno vuole la norma 1;
  3. il **k-NN a blocchi**: 35.829 x 35.829 x 1024 non si materializza, ma 2.000 righe per volta
     costano ~70 GFLOP e in 18 blocchi si fa in mezzo minuto;
  4. la **simmetrizzazione** come il resto del progetto: `(M + M.T) / 2`;
  5. il **contratto di non-vuotezza** e il controllo di **leggibilita'**: i vicini di dieci titoli
     noti. Se *Toy Story* non ha i suoi seguiti fra i primi, il componente e' sbagliato e si vede qui.

Il limite, dichiarato: la copertura e' del **42%** — solo chi ha una trama — e il componente non puo'
essere l'unico. Entra in una miscela dove gli altri cinque coprono il resto.
"""
import json
import pathlib
import sys
import time

import numpy as np
import pandas as pd
import scipy.sparse as sp

QUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(QUI.parent / "ml-collaborativo"))
sys.path.insert(0, str(QUI.parent / "bolle-nitrile"))
import bolle as B
import canone as K

T0 = time.time()
ML = K.ML
TOPK = 30
SOGLIA = 0.30          # da misurare: si stampa il grado a varie soglie prima di scegliere
BLOCCO = 2000

print("=" * 100)
print("IL COMPONENTE DI TRAMA — dagli embedding agli archi")
print("=" * 100, flush=True)

E = np.load(ML / "04-trama-qwen3b.npy")
IDX = np.load(ML / "04-trama-qwen3b-idx.npy")
print(f"  embedding: {E.shape} · norme da {np.linalg.norm(E[0]):.3f} a "
      f"{np.linalg.norm(E[5]):.3f} (grezze: vanno normalizzate)", flush=True)
E = E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)
N = B.N
print(f"  righe del canone coperte: {len(IDX):,}/{N:,} ({100*len(IDX)/N:.1f}%)", flush=True)

# ---------------------------------------------------------------- il k-NN a blocchi
print(f"\n  k-NN a blocchi da {BLOCCO} ({time.time()-T0:.0f}s)", flush=True)
righe, colonne, valori = [], [], []
for start in range(0, len(E), BLOCCO):
    fine = min(start + BLOCCO, len(E))
    S = E[start:fine] @ E.T                       # (blocco, 35829)
    # la diagonale e' nella COLONNA della posizione, non della riga del canone: `IDX` sono righe
    # del canone (fino a 66.259) mentre `S` ha 35.829 colonne, una per posizione nell'embedding.
    np.fill_diagonal(S[:, start:fine], -2.0)      # se stessi fuori
    if S.shape[1] > TOPK:
        presi = np.argpartition(-S, TOPK, axis=1)[:, :TOPK]
    else:
        presi = np.tile(np.arange(S.shape[1]), (S.shape[0], 1))
    for k in range(S.shape[0]):
        j = presi[k]
        v = S[k, j]
        ok = v > SOGLIA
        righe.extend([int(IDX[start + k])] * int(ok.sum()))
        colonne.extend(IDX[j[ok]].tolist())
        valori.extend(v[ok].tolist())
    if (start // BLOCCO + 1) % 5 == 0:
        print(f"    {fine:,}/{len(E):,} ({time.time()-T0:.0f}s)", flush=True)

M = sp.csr_matrix((valori, (righe, colonne)), shape=(N, N), dtype=np.float32)
M.setdiag(0)
M.eliminate_zeros()
print(f"  archi diretti: {M.nnz:,} ({time.time()-T0:.0f}s)", flush=True)
M = ((M + M.T) * 0.5).tocsr()
M.setdiag(0)
M.eliminate_zeros()
g = np.asarray((M > 0).sum(1)).ravel()
print(f"  dopo la simmetrizzazione: {M.nnz:,} archi · grado mediano {int(np.median(g))} · "
      f"titoli con archi {int((g > 0).sum()):,} ({100*(g>0).mean():.1f}%)", flush=True)

# ---------------------------------------------------------------- il contratto
print(f"\n  CONTRATTO di non-vuotezza, e il grado a soglie diverse:")
for soglia in (0.20, 0.30, 0.40, 0.50, 0.60):
    A = M.copy()
    A.data = np.where(A.data >= soglia, A.data, 0.0)
    A.eliminate_zeros()
    ga = np.asarray((A > 0).sum(1)).ravel()
    print(f"    soglia {soglia:.2f}: {A.nnz:>9,} archi · grado mediano {int(np.median(ga)):>3} · "
          f"coperti {int((ga > 0).sum()):>7,} ({100*(ga>0).mean():5.1f}%)")
cop, med = B.assert_componente(None, "TRAMA", min_copertura=0.30, min_mediana=3, matrice=M)
print(f"    -> copertura {100*cop:.1f}% · grado mediano dei non isolati {med:.0f} (soglie: 30% e 3)")

# ---------------------------------------------------------------- la leggibilita'
print("\n" + "=" * 100)
print("CONTROLLO DI LEGGIBILITA' — i vicini di dieci titoli noti, per TITOLO")
print("=" * 100, flush=True)
PQ = pathlib.Path(".cache/tmdb")
TIT = np.array([""] * N, dtype=object)
PER_RIGA = {}
for typ, f, col in (("movie", "movies.parquet", "title"), ("tv", "tv.parquet", "name")):
    d = pd.read_parquet(PQ / f, columns=["id", col])
    for r in d.itertuples(index=False):
        riga = B.ROW_OF.get(f"{typ}:{int(r.id)}")
        if riga is not None:
            TIT[int(riga)] = str(getattr(r, col) or "")
            PER_RIGA[int(riga)] = (typ, int(r.id))


def vicini_di(riga, quanti=6):
    r = M.getrow(riga)
    if r.nnz == 0:
        return []
    o = np.argsort(-r.data)[:quanti]
    return [(float(r.data[t]), TIT[int(r.indices[t])]) for t in o]


DA_GUARDARE = ["Toy Story - Il mondo dei giocattoli", "Fight Club", "Inception",
               "L'amore bugiardo - Gone Girl", "Il padrino", "La citta' incantata",
               "Shutter Island", "Seven", "Pulp Fiction", "Il silenzio degli innocenti"]
for nome in DA_GUARDARE:
    hit = [r for r in IDX if TIT[int(r)].lower().startswith(nome.lower()[:18])]
    if not hit:
        print(f"\n  «{nome}»: non trovato")
        continue
    riga = int(hit[0])
    print(f"\n  {TIT[riga][:44]}")
    for v, t in vicini_di(riga):
        print(f"     {v:.3f}  {t[:52]}")

np.savez_compressed(ML / "eterogeneo-TRAMA.npz", data=M.data, indices=M.indices, indptr=M.indptr)
print(f"\n  salvato: eterogeneo-TRAMA.npz ({M.nnz:,} archi)")
print(f"FINE ({time.time()-T0:.0f}s)")
