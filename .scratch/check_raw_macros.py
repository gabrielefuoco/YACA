import numpy as np
from graph import canon as K
from graph.runtime import Engine
from graph import interessi as I

engine = Engine.carica_transizione('services/graph/data/v45-transizione/transizione-pota16.npz')
W = I.carica_matrice_affinita()
chiavi, righe, plays, eta = K.storia_trakt('castoffcrown', ordine='recente')
righe_arr = np.asarray([engine.row_of[k] for k in chiavi], dtype=np.int64)
S = I.calcola_sim_affinity(righe_arr, W)
micros, unclustered = I.micro_clustering(S, min_affinity=0.02)
raw_macros = I.macro_merge(engine, righe_arr, micros, tau=0.03)

meta = K.metadati()
titles = meta.get('TIT')
print('Number of raw macros:', len(raw_macros))
check_tits = ["Il filo nascosto", "Parasite", "Beau Travail", "Drive My Car", "Ghost in the Shell", "Paterson", "Past Lives"]
for idx, m in enumerate(raw_macros):
    tits = [str(titles[righe_arr[i]]) for i in m]
    found = [t for t in tits if t in check_tits]
    if found:
        print(f"Macro {idx:2d} (sz={len(m):2d}): found {found}")
