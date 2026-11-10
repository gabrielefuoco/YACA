"""Ticket 20, parte 2 — la diffusione: semi collocati per contenuto danno gli stessi consigli?

La parte 1 misura le righe. Ma il prodotto non mostra righe: mostra scaffali, cioe' il risultato
di una diffusione (PPR) a partire dai semi. Questo script risponde alla domanda vera:

  se il seme avesse la riga «solo contenuto» invece di quella servita, i primi titoli consigliati
  sarebbero gli stessi?

Metodo: per 12 insiemi di semi (5 titoli ciascuno, dal campione del ticket 20), si sostituiscono
le righe dei semi nella transizione potata con i loro top-16 «solo contenuto» (rinormalizzati),
si diffonde, e si confronta il top-20 con quello ottenuto sulla transizione servita.

Uso: PYTHONPATH=services py .scratch/profili-e-identita/ticket20-ppr.py
"""
from __future__ import annotations

import importlib.util
import json
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services"))

spec = importlib.util.spec_from_file_location("m20", ROOT / ".scratch" / "profili-e-identita" / "ticket20-misura.py")
m20 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m20)

from graph import camminata as _cam  # noqa: E402

TRANS = ROOT / "services" / "graph" / "data" / "v45-transizione" / "transizione-pota16.npz"
OUT = ROOT / ".cache" / "ticket20-ppr.json"
N_GRUPPI = 12
SEMI_PER_GRUPPO = 5
TOP = 20


def main() -> int:
    t0 = time.time()
    z = np.load(ROOT / "services" / "graph" / "data" / "spazi-trakt.npz", allow_pickle=True)
    N = len(z["tmdb"])

    zt = np.load(TRANS)
    Tr = sp.csr_matrix((zt["data"], zt["indices"], zt["indptr"]), shape=(N, N))
    print(f"transizione potata: {Tr.nnz:,} archi · {time.time()-t0:.0f}s", flush=True)

    # righe del campione, con la loro riga «solo contenuto»
    campione = m20.righe_campionate(N, 100)
    righe = np.unique(np.concatenate(list(campione.values())))
    solo_campione = {}
    for t, peso in m20.PESI.items():
        if t in m20.BEHAV or not (m20.SRC / f"{t}.npz").is_file():
            continue
        A = m20.carica(t, N)
        if t in m20.HUB_TIPI:
            A = m20.correggi_hub(A, m20.HUB_BETA)
        A = A.tocsr()
        for r in righe:
            lo, hi = A.indptr[r], A.indptr[r + 1]
            solo_campione.setdefault(int(r), {})[t] = (A.indices[lo:hi], A.data[lo:hi], peso)
    print(f"righe «solo contenuto» pronte per {len(solo_campione):,} titoli · {time.time()-t0:.0f}s", flush=True)

    def top_contenuto(r: int, k: int = 16) -> tuple[np.ndarray, np.ndarray]:
        entrate = list(solo_campione[int(r)].values())
        punteggi: dict[int, float] = {}
        for cols, vals, w in entrate:
            if len(cols) == 0:
                continue
            o = np.argsort(-vals)
            js = cols[o]
            for j, c in zip(js, w / (m20.RRF_K + np.arange(len(js)))):
                punteggi[int(j)] = punteggi.get(int(j), 0.0) + float(c)
        voci = sorted(punteggi.items(), key=lambda kv: -kv[1])[:k]
        return np.asarray([j for j, _ in voci], np.int64), np.asarray([v for _, v in voci], np.float64)

    def top_di(v: np.ndarray) -> list[int]:
        """I primi TOP indici per punteggio PPR, escludendo i semi stessi e i punteggi nulli."""
        ordine = np.argsort(-v)
        return [int(i) for i in ordine[: TOP * 4] if v[i] > 0][:TOP]

    rng = np.random.default_rng(7)
    gruppi = [rng.choice(righe, size=SEMI_PER_GRUPPO, replace=False) for _ in range(N_GRUPPI)]
    risultati = []
    for gi, semi in enumerate(gruppi, 1):
        pesi = np.ones(len(semi), np.float32) / len(semi)
        base = top_di(_cam.ppr(Tr, semi, pesi))

        # transizione alternativa: solo le righe dei semi vengono riscritte coi vicini «solo contenuto»
        righe_new, cols_new, vals_new = [], [], []
        sostituite = set(int(s) for s in semi)
        for r in range(N):
            lo, hi = Tr.indptr[r], Tr.indptr[r + 1]
            if r in sostituite:
                cc, vv = top_contenuto(r, k=16)
                if len(cc) == 0:
                    continue
                vv = vv / vv.sum()
                righe_new.append(np.full(len(cc), r, np.int32))
                cols_new.append(cc.astype(np.int32))
                vals_new.append(vv.astype(np.float32))
            else:
                righe_new.append(np.full(hi - lo, r, np.int32))
                cols_new.append(Tr.indices[lo:hi].astype(np.int32))
                vals_new.append(Tr.data[lo:hi].astype(np.float32))
        Tr2 = sp.csr_matrix(
            (np.concatenate(vals_new), (np.concatenate(righe_new), np.concatenate(cols_new))), shape=(N, N)
        )
        alt = top_di(_cam.ppr(Tr2, semi, pesi))

        a = base
        b = alt
        inter = len(set(a) & set(b))
        risultati.append(
            {
                "gruppo": gi,
                "semi": [int(s) for s in semi],
                "overlap@10": len(set(a[:10]) & set(b[:10])) / 10,
                "overlap@20": inter / TOP,
            }
        )
        print(f"  gruppo {gi:2d}: overlap@10 {risultati[-1]['overlap@10']:.2f} · @20 {inter/TOP:.2f} ({time.time()-t0:.0f}s)", flush=True)

    v10 = np.asarray([r["overlap@10"] for r in risultati])
    v20 = np.asarray([r["overlap@20"] for r in risultati])
    report = {
        "gruppi": N_GRUPPI,
        "semi_per_gruppo": SEMI_PER_GRUPPO,
        "overlap10_mediana": round(float(np.median(v10)), 3),
        "overlap10_min": round(float(v10.min()), 3),
        "overlap20_mediana": round(float(np.median(v20)), 3),
        "overlap20_min": round(float(v20.min()), 3),
        "dettaglio": risultati,
        "secondi": round(time.time() - t0, 1),
    }
    OUT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("overlap10_mediana", "overlap20_mediana", "overlap20_min", "secondi")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
