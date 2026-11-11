"""Congela KWSEM: il grafo delle keyword e la proiezione dei titoli su di esso.

La ricetta VERA non è solo PPMI: il manifest dice «PPMI + semantica, alpha 0,6, Qwen3», cioè il
modulo `kw_sem.py`, non `tipi.cmd_kw`. Gl'incorporamenti dei nomi delle keyword sono in cache
(`embeddings/kwsem-qwen3-0.6b.npz`), quindi la parte semantica non costa GPU. Spezzata in due pezzi
congelabili:

  1. `G` — il grafo vocabolo×vocabolo: per ogni keyword i suoi `per_kw` vicini, pesati PPMI.
     Dipende dal corpus (co-occorrenza su tutti i titoli) → si calcola una volta.
  2. `Xs` — i titoli proiettati su quel grafo (`Xk @ G`), in forma sparsa, con le norme di riga.

Con questi due, la riga di un titolo nuovo costa: vettore keyword → `@ G` → norma → prodotti scalari
contro `Xs` (un passaggio, non una passata sul corpus).

  py .scratch/profili-e-identita/congela-kwsem.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from services.graph.build import data as D     # noqa: E402
from services.graph.build import kw_sem as KW  # noqa: E402

OUT = ROOT / ".cache" / "fonti"
PER_KW = 20
SEM_ALPHA = 0.6
MODELLO = "Qwen/Qwen3-Embedding-0.6B"
BLK = 1000


def embedding_cpu(nomi: list[str], modello: str, batch: int = 128, maxlen: int = 48) -> np.ndarray:
    """Gl'incorporamenti dei nomi delle keyword, in float32.

    `kw_sem.embed_nomi` usa float16 e la GPU: senza GPU il float16 su CPU è ~50 volte più lento.
    La matematica è la stessa (ultimo token, normalizzazione L2): cambia solo la precisione di calcolo,
    che qui non conta perché i coseni vengono poi confrontati con soglie larghe.
    """
    import torch
    from transformers import AutoModel, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(modello, padding_side="left")
    mod = AutoModel.from_pretrained(modello, dtype=torch.float32).eval()
    out = np.zeros((len(nomi), mod.config.hidden_size), np.float32)
    testi = [KW.ISTRUZIONE.format(t=n) for n in nomi]
    t0 = time.time()
    with torch.inference_mode():
        for st in range(0, len(testi), batch):
            b = tok(testi[st:st + batch], padding=True, truncation=True, max_length=maxlen,
                    return_tensors="pt")
            h = mod(**b).last_hidden_state[:, -1, :].float()
            out[st:st + batch] = torch.nn.functional.normalize(h, dim=1).numpy()
            if (st // batch) % 8 == 0:
                print(f"    embedding {st}/{len(testi)} ({time.time()-t0:.0f}s)", flush=True)
    return out


def main() -> int:
    t0 = time.time()
    OUT.mkdir(parents=True, exist_ok=True)
    B = D.basic(); N = B["N"]
    X = D.tfidf(); V = D.vocab()
    coppie = [(t, c) for t, c in V.items() if t.startswith("kw:")]
    nomi = [t for t, _ in coppie]
    cols = [c for _, c in coppie]
    Xk = X[:, cols].tocsr().astype(np.float32)
    n = np.sqrt(np.asarray(Xk.multiply(Xk).sum(1)).ravel()) + 1e-9
    Xk = (sp.diags(1.0 / n) @ Xk).tocsr()
    n_kw = Xk.shape[1]
    print(f"keyword: {n_kw:,} vocaboli · {Xk.nnz:,} coppie titolo-vocabolo · {time.time()-t0:.0f}s",
          flush=True)

    marg = np.asarray(Xk.sum(0)).ravel().astype(np.float64) + 1e-9
    righe, col, val = [], [], []
    for st in range(0, n_kw, BLK):
        blocco = (Xk.T[st:min(st + BLK, n_kw)] @ Xk).tocsr()
        for r, j in enumerate(range(st, min(st + BLK, n_kw))):
            riga = blocco.getrow(r)
            if riga.nnz == 0:
                continue
            c = riga.data.astype(np.float64)
            js = riga.indices
            w = np.log(c * N / (marg[j] * marg[js]))          # PPMI
            tieni = (w > 0) & (js != j)
            js, w = js[tieni], w[tieni]
            if not len(js):
                continue
            o = np.argpartition(-w, min(PER_KW, len(w) - 1))[:PER_KW]
            s = w[o].sum()
            if s <= 0:
                continue
            righe.extend([j] * len(o)); col.extend(js[o].tolist()); val.extend((w[o] / s).tolist())
        if st % (BLK * 5) == 0:
            print(f"  grafo keyword {min(st+BLK, n_kw)}/{n_kw} ({time.time()-t0:.0f}s)", flush=True)

    G = sp.csr_matrix((np.float32(val), (np.int32(righe), np.int32(col))), shape=(n_kw, n_kw))
    G.setdiag(0); G.eliminate_zeros()
    print(f"G PPMI: {G.nnz:,} archi · {time.time()-t0:.0f}s", flush=True)

    # la parte semantica: embedding dei NOMI delle keyword (in cache) → vicinato coseno → blend
    E = embedding_cpu(nomi, MODELLO)
    Gs = KW.grafo_semantico(E, PER_KW)
    print(f"G semantica: {Gs.nnz:,} archi · {time.time()-t0:.0f}s", flush=True)
    G = ((1.0 - SEM_ALPHA) * G + SEM_ALPHA * Gs).tocsr()
    G.setdiag(0); G.eliminate_zeros()
    print(f"G combinato (alpha {SEM_ALPHA}): {G.nnz:,} archi", flush=True)

    Xs = (Xk @ G).tocsr().astype(np.float32)
    Xs.eliminate_zeros()
    # shrinkage identico a `topk_cos_sparse(shrink=True)`: un titolo con una sola keyword non arriva
    # a coseno 1,0
    q = np.sqrt(np.asarray(Xs.multiply(Xs).sum(1)).ravel()).astype(np.float64)
    tau = float(np.median(q[q > 0])) if (q > 0).any() else 1.0
    norme = np.sqrt(q ** 2 + tau ** 2).astype(np.float32)
    print(f"shrinkage: tau {tau:.4f}", flush=True)
    sp.save_npz(OUT / "KWSEM_Xs.npz", Xs)
    sp.save_npz(OUT / "KWSEM_G.npz", G)
    np.save(OUT / "KWSEM_norme.npy", norme)
    (OUT / "KWSEM.json").write_text(json.dumps({
        "n_kw": int(n_kw), "per_kw": PER_KW, "sem_alpha": SEM_ALPHA, "tau": tau,
        "modello": MODELLO, "nomi": nomi, "cols": cols,
        "nota": "l'ordine di `nomi`/`cols` è quello del vocabolario: una colonna sbagliata ruota lo spazio",
    }), encoding="utf-8")
    print(f"scritto KWSEM: Xs {Xs.shape} ({Xs.nnz:,} nonzero) · {time.time()-t0:.0f}s", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
