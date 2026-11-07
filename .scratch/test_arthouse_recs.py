from __future__ import annotations
import numpy as np
import scipy.sparse as sp
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

def main():
    engine = Engine.carica_transizione("services/graph/data/v45-transizione/transizione-pota16.npz")
    W = I.carica_matrice_affinita()
    chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
    righe_arr = np.asarray(righe, dtype=np.int64)
    eta_arr = np.asarray(eta, dtype=np.float32)
    plays_arr = np.asarray(plays, dtype=np.float32)

    eligible = I.clusters(engine, righe_arr, eta=eta_arr, plays=plays_arr, W_aff=W)

    meta = K.metadati()
    titles = meta.get("TIT")
    years = meta.get("ANNO")
    voti = meta.get("VOTI") # let's check if voti is in meta

    # Collect seeds of the arthouse clusters
    # 7: Filo nascosto / Paterson (sz=12)
    # 8: Parasite / Past Lives (sz=9)
    # 6: Perfect Days / Drive My Car (sz=6)
    # 17: Arrivederci ragazzi / Beau Travail (sz=10)
    # 13: Ghost in the shell / Ghibli (sz=12)
    target_clusters = [eligible[7], eligible[8], eligible[6], eligible[17]]
    all_seeds = set()
    for c in target_clusters:
        all_seeds.update(c.seeds_indices)

    # Sort seeds by (-plays, eta) and cap at 40
    sorted_seeds = sorted(all_seeds, key=lambda idx: (-plays_arr[idx], eta_arr[idx]))[:40]
    print(f"Merged arthouse size: {len(sorted_seeds)} seeds")
    print("Top 10 seeds in merged shelf:")
    for idx in sorted_seeds[:10]:
        print(f"  {titles[righe_arr[idx]]} ({years[righe_arr[idx]]})")

    # Run recommendation
    semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in sorted_seeds]
    racs = engine.raccomanda(semi_rac, cap=15, medium="movie", esclusi=chiavi)
    import pandas as pd
    df_m = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'title', 'vote_count', 'release_date'])
    m_dict = df_m.set_index('id').to_dict(orient='index')

    print("\nTop 15 candidates recommended:")
    for r in racs:
        k = r.get('key')
        mid = int(k.split(':')[1]) if ':' in k else None
        r_idx = engine.row_of.get(k)
        tit = titles[r_idx] if r_idx is not None and titles is not None else None
        yr = int(years[r_idx]) if r_idx is not None and years is not None and not np.isnan(years[r_idx]) else None
        pm = m_dict.get(mid, {})
        vc = pm.get('vote_count')
        print(f"  {tit} ({yr}) | vc={vc} | key={k}")

if __name__ == "__main__":
    main()
