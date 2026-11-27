"""Genera le liste dei quattro metodi per i profili in semi.json."""
import sys, json, pathlib
sys.path.insert(0, 'services')
import numpy as np, scipy.sparse as sp
from graph import canon as K, servizio

keys, row_of, n, is_tv = K.titoli()
W = servizio.get_vicini_affinita(); eng = servizio.get_engine_v45(); Tr = eng.Tr
deg = np.asarray(W.sum(1)).ravel(); deg[deg <= 0] = 1; Wn = sp.diags(1.0 / deg) @ W
semi_json = json.loads(pathlib.Path('.scratch/ricerca-senza-llm/semi.json').read_text(encoding='utf-8'))

def riga_di(x):
    for pref in ('movie', 'tv'):
        if f"{pref}:{x['tmdbId']}" in row_of: return row_of[f"{pref}:{x['tmdbId']}"]
    return None

def salto(M, righe, cap=60):
    pesi = np.zeros(n)
    for r in righe:
        a, b = M.indptr[r], M.indptr[r + 1]
        np.add.at(pesi, M.indices[a:b], M.data[a:b])
    pesi[righe] = 0.0
    return [int(keys[j].split(':')[1]) for j in np.argsort(-pesi)[:cap] if pesi[j] > 0]

out = {}
for nome, semi in semi_json.items():
    righe = [r for r in (riga_di(s) for s in semi) if r is not None]
    semi_k = [keys[r] for r in righe]
    ppr = [r for r in (riga_di(x) for x in eng.raccomanda([{'key': k} for k in semi_k], cap=60, medium=None, esclusi=semi_k)) if r is not None]
    out[nome] = {
        'semi': [int(keys[r].split(':')[1]) for r in righe],
        'ppr': [int(keys[r].split(':')[1]) for r in ppr],
        'matrice': salto(W, righe),
        'matrice_norm': salto(Wn, righe),
        'transizione': salto(Tr, righe),
    }
    print(f'{nome}: {len(righe)} semi')
pathlib.Path('.scratch/ricerca-senza-llm/valutazione-liste.json').write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
