"""Banco di ritenuta: il grafo nuovo serve meglio di quello servito?

Per ogni profilo Trakt in cache si taglia la storia in due, cronologicamente: il passato semina,
il futuro e' l'oro. Si diffonde (PPR) dai semi e si misura quanti dei titoli ritenuti compaiono
nei primi 20. Stesso banco, stesso taglio, due grafi: la differenza e' appaiata, quindi il rumore
dell'utente si annulla.

  py .scratch/profili-e-identita/banco-grafo-nuovo.py [--utenti 200] [--ritenuta 0.2]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

from graph import camminata as _cam          # noqa: E402
from graph import canon as K                # noqa: E402

SERVITO = ROOT / "services" / "graph" / "data" / "v45-transizione" / "transizione-pota16.npz"
NUOVO = ROOT / ".cache" / "ricostruzione" / "artefatti" / "transizione-pota16.npz"
TOP = 20


def carica(p: Path) -> sp.csr_matrix:
    z = np.load(p)
    n = len(z["indptr"]) - 1
    return sp.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=(n, n))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--utenti", type=int, default=200)
    ap.add_argument("--ritenuta", type=float, default=0.2)
    ap.add_argument("--nuovo", default=str(NUOVO), help="transizione del grafo da confrontare")
    ap.add_argument("--out", default=".cache/banco-grafo-nuovo.json")
    a = ap.parse_args()

    t0 = time.time()
    Tr_old, Tr_new = carica(SERVITO), carica(Path(a.nuovo))
    N = Tr_old.shape[0]
    print(f"grafo servito {Tr_old.nnz:,} · nuovo {Tr_new.nnz:,} · {time.time()-t0:.0f}s", flush=True)

    # i file sono `movie-<utente>.json` e `show-<utente>.json`: l'utente e' il suffisso
    utenti = sorted({p.stem.split("-", 1)[1] for p in (ROOT / ".cache" / "trakt" / "users").glob("*.json")
                     if p.stem.startswith(("movie-", "show-"))})
    rng = np.random.default_rng(5)
    if len(utenti) > a.utenti:
        utenti = list(rng.choice(utenti, size=a.utenti, replace=False))

    vecchio, nuovo, quanti = [], [], 0
    for u in utenti:
        try:
            chiavi, righe, plays, eta = K.storia_trakt(u, ordine="cronologico")
        except Exception:
            continue
        # dalla piu' vecchia alla piu' nuova; serve una storia abbastanza lunga per tagliarla
        visti = [(k, r, p) for k, r, p, e in zip(chiavi, righe, plays, eta) if r >= 0]
        if len(visti) < 12:
            continue
        taglio = int(len(visti) * (1 - a.ritenuta))
        passato, futuro = visti[:taglio], visti[taglio:]
        semi = np.asarray([r for _, r, _ in passato], np.int64)
        pesi = np.asarray([min(float(p), 3.0) for _, _, p in passato], np.float32)
        pesi = pesi / pesi.sum()
        oro = set(int(r) for _, r, _ in futuro)
        if not oro:
            continue

        def rec(Tr):
            v = _cam.ppr(Tr, semi, pesi)
            v[semi] = -1.0                       # i titoli gia' visti non contano
            top = set(int(i) for i in np.argsort(-v)[:TOP])
            return len(top & oro) / min(TOP, len(oro))

        vecchio.append(rec(Tr_old)); nuovo.append(rec(Tr_new)); quanti += 1
        if quanti % 25 == 0:
            print(f"  {quanti} utenti ({time.time()-t0:.0f}s)", flush=True)

    v, n_ = np.asarray(vecchio), np.asarray(nuovo)
    diff = n_ - v
    # bootstrap appaiato sulla differenza
    idx = np.arange(len(diff))
    campioni = [diff[rng.choice(idx, size=len(idx))].mean() for _ in range(2000)]
    lo, hi = np.percentile(campioni, [2.5, 97.5])
    rep = {
        "utenti": int(len(v)),
        "ritenuta": a.ritenuta,
        "recall20_servito": round(float(v.mean()), 4),
        "recall20_nuovo": round(float(n_.mean()), 4),
        "differenza": round(float(diff.mean()), 4),
        "ic95": [round(float(lo), 4), round(float(hi), 4)],
        "utenti_migliorati": int((diff > 0).sum()),
        "utenti_peggiorati": int((diff < 0).sum()),
        "secondi": round(time.time() - t0, 1),
    }
    (ROOT / a.out).write_text(json.dumps(rep, indent=2), encoding="utf-8")
    print(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
