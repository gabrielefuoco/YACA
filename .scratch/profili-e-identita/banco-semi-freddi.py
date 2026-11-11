"""Semi freddi: se un titolo senza co-visione viene collocato dal contenuto, i consigli migliorano?

È la domanda dell'utente che guarda solo roba nuova, misurata invece che discussa.

Per ogni profilo Trakt: la storia si taglia cronologicamente (il passato semina, il futuro è l'oro).
Si fanno due diffusioni con gli stessi semi:

  · base = transizione servita, così com'è (i titoli freddi hanno righe deboli: 0,4% di recall)
  · alt  = stessa transizione, ma le righe dei semi FREDDI (COVISION <= soglia) vengono sostituite
           dai top-16 dello studente, cioè da una collocazione per contenuto

Se `alt` recupera più titoli ritenuti, il contenuto sa sostituire il comportamento che manca.

  py .scratch/profili-e-identita/banco-semi-freddi.py --z .cache/studente-A-comp.npz
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

from graph import camminata as _cam   # noqa: E402
from graph import canon as K          # noqa: E402

TRANS = ROOT / "services" / "graph" / "data" / "v45-transizione" / "transizione-pota16.npz"
TOP = 20
K_RIGA = 16


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--z", required=True)
    ap.add_argument("--utenti", type=int, default=800)
    ap.add_argument("--ritenuta", type=float, default=0.2)
    ap.add_argument("--freddi-soglia", type=int, default=2)
    ap.add_argument("--out", default=".cache/banco-semi-freddi.json")
    a = ap.parse_args()

    t0 = time.time()
    z = np.load(a.z, allow_pickle=True)
    Z = np.asarray(z["Z"], np.float32)
    Zn = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    zt = np.load(TRANS)
    Tr = sp.csr_matrix((zt["data"], zt["indices"], zt["indptr"]), shape=(Zn.shape[0], Zn.shape[0]))
    N = Tr.shape[0]
    cov = np.diff(np.load(ROOT / "services" / "graph" / "data" / "v45" / "tipi2-pesi" / "COVISION.npz")["indptr"])
    freddi = cov <= a.freddi_soglia
    print(f"grafo {Tr.nnz:,} archi · freddi (COVISION<={a.freddi_soglia}): {int(freddi.sum()):,} "
          f"({100*freddi.mean():.1f}%) · {time.time()-t0:.0f}s", flush=True)

    def top_contenuto(r: int) -> tuple[np.ndarray, np.ndarray]:
        sim = Zn[r] @ Zn.T
        sim[r] = -9.0
        o = np.argpartition(-sim, K_RIGA)[:K_RIGA]
        v = np.maximum(sim[o], 0.0)
        if v.sum() <= 0:
            v = np.ones(len(o), np.float32)
        return o, v / v.sum()

    def con_righe_sostituite(righe: dict[int, tuple[np.ndarray, np.ndarray]]) -> sp.csr_matrix:
        rr, cc, vv = [], [], []
        for r in range(N):
            if r in righe:
                js, vs = righe[r]
                if len(js) == 0:
                    continue
                rr.append(np.full(len(js), r, np.int32)); cc.append(js.astype(np.int32)); vv.append(vs)
            else:
                lo, hi = Tr.indptr[r], Tr.indptr[r + 1]
                rr.append(np.full(hi - lo, r, np.int32)); cc.append(Tr.indices[lo:hi].astype(np.int32))
                vv.append(Tr.data[lo:hi].astype(np.float32))
        return sp.csr_matrix((np.concatenate(vv), (np.concatenate(rr), np.concatenate(cc))), shape=(N, N))

    utenti = sorted({p.stem.split("-", 1)[1] for p in (ROOT / ".cache" / "trakt" / "users").glob("*.json")
                     if p.stem.startswith(("movie-", "show-"))})
    rng = np.random.default_rng(13)
    if len(utenti) > a.utenti:
        utenti = list(rng.choice(utenti, size=a.utenti, replace=False))

    base_r, alt_r, base_c, alt_c = [], [], [], []
    quanti, con_freddi = 0, 0
    for u in utenti:
        try:
            chiavi, righe, plays, eta = K.storia_trakt(u, ordine="cronologico")
        except Exception:
            continue
        visti = [(k, int(r), p) for k, r, p, e in zip(chiavi, righe, plays, eta) if r >= 0]
        if len(visti) < 12:
            continue
        taglio = int(len(visti) * (1 - a.ritenuta))
        passato, futuro = visti[:taglio], visti[taglio:]
        if not futuro:
            continue
        semi = np.asarray([r for _, r, _ in passato], np.int64)
        if not freddi[semi].any():
            continue                      # nessun seme freddo: non insegna niente su questo
        con_freddi += 1
        pesi = np.asarray([min(float(p), 3.0) for _, _, p in passato], np.float32)
        pesi = pesi / pesi.sum()
        oro = np.asarray([r for _, r, _ in futuro], np.int64)
        oro_freddi = oro[freddi[oro]]

        def rec(Tr_use):
            v = _cam.ppr(Tr_use, semi, pesi)
            v[semi] = -1.0
            top = set(int(i) for i in np.argsort(-v)[:TOP])
            r_all = len(top & set(oro.tolist())) / min(TOP, len(oro))
            r_fred = len(top & set(oro_freddi.tolist())) / min(TOP, len(oro_freddi)) if len(oro_freddi) else np.nan
            return r_all, r_fred

        b_all, b_fred = rec(Tr)
        Tr_alt = con_righe_sostituite({int(r): top_contenuto(int(r)) for r in semi if freddi[r]})
        a_all, a_fred = rec(Tr_alt)
        base_r.append(b_all); alt_r.append(a_all); base_c.append(b_fred); alt_c.append(a_fred)
        quanti += 1
        if quanti % 100 == 0:
            print(f"  {quanti} utenti con semi freddi ({time.time()-t0:.0f}s)", flush=True)

    b, a_ = np.asarray(base_r), np.asarray(alt_r)
    bc = np.asarray([x for x in base_c if not np.isnan(x)])
    ac = np.asarray([x for x in alt_c if not np.isnan(x)])
    d_all, d_fred = a_ - b, ac - bc
    idx = np.arange(len(d_all))
    boot = [d_all[rng.choice(idx, size=len(idx))].mean() for _ in range(2000)]
    lo, hi = np.percentile(boot, [2.5, 97.5])
    rep = {
        "utenti_con_semi_freddi": int(quanti),
        "freddi_soglia": a.freddi_soglia,
        "recall20_tutti": {"base": round(float(b.mean()), 4), "contenuto": round(float(a_.mean()), 4),
                           "differenza": round(float(d_all.mean()), 4), "ic95": [round(float(lo), 4), round(float(hi), 4)],
                           "migliorati": int((d_all > 0).sum()), "peggiorati": int((d_all < 0).sum())},
        "recall20_bersagli_freddi": {"base": round(float(bc.mean()), 4), "contenuto": round(float(ac.mean()), 4),
                                     "differenza": round(float(d_fred.mean()), 4),
                                     "migliorati": int((d_fred > 0).sum()), "peggiorati": int((d_fred < 0).sum())},
        "secondi": round(time.time() - t0, 1),
    }
    (ROOT / a.out).write_text(json.dumps(rep, indent=2), encoding="utf-8")
    print(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
