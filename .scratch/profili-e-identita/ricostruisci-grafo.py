"""Ricostruisce il grafo con il nuovo studente e lo confronta con quello servito.

E' il test che il ticket 23 rende possibile: le quattordici fonti sono su disco, mancava solo
`RRFST`. Qui si rigenera quella fonte dal nuovo studente e si rifà la catena esatta della pipeline
(`norm` → `budget` → `mixer` → `chiudi` → `prepara`), scrivendo tutto in `.cache/ricostruzione/`
senza toccare niente di servito.

  py .scratch/profili-e-identita/ricostruisci-grafo.py [--solo-rrfst]
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp
import torch

ROOT = Path(__file__).resolve().parents[2]
V45 = ROOT / "services" / "graph" / "data" / "v45"
LAV = ROOT / ".cache" / "ricostruzione"
Z_FILE = ROOT / ".cache" / "studente-B-usare.npz"
K = 100
PESI = json.loads((V45 / "pesi.json").read_text())


def rrfst_dal_nuovo_studente(out: Path) -> None:
    """Gli archi della nuova fonte: coseno top-100 su Z, come `cmd_rrfst` ma su GPU."""
    t0 = time.time()
    z = np.load(Z_FILE, allow_pickle=True)
    Z = np.asarray(z["Z"], np.float32)
    N = Z.shape[0]
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    Zt = torch.from_numpy(Z).to(dev)
    Zt = torch.nn.functional.normalize(Zt, dim=1)
    print(f"  studente {Z.shape} su {dev}", flush=True)

    righe, colonne, valori = [], [], []
    BLK = 2048
    for st in range(0, N, BLK):
        blk = Zt[st:st + BLK]
        sim = (blk @ Zt.T).float()
        for r in range(sim.shape[0]):
            sim[r, st + r] = -9.0
            idx = torch.topk(sim[r], K).indices
            w = sim[r][idx]
            ok = w > 0
            idx, w = idx[ok], w[ok]
            righe.append(np.full(len(idx), st + r, np.int32))
            colonne.append(idx.cpu().numpy().astype(np.int32))
            valori.append(w.cpu().numpy().astype(np.float32))
        if st % (BLK * 8) == 0:
            print(f"    {min(st+BLK, N)}/{N} ({time.time()-t0:.0f}s)", flush=True)
    M = sp.csr_matrix((np.concatenate(valori), (np.concatenate(righe), np.concatenate(colonne))), shape=(N, N))
    np.savez_compressed(out, indptr=M.indptr.astype(np.int64), indices=M.indices.astype(np.int32),
                        data=M.data.astype(np.float32))
    print(f"  RRFST nuovo: {M.nnz:,} archi · grado mediano {int(np.median(np.diff(M.indptr)))} · "
          f"{time.time()-t0:.0f}s", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo-rrfst", action="store_true")
    a = ap.parse_args()

    tipi = LAV / "tipi"
    norm = LAV / "norm"
    pesi = LAV / "pesi"
    mix = LAV / "mix"
    art = LAV / "artefatti"
    for d in (tipi, norm, pesi, mix, art):
        d.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    print("1. la fonte dello studente", flush=True)
    rrfst_dal_nuovo_studente(tipi / "RRFST.npz")
    if a.solo_rrfst:
        print("fermo qui (--solo-rrfst)")
        return 0

    print("2. le altre tredici fonti, copiate dal build servito", flush=True)
    man = json.loads((V45 / "tipi2" / "manifest.json").read_text(encoding="utf-8"))
    for nome in man:
        if nome == "RRFST":
            continue
        shutil.copy2(V45 / "tipi2" / f"{nome}.npz", tipi / f"{nome}.npz")
    man["RRFST"] = {"descrizione": "top-100 coseno sui vettori del NUOVO studente (forma B, V45 maestro)",
                    "params": {"k": K}, "archi": int(np.load(tipi / "RRFST.npz")["indices"].shape[0])}
    (tipi / "manifest.json").write_text(json.dumps(man, indent=1), encoding="utf-8")
    print(f"  {len(man)} fonti pronte ({time.time()-t0:.0f}s)", flush=True)

    env = {"PYTHONPATH": str(ROOT / "services"), "TIPI_OUT": str(tipi), "NORM_OUT": str(norm),
           "PESI_OUT": str(pesi), "MIX_OUT": str(mix)}
    import os
    e = dict(os.environ, **env)

    def run(cmd: list[str], titolo: str) -> None:
        print(f"   → {titolo} ({time.time()-t0:.0f}s)", flush=True)
        r = subprocess.run(cmd, cwd=ROOT, env=e)
        if r.returncode != 0:
            raise SystemExit(f"FALLITO: {' '.join(cmd)}")
        print(f"     fatto ({time.time()-t0:.0f}s)", flush=True)

    print("3. normalizzazione", flush=True)
    run([sys.executable, "-u", "-m", "graph.build.tipi", "norm"], "norm")
    print("4. budget per riga", flush=True)
    run([sys.executable, "-u", "-m", "graph.build.tipi", "budget", "--pota", "100"], "budget")

    print("5. fusione RRF", flush=True)
    (mix / "pesi.json").write_text(json.dumps(PESI, indent=1), encoding="utf-8")
    run([sys.executable, "-u", "-m", "graph.build.mixer", "--modo", "rrf", "--rrf-k", "15",
         "--damp-coll", "--damp-titolo", "--gate-asimmetrico", "--pop-gap", "2.0",
         "--pop-slope", "1.5", "--gate-k", "10", "--damp-animazione", "--damp-anim-fattore", "0.2",
         "--tipi", ",".join(sorted(PESI.keys()))], "mixer")

    print("6. chiusura", flush=True)
    run([sys.executable, "-u", "-m", "graph.build.chiudi", str(mix / "MIX-rrf-dc-dt-ga.npz"),
         str(art / "v45-triangolo-nuovo.npz"), "--modo", "log"], "chiudi")

    print("7. prepara (vicini + transizione)", flush=True)
    run([sys.executable, "-u", "-m", "graph.runtime.prepara", "--target", "entrambi",
         "--in", str(art / "v45-triangolo-nuovo.npz"), "--out", str(art)], "prepara")

    print(f"\nartefatti in {art} · totale {time.time()-t0:.0f}s", flush=True)
    for p in sorted(art.glob("*.npz")):
        print(f"  {p.name} {p.stat().st_size/2**20:.0f} MB", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
