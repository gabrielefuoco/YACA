import sys, json
sys.path.append('.')
from services.graph_dense import config as C, data as D
from pathlib import Path

import importlib.util
spec = importlib.util.spec_from_file_location('ingestione', '.scratch/banco-casi/ingestione.py')
ing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ing)

from check_seed_lists import test_candidates, get_meta, B, idx, chiavi

# Test our function
print("Ready to test seed lists.")
