import json

with open(r'C:\Users\gabri\APP\YACA\.scratch\v45-raccomandazioni-yaca\prototipo\sweep_m_results.json', encoding='utf-8') as f:
    res = json.load(f)

for M in ['8', '12', '20', '30']:
    print(f"\n=== M = {M} ===")
    coc = res[M]['by_timeline']['castoffcrown']
    found = False
    for idx, s in enumerate(coc['shelves'], 1):
        has_er = any('E.R.' in t for t in s['all_seed_titles'])
        has_philly = any('Philadelphia' in t for t in s['all_seed_titles'])
        has_shameless = any('Shameless' in t for t in s['all_seed_titles'])
        if has_er or has_philly or has_shameless:
            found = True
            print(f"  Found in Served Shelf {idx} ({s['nome']}): {s['size']} seeds")
            print(f"    ER={has_er}, Philly={has_philly}, Shameless={has_shameless}")
            print(f"    Seeds: {s['all_seed_titles'][:10]}")
            print(f"    Candidates: {s['cands']}")
    if not found:
        print("  Grab bag seeds NOT in any served shelf!")
