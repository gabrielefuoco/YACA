import pickle

with open('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl', 'rb') as f:
    evals = pickle.load(f)

for u in ['1jacobjohn', 'castoffcrown', 'warnok', 'pepsipex']:
    d = evals[u]
    macros = [m for m in d['macros'] if m['size'] >= 3]
    # sort by combined rank
    macros.sort(key=lambda x: x['min_eta'])
    for r_idx, item in enumerate(macros): item['r_rec'] = r_idx + 1
    macros.sort(key=lambda x: (-x['size'], -x['consistency'], -x['plays']))
    for r_idx, item in enumerate(macros):
        item['r_sup'] = r_idx + 1
        item['r_comb'] = (item['r_rec'] + item['r_sup']) / 2.0
    macros.sort(key=lambda x: (x['r_comb'], -x['consistency'], -x['size'], -x['plays']))

    tot_clust = sum(m['size'] for m in d['macros'])
    print(f"=== {u} (Total seeds: {d['n_seeds']}, Clustered: {tot_clust}) ===")
    cum = 0
    for i, m in enumerate(macros[:15], 1):
        cum += m['size']
        print(f"  Shelf {i:2d}: size={m['size']:2d}, medium={m['medium']:6s}, min_eta={m['min_eta']:5.1f}, r_comb={m['r_comb']:4.1f}, cum_seeds={cum:3d} ({cum/tot_clust*100:4.1f}%)")
