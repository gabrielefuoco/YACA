"""prepara.py — Precalcolo offline degli artefatti sparsi V45 con provenienza.

PERCHÉ ESISTE.
In un container Docker con vincolo a 512 MiB di memoria RSS, caricare l'intero artefatto
triangolo V45 (50.660.592 archi float32) genera un picco di memoria di circa 627 MiB prima
ancora che la potatura a top-k per riga possa ridurlo a ~1,9M archi, e simmetrizzarlo
raggiunge ~1.0 GB di memoria (1.007,6 MB).

Questo modulo offline precalcola e scrive su disco con provenienza tracciata
(`graph.provenance.scrivi`) due artefatti distinti e compatti in cartelle dedicate esterne:
1. `transizione-pota16.npz` (~10 MB, ~1,6M archi stocastici) in `data/v45-transizione/`:
   usato dal runtime PageRank (`Engine.carica_transizione`), avvio istantaneo e ~157 MiB peak RSS.
2. `vicini-top100.npz` (~43.5 MB, ~7,6M archi non stocastici) in `data/v45-vicini100/`:
   usato dal modulo clustering/interessi (`carica_matrice_affinita`), elimina la necessità di
   materializzare a runtime la matrice non potata da 74,4M archi, garantendo un picco RSS
   costantemente <= 400 MB (misurato: 307.1 MB su warnok, 305.9 MB su pepsipex) e lasciando oltre
   110 MiB di margine nel container.

REGOLE CRITICHE:
- Non scrive mai e non sovrascrive mai `services/graph/data/v45/` (immutabilità del freeze V45).
- Entrambi gli artefatti sono esclusi da git (gitignored) e rigenerabili con un singolo comando.
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


def prepara_vicini(
    in_path: str | Path | None = None,
    out_path: str | Path | None = None,
    top_k: int = 100,
) -> Path:
    """Precalcola e scrive su disco l'artefatto compatto dei top-k vicini con pesi non potati.

    Args:
        in_path: Percorso del triangolo sorgente V45. Se None, carica il default congelato.
        out_path: Cartella o file di destinazione (deve essere ESTERNA a data/v45/).
        top_k: Numero massimo di vicini per riga (default 100).

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
        out_dir = root_graph / "data" / "v45-vicini100"
        dest_file = out_dir / f"vicini-top{top_k}.npz"
    else:
        out_p = Path(out_path).resolve()
        if out_p.suffix == ".npz":
            dest_file = out_p
        else:
            dest_file = out_p / f"vicini-top{top_k}.npz"

    # REGOLA CRITICA: non toccare mai data/v45/
    v45_dir = (root_graph / "data" / "v45").resolve()
    dest_dir = dest_file.parent.resolve()
    if dest_dir == v45_dir:
        raise ValueError(
            f"Violazione di immutabilità: vietato scrivere in {v45_dir}. "
            "Gli artefatti precalcolati devono risiedere all'esterno (es. data/v45-vicini100/)."
        )

    print(f"Lettura triangolo sorgente da: {in_path}...", flush=True)
    t0 = time.perf_counter()
    M, prov_in = _PV.leggi(in_path)
    n = M.shape[0]
    print(
        f"  Caricato M (shape={M.shape}, nnz={M.nnz:,}) in {time.perf_counter() - t0:.2f}s",
        flush=True,
    )

    print("Simmetrizzazione preventiva (W = M + M.T)...", flush=True)
    t1 = time.perf_counter()
    W = (M + M.T).tocsr()
    del M
    print(
        f"  Simmetrizzato W (nnz={W.nnz:,}) in {time.perf_counter() - t1:.2f}s",
        flush=True,
    )

    print(f"Estrazione top-{top_k} vicini per ogni riga...", flush=True)
    t2 = time.perf_counter()
    sizes = np.minimum(np.diff(W.indptr), top_k)
    new_indptr = np.zeros(n + 1, dtype=np.int64)
    new_indptr[1:] = np.cumsum(sizes)
    total_nnz = int(new_indptr[-1])

    new_indices = np.empty(total_nnz, dtype=np.int32)
    new_data = np.empty(total_nnz, dtype=np.float32)

    for i in range(n):
        s, e = W.indptr[i], W.indptr[i + 1]
        cols = W.indices[s:e]
        vals = W.data[s:e]
        dst_s, dst_e = new_indptr[i], new_indptr[i + 1]
        if len(cols) <= top_k:
            new_indices[dst_s:dst_e] = cols
            new_data[dst_s:dst_e] = vals
        else:
            top_idx = np.argpartition(-vals, top_k)[:top_k]
            sub_cols = cols[top_idx]
            sub_vals = vals[top_idx]
            order = np.argsort(sub_cols)
            new_indices[dst_s:dst_e] = sub_cols[order]
            new_data[dst_s:dst_e] = sub_vals[order]

    del W
    print(
        f"  Estratti top-{top_k} vicini (nnz={total_nnz:,}) in {time.perf_counter() - t2:.2f}s",
        flush=True,
    )

    W_top = sp.csr_matrix((new_data, new_indices, new_indptr), shape=(n, n))

    inputs_info = {
        in_path.name: prov_in.get("sha256")
        if (prov_in and "sha256" in prov_in)
        else _PV.sha256_file(in_path)
    }
    params_info = {"top_k": int(top_k)}

    dest_file.parent.mkdir(parents=True, exist_ok=True)
    print(f"Scrittura artefatto in {dest_file}...", flush=True)
    t3 = time.perf_counter()
    prov_out = _PV.scrivi(
        path=dest_file,
        M=W_top,
        step="vicini_topk",
        params=params_info,
        inputs=inputs_info,
        canon_len=n,
    )
    del W_top
    dim_mb = dest_file.stat().st_size / (1024 * 1024)
    print(
        f"  Artefatto scritto con successo ({dim_mb:.1f} MB, sha={prov_out['sha256'][:16]}) "
        f"in {time.perf_counter() - t3:.2f}s",
        flush=True,
    )
    return dest_file


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepara e salva su disco gli artefatti precalcolati con provenienza (transizione e vicini top-100)."
    )
    parser.add_argument(
        "--target",
        choices=["transizione", "vicini", "entrambi"],
        default=None,
        help="Artefatto da produrre ('transizione', 'vicini', o 'entrambi'). Se omesso, usa transizione o vicini in base ai flag.",
    )
    parser.add_argument(
        "--vicini",
        action="store_true",
        help="Precalcola l'artefatto top-100 vicini per il clustering (alias di --target vicini)",
    )
    parser.add_argument(
        "--top-k",
        type=int,
        default=100,
        help="Numero di vicini per riga per l'artefatto vicini (default 100)",
    )
    parser.add_argument(
        "--pota",
        type=int,
        default=16,
        help="Massimo numero di archi per riga per la transizione (default 16)",
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
        default=None,
        help="Percorso o cartella di output (default services/graph/data/v45-transizione/ o v45-vicini100/)",
    )
    args = parser.parse_args()

    # Determinazione target
    target = args.target
    if target is None:
        if args.vicini:
            target = "vicini"
        else:
            target = "transizione"

    if target in ("transizione", "entrambi"):
        out_trans = args.out_path
        if out_trans is None and target == "entrambi":
            out_trans = "services/graph/data/v45-transizione/"
        prepara_transizione(in_path=args.in_path, out_path=out_trans, pota=args.pota)

    if target in ("vicini", "entrambi"):
        out_vicini = args.out_path
        if out_vicini is None and target == "entrambi":
            out_vicini = "services/graph/data/v45-vicini100/"
        prepara_vicini(in_path=args.in_path, out_path=out_vicini, top_k=args.top_k)


if __name__ == "__main__":
    main()
