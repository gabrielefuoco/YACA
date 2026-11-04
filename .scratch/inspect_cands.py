import sys
sys.path.insert(0, '.')
import json
import pandas as pd
from services.graph_dense import config as C, data as D
import importlib.util

spec = importlib.util.spec_from_file_location('ingestione', '.scratch/banco-casi/ingestione.py')
ing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ing)

import importlib.util

spec2 = importlib.util.spec_from_file_location('val', '.scratch/validate_risposte.py')
val_mod = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(val_mod)
load_catalog_meta = val_mod.load_catalog_meta
get_meta = val_mod.get_meta

B = D.basic()
idx = ing.indice(B)
chiavi = sorted(idx)
movies, tv = load_catalog_meta()

with open('.scratch/test_risposte_draft.json', encoding='utf-8') as f:
    data = json.load(f)

for s in data:
    seed_key = s['seed']
    print(f"\n=== SEED {seed_key} ===")
    for sug in s['suggerimenti']:
        t, y = sug['titolo'], sug['anno']
        r, stato = ing.aggancia(t, y, idx, chiavi, B['year'], 0.82)
        if r is None:
            print(f"  FAIL: '{t}' ({y}) -> {stato}")
        else:
            k = B['keys'][r]
            m = get_meta(k, movies, tv)
            print(f"  OK: '{t}' -> {m['title']} ({m['year']}) | lang={m['lang']} | countries={m['countries']}")
