"""Slot 1 — pulizia del canone. Non muta nulla: produce una maschera e le date corrette.

Uso:
    py -m services.graph_dense.canon_clean --report
    py -m services.graph_dense.canon_clean --write

Output (con --write): data/canon-clean.npz
    keep   (N,)  bool    righe utilizzabili (titolo non vuoto, anno plausibile)
    date   (N,)  int32   date ordinali corrette (0 = ignota)
    anno   (N,)  int16   anno estratto (0 = ignoto)
"""
from __future__ import annotations

import argparse

import numpy as np

from . import config as C
from . import data as D

MIN_ANNO = 1880
MAX_ANNO = 2100


def audit(B, date):
    titoli = np.array([str(t).strip() for t in B["titoli"]], dtype=object)
    vuoti = np.array([len(t) == 0 for t in titoli])
    anno = np.where(date > 0, (date / 365.25).astype(np.int32), 0).astype(np.int32)
    fuori = (anno != 0) & ((anno < MIN_ANNO) | (anno > MAX_ANNO))
    keep = ~vuoti & ~fuori
    return {"titoli": titoli, "vuoti": vuoti, "anno": anno, "fuori": fuori, "keep": keep}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args(argv)
    B = D.basic()
    date = np.load(C.DATA / "uscite-ordinali.npy").astype(np.int32)
    r = audit(B, date)
    print(f"canone {B['N']:,} · titoli vuoti {int(r['vuoti'].sum()):,} · "
          f"anni fuori [{MIN_ANNO},{MAX_ANNO}] {int(r['fuori'].sum()):,} · "
          f"keep {int(r['keep'].sum()):,}", flush=True)
    if r["vuoti"].any():
        print("esempi vuoti:", [int(i) for i in np.where(r["vuoti"])[0][:10]])
    if r["fuori"].any():
        print("esempi anni fuori:", [(int(i), int(r["anno"][i])) for i in np.where(r["fuori"])[0][:10]])
    if a.write:
        # le righe scartate restano nel canone ma con peso 0 nei target/training (maschera)
        np.savez_compressed(C.DATA / "canon-clean.npz",
                            keep=r["keep"], date=date, anno=r["anno"])
        print("scritto", C.DATA / "canon-clean.npz")


if __name__ == "__main__":
    main()
