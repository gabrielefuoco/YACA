import sys, json
sys.path.append('.scratch/banco-casi')
import validate_candidates as vc
from build_and_verify import DATA

for d in DATA:
    vc.test_seed_list(d['seed'], d['suggerimenti'])
