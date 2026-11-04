import sys
sys.path.insert(0, '.')
import json
import importlib.util
from collections import Counter

spec = importlib.util.spec_from_file_location('val', '.scratch/validate_risposte.py')
val_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(val_mod)
load_catalog_meta = val_mod.load_catalog_meta
get_meta = val_mod.get_meta

from services.graph_dense import data as D
spec2 = importlib.util.spec_from_file_location('ingestione', '.scratch/banco-casi/ingestione.py')
ing = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(ing)

B = D.basic()
idx = ing.indice(B)
chiavi = sorted(idx)
movies, tv = load_catalog_meta()

with open('.scratch/test_risposte_draft.json', encoding='utf-8') as f:
    data = json.load(f)

for s in data:
    c_prim = Counter()
    for sug in s['suggerimenti']:
        r, _ = ing.aggancia(sug['titolo'], sug['anno'], idx, chiavi, B['year'], 0.82)
        if r is not None:
            k = B['keys'][r]
            m = get_meta(k, movies, tv)
            prim = m['countries'][0] if m and m['countries'] else 'UNKNOWN'
            c_prim[prim] += 1
    over = {k: v for k, v in c_prim.items() if v > 6}
    if over:
        print(f"{s['seed']}: OVER={over}")
    else:
        print(f"{s['seed']}: OK primary countries (max={max(c_prim.values()) if c_prim else 0})")
