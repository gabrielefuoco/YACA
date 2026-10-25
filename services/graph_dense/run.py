"""CLI del modulo: stato · teacher · split · a0 · a1 · artefatto · all."""
from __future__ import annotations

import sys
import time

from . import config as C
from . import data as D
from . import split as SP
from . import teacher as T


def stato():
    B = D.basic(); S = D.triangle()
    print(f"canone {B['N']:,} · bolle {B['NB']:,} · archi {S.nnz:,} · "
          f"film {int((~B['is_tv']).sum()):,} · serie {int(B['is_tv'].sum()):,}")
    print(f"src {C.SRC} · data {C.DATA}")


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "stato"
    t0 = time.time()
    if cmd == "stato":
        stato(); return 0
    B = D.basic(); S = D.triangle()
    if cmd in ("teacher", "all"):
        r = T.build(B, S, salva=True)
        print("teacher", r["stats"]["archi_teacher"], "archi ·",
              r["stats"]["per_row"], f"· {time.time()-t0:.1f}s")
    if cmd in ("split", "all"):
        sp = SP.make(B, S)
        print("split", len(sp["test_idx"]), "test ·", sp["conteggi"])
        SP.collocatore(B, sp)
    if cmd in ("a0", "all"):
        from .train_a0 import main as a0
        a0()
    if cmd in ("a1", "all"):
        from .train_a1 import main as a1
        a1()
    if cmd in ("artefatto", "all"):
        from .artefatto import main as art
        art()
    if cmd not in ("teacher", "split", "a0", "a1", "artefatto", "all"):
        print("comandi: stato | teacher | split | a0 | a1 | artefatto | all")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
