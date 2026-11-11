"""Fedeltà per strato: lo studente sa collocare i titoli SENZA co-visione?

Il confronto è contro le righe del grafo **servito** (V45): è il riferimento che l'utente vede
davvero, e per i titoli freddi è anche l'unica verità disponibile — il loro comportamento non c'è.

Due strati, decisi dai dati:
  · CALDI  — COVISION con grado >= p75 (19.775 titoli)
  · FREDDI — COVISION con grado == 0 (31.509 titoli, il 41,2%)

Se la fedeltà dei freddi è vicina a quella dei caldi, il contenuto generalizza; se crolla, no.

  py .scratch/profili-e-identita/fedelta-per-strato.py --z .cache/studente-A-comp.npz
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[2]
V45 = ROOT / "services" / "graph" / "data" / "v45"
SERVITO = ROOT / "services" / "graph" / "data" / "v45-vicini100" / "vicini-top100.npz"
TOP = 100


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--z", required=True)
    ap.add_argument("--fuori", default=".cache/fedelta-strati.json")
    ap.add_argument("--contro", default=str(SERVITO),
                    help="righe di riferimento: il grafo servito, oppure il maestro su cui si e' "
                         "addestrato (piu' onesto: misura se ha imparato il bersaglio)")
    a = ap.parse_args()

    z = np.load(a.z, allow_pickle=True)
    Z = np.asarray(z["Z"], np.float32)
    Zn = Z / (np.linalg.norm(Z, axis=1, keepdims=True) + 1e-9)

    zv = np.load(V45 / "tipi2-pesi" / "COVISION.npz")
    cov_grado = np.diff(zv["indptr"])
    p75 = int(np.percentile(cov_grado, 75))

    servito = np.load(a.contro)
    s_indptr, s_indices = servito["indptr"], servito["indices"]

    rng = np.random.default_rng(31)
    strati = {
        "caldi": np.flatnonzero(cov_grado >= p75),
        "freddi": np.flatnonzero(cov_grado == 0),
    }
    rep = {"riferimento": Path(a.contro).name, "soglia_caldi_p75": p75, "strati": {}}
    for nome, idx in strati.items():
        campione = rng.choice(idx, size=min(400, len(idx)), replace=False)
        ov = []
        for r in campione:
            serv = set(int(x) for x in s_indices[s_indptr[r]:s_indptr[r + 1]][:TOP])
            if not serv:
                continue
            sim = Zn[r] @ Zn.T
            sim[r] = -9.0
            top = set(np.argpartition(-sim, TOP)[:TOP].tolist())
            # denominatore = la riga di riferimento, cosi' un maestro rado non penalizza
            ov.append(len(top & serv) / len(serv))
        ov = np.asarray(ov, float)
        rep["strati"][nome] = {
            "titoli": int(len(idx)),
            "campione": int(len(ov)),
            "overlap100_mediana": round(float(np.median(ov)), 3),
            "p10": round(float(np.percentile(ov, 10)), 3),
            "p90": round(float(np.percentile(ov, 90)), 3),
        }
        print(f"{nome:7s} ({len(idx):,}) · overlap@100 mediana {rep['strati'][nome]['overlap100_mediana']:.3f} "
              f"· p10 {rep['strati'][nome]['p10']:.3f} · p90 {rep['strati'][nome]['p90']:.3f}", flush=True)

    caldi = rep["strati"]["caldi"]["overlap100_mediana"]
    freddi = rep["strati"]["freddi"]["overlap100_mediana"]
    rep["divario_caldi_meno_freddi"] = round(caldi - freddi, 3)
    (ROOT / a.fuori).write_text(json.dumps(rep, indent=2), encoding="utf-8")
    print(f"divario caldi - freddi: {rep['divario_caldi_meno_freddi']:+.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
