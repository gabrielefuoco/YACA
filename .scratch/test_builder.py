import json
import pandas as pd

with open('.scratch/banco-casi/semi-02.json', 'r', encoding='utf-8') as f:
    semi = json.load(f)

print(f"Total seeds: {len(semi)}")
for i, s in enumerate(semi):
    print(f"{i+1:2d}. {s['key']} - {s['titolo']} ({s['anno']})")
