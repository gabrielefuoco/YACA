"""bench.py — Benchmark delle configurazioni di potatura per il grafo V45.

PERCHÉ ESISTE.
V45 conta 76.497 nodi e 50.660.592 archi float32. In un container Docker con limite di 512 MiB,
caricare e servire 50,6M archi rischia l'OOM durante la fase di transizione o camminata (~627 MiB peak RSS).
Questo benchmark misura scientificamente il compromesso tra memoria (peak RSS psutil e tracemalloc),
tempo di caricamento/potatura e latenza di query (mediana e 95° percentile su 20 richieste di 30 semi,
precedute da 2 richieste di warmup) per le configurazioni pota in (None, 64, 32, 16) e per il percorso
a transizione precalcolata (`carica_transizione` a pota=16).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import tracemalloc
from pathlib import Path

import numpy as np

try:
    import psutil
except ImportError:
    psutil = None

from graph.runtime.engine import Engine, DEFAULT_CAP

CONFIGURAZIONI = (
    ("carica", None, "None"),
    ("carica", 64, "64"),
    ("carica", 32, "32"),
    ("carica", 16, "16"),
    ("carica_transizione", 16, "16 (carica_transizione)"),
)

NUM_RICHIESTE = 20
NUM_WARMUP = 2
SEMI_PER_RICHIESTA = 30
CAP = DEFAULT_CAP
RNG_SEED = 20261106


def _get_peak_rss_mib() -> float | None:
    """Restituisce il picco di Resident Set Size (RSS) in MiB tramite psutil se disponibile."""
    if psutil is None:
        return None
    proc = psutil.Process()
    mem = proc.memory_info()
    if hasattr(mem, "peak_wset"):
        return mem.peak_wset / (1024 * 1024)
    try:
        import resource
        rusage = resource.getrusage(resource.RUSAGE_SELF)
        if sys.platform == "darwin":
            return rusage.ru_maxrss / (1024 * 1024)
        return rusage.ru_maxrss / 1024
    except Exception:
        return mem.rss / (1024 * 1024)


def esegui_singolo(modo: str, pota: int | None, etichetta: str) -> dict:
    """Esegue il benchmark completo per una configurazione in un processo isolato."""
    tracemalloc.start()
    t_start = time.perf_counter()
    if modo == "carica_transizione":
        engine = Engine.carica_transizione(pota=pota)
    else:
        engine = Engine.carica(pota=pota)
    t_load = time.perf_counter() - t_start

    # Generazione deterministica di 20 batch di 30 semi
    rng = np.random.default_rng(RNG_SEED)
    available_keys = engine.keys
    tipi_disponibili = ["loved", "liked", "library", "watched"]

    richieste_semi = []
    for _ in range(NUM_RICHIESTE):
        chosen_keys = rng.choice(available_keys, size=SEMI_PER_RICHIESTA, replace=False)
        chosen_tipi = rng.choice(tipi_disponibili, size=SEMI_PER_RICHIESTA)
        semi = [(k, None, t) for k, t in zip(chosen_keys, chosen_tipi)]
        richieste_semi.append(semi)

    # 2 richieste di warmup prima della misurazione (stabilizzazione cache CPU/BLAS)
    for semi in richieste_semi[:NUM_WARMUP]:
        _ = engine.raccomanda(semi, cap=CAP)

    # Cronometraggio delle 20 richieste con cap=60
    tempi = []
    for semi in richieste_semi:
        t0 = time.perf_counter()
        _ = engine.raccomanda(semi, cap=CAP)
        tempi.append(time.perf_counter() - t0)

    tracemalloc_peak = tracemalloc.get_traced_memory()[1] / (1024 * 1024)
    tracemalloc.stop()
    psutil_peak = _get_peak_rss_mib()

    med_sec = float(np.median(tempi))
    p95_sec = float(np.percentile(tempi, 95))

    return {
        "modo": modo,
        "pota": pota,
        "etichetta": etichetta,
        "nnz": int(engine.Tr.nnz),
        "peak_rss_mib": psutil_peak,
        "peak_tracemalloc_mib": tracemalloc_peak,
        "load_sec": t_load,
        "med_sec": med_sec,
        "p95_sec": p95_sec,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark del runtime V45")
    parser.add_argument(
        "--worker",
        type=str,
        default=None,
        help="Esegue internamente il benchmark per un singolo worker: 'modo:pota:etichetta'",
    )
    args = parser.parse_args()

    if args.worker is not None:
        parti = args.worker.split(":", 2)
        if len(parti) == 3:
            modo, pota_str, etichetta = parti
        elif len(parti) == 2:
            modo, pota_str = parti
            etichetta = f"{pota_str} ({modo})" if modo != "carica" else pota_str
        else:
            modo = "carica"
            pota_str = parti[0]
            etichetta = pota_str

        pota_val = None if pota_str.lower() == "none" else int(pota_str)
        risultato = esegui_singolo(modo, pota_val, etichetta)
        print(json.dumps(risultato))
        return

    # Esegue ogni configurazione in un sottoprocesso separato per garantire
    # misurazioni di memoria RSS pulite, prive di frammentazione o heap sporco precedente.
    righe = []
    root_services = str(Path(__file__).resolve().parents[2])

    for modo, p, etichetta in CONFIGURAZIONI:
        arg_pota = "None" if p is None else str(p)
        worker_spec = f"{modo}:{arg_pota}:{etichetta}"
        cmd = [sys.executable, "-m", "graph.runtime.bench", "--worker", worker_spec]
        env = dict(os.environ)
        if "PYTHONPATH" in env:
            if root_services not in env["PYTHONPATH"]:
                env["PYTHONPATH"] = f"{root_services}{os.pathsep}{env['PYTHONPATH']}"
        else:
            env["PYTHONPATH"] = root_services

        proc = subprocess.run(cmd, env=env, text=True, capture_output=True)
        if proc.returncode != 0:
            print(f"Errore su {worker_spec}:\n{proc.stderr}", file=sys.stderr)
            sys.exit(proc.returncode)

        # Prende l'ultima riga stdout come JSON
        linea_json = proc.stdout.strip().splitlines()[-1]
        d = json.loads(linea_json)
        righe.append(d)

    # Stampa tabella compatta markdown
    print("| pota | Archi (nnz) | Peak RSS psutil (MiB) | Peak tracemalloc (MiB) | Load (s) | Mediano (s) | p95 (s) |")
    print("|:-------------------------|------------:|----------------------:|-----------------------:|---------:|------------:|--------:|")
    for r in righe:
        p_str = r["etichetta"]
        nnz_str = f"{r['nnz']:,}"
        rss_str = f"{r['peak_rss_mib']:.1f}" if r["peak_rss_mib"] is not None else "n/a"
        tm_str = f"{r['peak_tracemalloc_mib']:.1f}"
        load_str = f"{r['load_sec']:.2f}"
        med_str = f"{r['med_sec']:.3f}"
        p95_str = f"{r['p95_sec']:.3f}"
        print(f"| {p_str:<25} | {nnz_str:>11} | {rss_str:>21} | {tm_str:>22} | {load_str:>8} | {med_str:>11} | {p95_str:>7} |")


if __name__ == "__main__":
    main()
