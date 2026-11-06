import json

with open('.scratch/v45-raccomandazioni-yaca/prototipo/contratto-scaffali.json', encoding='utf-8') as f:
    d = json.load(f)

for u, p in d['profili'].items():
    print(f"=== {u} ===")
    print("  n_scaffali_serviti:", p['n_scaffali_serviti'])
    print("  semi_coperti_serviti:", p['semi_coperti_serviti'], f"({p['quota_semi_coperti_pct']}%)")
    print("  scarti:", p['scarti'])
    print("  catalog_ids (first 5):", p['catalog_ids'][:5])
    if p['scaffali']:
        s0 = p['scaffali'][0]
        print("  shelf 1:", s0['catalog_id'], "| nome:", s0['nome'], "| min_eta:", s0['min_eta'], "| r_comb:", s0['r_comb'])
