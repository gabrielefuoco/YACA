"""Stampa dettagliata di tutte le righe per V1, V2, V3 su castoffcrown e pepsipex.
"""
from __future__ import annotations

import json
from graph import canon as K
from graph.runtime import Engine
from graph.interessi import carica_matrice_affinita
from misura_varianti import run_pipeline

def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W_aff = carica_matrice_affinita()
    meta = K.metadati()
    anno_arr, tit_arr = meta["ANNO"], meta["TIT"]

    def nome_chiave(key: str) -> str:
        r = engine.row_of.get(key)
        if r is None:
            return key
        a = anno_arr[r]
        return f"{tit_arr[r]} ({int(a)})" if a else str(tit_arr[r])

    out = []
    for v_name, staple_cap, unnameable_bisect in [
        ("V1", 40, True),
        ("V2", 40, False),
        ("V3", 60, False),
    ]:
        out.append(f"==================== VARIANTE {v_name} ====================")
        for p in ["castoffcrown", "pepsipex", "warnok"]:
            res = run_pipeline(
                engine,
                p,
                staple_cap=staple_cap,
                unnameable_bisect=unnameable_bisect,
                unnameable_cap=12,
                W_aff=W_aff,
                max_n=10,
            )
            out.append(f"\n--- {p} ({v_name}) ---")
            for i, s in enumerate(res["chosen"], 1):
                rep_txt = " · ".join(f"{m['titolo']} ({m['anno']})" for m in s.semi_rappresentativi[:3])
                cand_txt = " · ".join(nome_chiave(c["key"]) for c in s.titoli[:5])
                out.append(f"Row {i:2d}: {s.nome} | size={s.size:2d} | fonte={s.nome_fonte} | rep: {rep_txt} | cands: {cand_txt}")

    with open(".scratch/v45-raccomandazioni-yaca/tutte_le_righe.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("Scritto .scratch/v45-raccomandazioni-yaca/tutte_le_righe.txt")

if __name__ == "__main__":
    main()
