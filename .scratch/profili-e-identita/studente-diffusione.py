"""23 / 20 — la diffusione: lo studente serve meglio i consigli del RRF fisso?

Protocollo identico per le due alternative, così il confronto è onesto:

  · semi = 12 gruppi di 5 titoli pescati dai **999 esclusi dal training** (nessuno li ha visti)
  · base = transizione potata servita (il grafo vero)
  · alt_studente = le righe dei semi sostituite coi top-16 dello studente (forma B)
  · alt_rrf      = le righe dei semi sostituite coi top-16 del RRF a pesi fissi sulle 7 fonti

Si diffonde (PPR) e si confronta il top-20 con la base. Vince chi si avvicina di più al servito.

  py .scratch/profili-e-identita/studente-diffusione.py
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

from graph import camminata as _cam  # noqa: E402

V45 = ROOT / "services" / "graph" / "data" / "v45"
TRANS = ROOT / "services" / "graph" / "data" / "v45-transizione" / "transizione-pota16.npz"
STUDENTE = ROOT / ".cache" / "studente-B-held.npz"
PESI = json.loads((V45 / "pesi.json").read_text())
CONTENUTO = ["KWSEM", "DIR", "COLL", "CAST", "PROD", "CREWPROP", "TRAMA"]
RRF_K = 15
K_RIGA = 16
N_GRUPPI, SEMI = 12, 5
TOP = 20


def main() -> int:
    t0 = time.time()
    zsp = np.load(ROOT / "services" / "graph" / "data" / "spazi-trakt.npz", allow_pickle=True)
    N = len(zsp["tmdb"])

    zt = np.load(TRANS)
    Tr = sp.csr_matrix((zt["data"], zt["indices"], zt["indptr"]), shape=(N, N))
    zs = np.load(STUDENTE, allow_pickle=True)
    Z = np.asarray(zs["Z"], np.float32)
    Zn = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)
    esclusi = np.asarray(zs["heldout"], np.int64)
    print(f"transizione {Tr.nnz:,} archi · studente Z {Z.shape} · esclusi {len(esclusi):,} · "
          f"{time.time()-t0:.0f}s", flush=True)

    fonti = {}
    for t in CONTENUTO:
        z = np.load(V45 / "tipi2-pesi" / f"{t}.npz")
        fonti[t] = sp.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=(N, N)).tocsr()

    def top_studente(r: int) -> tuple[np.ndarray, np.ndarray]:
        sim = Zn[r] @ Zn.T
        sim[r] = -9.0
        o = np.argpartition(-sim, K_RIGA)[:K_RIGA]
        v = np.maximum(sim[o], 0.0)
        if v.sum() <= 0:
            v = np.ones(len(o), np.float32)
        return o, v / v.sum()

    def top_rrf(r: int) -> tuple[np.ndarray, np.ndarray]:
        punteggi: dict[int, float] = {}
        for t, S in fonti.items():
            lo, hi = S.indptr[r], S.indptr[r + 1]
            if lo == hi:
                continue
            js, vs = S.indices[lo:hi], S.data[lo:hi]
            o = np.argsort(-vs)
            js = js[o]
            for j, w in zip(js, PESI[t] / (RRF_K + np.arange(len(js)))):
                punteggi[int(j)] = punteggi.get(int(j), 0.0) + float(w)
        voci = sorted(punteggi.items(), key=lambda kv: -kv[1])[:K_RIGA]
        if not voci:
            return np.array([], np.int64), np.array([], np.float32)
        js = np.asarray([j for j, _ in voci], np.int64)
        vs = np.asarray([v for _, v in voci], np.float64)
        return js, (vs / vs.sum()).astype(np.float32)

    def transizione_con(righe_nuove: dict[int, tuple[np.ndarray, np.ndarray]]) -> sp.csr_matrix:
        rr, cc, vv = [], [], []
        for r in range(N):
            if r in righe_nuove:
                js, vs = righe_nuove[r]
                if len(js) == 0:
                    continue
                rr.append(np.full(len(js), r, np.int32)); cc.append(js.astype(np.int32)); vv.append(vs)
            else:
                lo, hi = Tr.indptr[r], Tr.indptr[r + 1]
                rr.append(np.full(hi - lo, r, np.int32)); cc.append(Tr.indices[lo:hi].astype(np.int32))
                vv.append(Tr.data[lo:hi].astype(np.float32))
        return sp.csr_matrix((np.concatenate(vv), (np.concatenate(rr), np.concatenate(cc))), shape=(N, N))

    rng = np.random.default_rng(11)
    gruppi = [rng.choice(esclusi, size=SEMI, replace=False) for _ in range(N_GRUPPI)]
    out_s, out_r = [], []
    for gi, semi in enumerate(gruppi, 1):
        pesi = np.ones(len(semi), np.float32) / len(semi)
        base_v = _cam.ppr(Tr, semi, pesi)
        base = {int(i) for i in np.argsort(-base_v)[: TOP]}

        alt_s = _cam.ppr(transizione_con({int(r): top_studente(int(r)) for r in semi}), semi, pesi)
        alt_r = _cam.ppr(transizione_con({int(r): top_rrf(int(r)) for r in semi}), semi, pesi)
        ts = {int(i) for i in np.argsort(-alt_s)[: TOP]}
        tr = {int(i) for i in np.argsort(-alt_r)[: TOP]}
        out_s.append(len(base & ts) / TOP)
        out_r.append(len(base & tr) / TOP)
        print(f"  gruppo {gi:2d}: studente @20 {out_s[-1]:.2f} · rrf @20 {out_r[-1]:.2f} · "
              f"{time.time()-t0:.0f}s", flush=True)

    rep = {
        "gruppi": N_GRUPPI, "semi_per_gruppo": SEMI, "semi_da": f"{len(esclusi):,} titoli mai visti",
        "studente_B": {"mediana": round(float(np.median(out_s)), 3), "min": round(float(min(out_s)), 3)},
        "rrf_fisso": {"mediana": round(float(np.median(out_r)), 3), "min": round(float(min(out_r)), 3)},
        "secondi": round(time.time() - t0, 1),
    }
    (ROOT / ".cache" / "studente-diffusione.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")
    print(json.dumps(rep, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
