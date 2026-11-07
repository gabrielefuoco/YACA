from experiment_e3_merge import run_m2_profile
from graph.runtime import Engine
from graph import interessi as I
import pandas as pd
import numpy as np
from graph import canon as K

engine = Engine.carica_transizione('services/graph/data/v45-transizione/transizione-pota16.npz')
W = I.carica_matrice_affinita()
res_m2 = run_m2_profile(engine, 'castoffcrown', tau_macro=0.03, sim_ratio=0.7, W_aff=W, max_n=8)

chiavi, righe, plays, eta = K.storia_trakt("castoffcrown", ordine="recente")
meta = K.metadati()
titles = meta.get("TIT")
years = meta.get("ANNO")

df_m = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'title', 'vote_count', 'release_date'])
m_dict = df_m.set_index('id').to_dict(orient='index')

for s in res_m2['eligible']:
    m_tits = [m['titolo'] for m in s.semi_membri]
    if any(x in m_tits for x in ['Il filo nascosto', 'Paterson', 'Past Lives', 'Drive My Car']):
        reps = [m['titolo'] for m in s.semi_rappresentativi[:3]]
        print(f"M2 Eligible Arthouse: '{s.nome}' | sz={s.size} | src={s.nome_fonte} | reps={reps}")
        semi_rac = [{"key": chiavi[i], "tipo": "watched", "peso": 1.0} for i in s.seeds_indices]
        racs = engine.raccomanda(semi_rac, cap=10, medium='movie', esclusi=chiavi)
        for r in racs[:10]:
            k = r["key"]
            mid = int(k.split(":")[1])
            tit = titles[engine.row_of[k]]
            yr = int(years[engine.row_of[k]]) if years is not None and not np.isnan(years[engine.row_of[k]]) else 0
            vc = m_dict.get(mid, {}).get("vote_count", 0)
            print(f"   - {tit} ({yr}) — vote_count: {vc}")
