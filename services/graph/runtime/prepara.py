"""prepara.py — Precalcolo offline della transizione potata V45 con provenienza.

PERCHÉ ESISTE.
In un container Docker con vincolo a 512 MiB di memoria RSS, caricare l'intero artefatto
triangolo V45 (50.660.592 archi float32) genera un picco di memoria di circa 627 MiB prima
ancora che la potatura a top-k per riga possa ridurlo a ~1,9M archi.
Questo script offline precalcola la transizione potata e la scrive su disco con provenienza
tracciata (`graph.provenance.scrivi`) in una directory dedicata esterna (es. `data/v45-transizione/`).
Non scrive mai e non sovrascrive mai `services/graph/data/v45/` (preservando l'immutabilità
del freeze V45).
All'avvio in produzione, `Engine.carica_transizione()` legge direttamente questo artefatto compatto
(~16 MiB), avviando il motore in frazioni di secondo e con un consumo di memoria stabile ampiamente
inferiore alla soglia di 512 MiB.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from graph import camminata as _cam
from graph import provenance as _PV


def prepara_transizione(
    in_path: str | Path | None = None,
    out_path: str | Path | None = None,
    pota: int = 16,
) -> Path:
    """Precalcola e scrive su disco la transizione potata con provenienza.

    Args:
        in_path: Percorso del triangolo sorgente V45. Se None, carica il default congelato.
        out_path: Cartella o file di destinazione (deve essere ESTERNA a data/v45/).
        pota: Numero massimo di archi per riga (default 16).

    Returns:
        Path del file `.npz` scritto.
    """
    root_graph = Path(__file__).resolve().parents[1]
    if in_path is None:
        in_path = root_graph / "data" / "v45" / "bolle-eterogeneo-V45-p1.0-triangolo.npz"
    in_path = Path(in_path).resolve()
    if not in_path.is_file():
        raise FileNotFoundError(f"Triangolo V45 non trovato: {in_path}")

    if out_path is None:
        out_dir = root_graph / "data" / "v45-transizione"
        dest_file = out_dir / f"transizione-pota{pota}.npz"
    else:
        out_p = Path(out_path).resolve()
        if out_p.suffix == ".npz":
            dest_file = out_p
        else:
            dest_file = out_p / f"transizione-pota{pota}.npz"

    # REGOLA CRITICA: non toccare mai data/v45/
    v45_dir = (root_graph / "data" / "v45").resolve()
    dest_dir = dest_file.parent.resolve()
    if dest_dir == v45_dir:
        raise ValueError(
            f"Violazione di immutabilità: vietato scrivere in {v45_dir}. "
            "Gli artefatti precalcolati devono risiedere all'esterno (es. data/v45-transizione/)."
        )

    print(f"Lettura triangolo sorgente da: {in_path}...", flush=True)
    t0 = time.perf_counter()
    M, prov_in = _PV.leggi(in_path)
    n = M.shape[0]
    print(
        f"  Caricato M (shape={M.shape}, nnz={M.nnz:,}) in {time.perf_counter() - t0:.2f}s",
        flush=True,
    )

    # La sequenza (W + W.T) -> pota -> transizione è la stessa di `camminata.transizione_pronta`,
    # che non si può riusare qui: quella scrive su un percorso fisso e non registra la provenienza
    # dentro l'artefatto. Sono tre righe di algebra, e duplicarle è preferibile a piegare la funzione
    # canonica con un parametro in più che serve solo a questa build.
    print("Simmetrizzazione preventiva (W + W.T)...", flush=True)
    t1 = time.perf_counter()
    M = (M + M.T).tocsr()
    print(
        f"  Simmetrizzato M (nnz={M.nnz:,}) in {time.perf_counter() - t1:.2f}s",
        flush=True,
    )

    print(f"Potatura top-k (pota={pota})...", flush=True)
    t2 = time.perf_counter()
    M = _cam.pota(M, k=int(pota))
    print(
        f"  Potato M (nnz={M.nnz:,}) in {time.perf_counter() - t2:.2f}s",
        flush=True,
    )

    print("Calcolo transizione riga-stocastica...", flush=True)
    t3 = time.perf_counter()
    Tr = _cam.transizione(M)
    del M
    print(
        f"  Transizione calcolata (nnz={Tr.nnz:,}) in {time.perf_counter() - t3:.2f}s",
        flush=True,
    )

    inputs_info = {
        in_path.name: prov_in.get("sha256")
        if (prov_in and "sha256" in prov_in)
        else _PV.sha256_file(in_path)
    }
    params_info = {"pota": int(pota)}

    dest_file.parent.mkdir(parents=True, exist_ok=True)
    print(f"Scrittura artefatto in {dest_file}...", flush=True)
    t4 = time.perf_counter()
    prov_out = _PV.scrivi(
        path=dest_file,
        M=Tr,
        step="transizione_pronta",
        params=params_info,
        inputs=inputs_info,
        canon_len=n,
    )
    dim_mb = dest_file.stat().st_size / (1024 * 1024)
    print(
        f"  Artefatto scritto con successo ({dim_mb:.1f} MB, sha={prov_out['sha256'][:16]}) "
        f"in {time.perf_counter() - t4:.2f}s",
        flush=True,
    )
    return dest_file


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepara e salva su disco la transizione potata con provenienza."
    )
    parser.add_argument(
        "--pota",
        type=int,
        default=16,
        help="Massimo numero di archi per riga (default 16)",
    )
    parser.add_argument(
        "--in",
        dest="in_path",
        type=str,
        default=None,
        help="Percorso dell'artefatto triangolo di input (default V45)",
    )
    parser.add_argument(
        "--out",
        dest="out_path",
        type=str,
        default="services/graph/data/v45-transizione/",
        help="Percorso o cartella di output (default services/graph/data/v45-transizione/)",
    )
    args = parser.parse_args()

    prepara_transizione(in_path=args.in_path, out_path=args.out_path, pota=args.pota)


if __name__ == "__main__":
    main()
