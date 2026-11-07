"""Dump di tutti i cluster (serviti e non) per profilo, per giudizio a occhio."""
from __future__ import annotations

import sys
from pathlib import Path

from graph import canon as K
from graph import interessi as I
from graph.runtime import Engine

PROFILI = ["castoffcrown", "warnok", "pepsipex", "moppierhead"]


def main() -> None:
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()
    out = []

    for profilo in PROFILI:
        chiavi, _, plays, eta = K.storia_trakt(profilo, ordine="recente")
        semi = [{"key": k, "play": float(p), "eta": float(e)} for k, p, e in zip(chiavi, plays, eta)]
        righe = [engine.row_of[k] for k in chiavi]
        tutti = I.clusters(engine, righe, eta=[float(e) for e in eta],
                           plays=[float(p) for p in plays], W_aff=W)
        serviti = I.scaffali(engine, semi, W_aff=W)
        id_serviti = {s.catalog_id for s in serviti}

        out.append(f"\n{'='*100}\n### {profilo} — {len(chiavi)} semi · {len(tutti)} gruppi ammissibili · {len(serviti)} serviti\n")
        for c in sorted(tutti, key=lambda x: -x.size):
            stato = "SERVITO " if c.catalog_id in id_serviti else "escluso "
            tit = " · ".join(m["titolo"] for m in (c.semi_membri or c.semi_rappresentativi)[:7])
            out.append(f"{stato} {c.size:3d} semi | {c.nome[:70]:70s} | {tit}")
    Path(Path(__file__).with_name("cluster-dump.txt")).write_text("\n".join(out), encoding="utf-8")
    print("scritto cluster-dump.txt")


if __name__ == "__main__":
    main()
