"""Print all 8 served shelves for castoffcrown, warnok, and pepsipex under winning config."""
from __future__ import annotations

import pandas as pd
import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I
from test_constrained_m1 import run_constrained_m1

def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")

    df_m = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'title', 'vote_count', 'release_date'])
    df_t = pd.read_parquet('.cache/tmdb/tv.parquet', columns=['id', 'name', 'vote_count', 'first_air_date'])
    m_dict = df_m.set_index('id').to_dict(orient='index')
    t_dict = df_t.set_index('id').to_dict(orient='index')

    res = run_constrained_m1(engine, W, rep="W_aff", tau_m=0.05, max_n=8)

    for p in ["castoffcrown", "warnok", "pepsipex"]:
        r = res[p]
        chiavi, _, _, _ = K.storia_trakt(p, ordine="recente")
        print(f"\n{'='*100}")
        print(f"PROFILE: {p} | Coverage: {r['cov']:.1f}% | Served Rows: {r['rows']} | Max Mixed Tax: {r['max_tax']}")
        print(f"{'='*100}")
        for idx, sh in enumerate(r["chosen"], 1):
            reps = [m["titolo"] for m in sh.semi_rappresentativi[:3]]
            mixed = list(getattr(sh, "_mixed_tax", set()))
            print(f"Row {idx}: '{sh.nome}'")
            print(f"   Size: {sh.size} semi | Medium: {sh.medium} | Fonte: {sh.nome_fonte} | Mixed Tax: {mixed}")
            print(f"   3 Rep Seeds: {reps}")
            # Ensure recommendations
            semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in sh.seeds_indices]
            racs = engine.raccomanda(semi_rac, cap=10, medium=sh.medium, esclusi=chiavi)
            rec_strs = []
            for item in racs[:10]:
                k = item["key"]
                is_tv = k.startswith("tv:")
                tid = int(k.split(":")[1])
                row_idx = engine.row_of[k]
                tit = titles[row_idx]
                yr = int(years[row_idx]) if years is not None and not np.isnan(years[row_idx]) else 0
                lookup = t_dict if is_tv else m_dict
                vc = lookup.get(tid, {}).get("vote_count", 0)
                rec_strs.append(f"{tit} ({yr}, {vc}v)")
            print(f"   Top 10 Recs: {' · '.join(rec_strs[:5])}")
            print(f"                {' · '.join(rec_strs[5:10])}")

if __name__ == "__main__":
    main()
