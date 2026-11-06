import sys
sys.path.extend(['services', '.scratch/v45-raccomandazioni-yaca/prototipo'])
from pathlib import Path
from collections import Counter
import numpy as np
import scipy.sparse as sp
from scipy.spatial.distance import squareform
from scipy.cluster.hierarchy import linkage, fcluster

from graph import canon as K
from graph.runtime import Engine
from graph.build import data as D
from dieci_storie import PROFILI_10, carica_wider_bags, calcola_sim_wider, NOISE_KEYWORDS
from cluster import clusterizza_semi
from macro import split_until_M

engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta['COLL']

V = D.vocab()
kw_items = [(t.split(':', 1)[1], c) for t, c in V.items() if t.startswith('kw:')]
kw_names = [x[0] for x in kw_items]
kw_cols = [x[1] for x in kw_items]
X = D.tfidf()
X_kw = X[:, kw_cols].tocsr()

def get_member_kws(r: int) -> set[str]:
    s, e = X_kw.indptr[r], X_kw.indptr[r+1]
    cols = X_kw.indices[s:e]
    return set(kw_names[c] for c in cols if kw_names[c] not in NOISE_KEYWORDS)

storie = {u: K.storia_trakt(u, ordine='recente') for u, _, _ in PROFILI_10}
all_righe = sorted(list({r for u in storie for r in storie[u][1]}))
wider_bags = carica_wider_bags(all_righe, Path('services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz'))

def aggrega_macro_tau(engine, righe, micros, tau):
    m = len(micros)
    if m <= 1: return micros
    V_sub = engine.Tr[righe, :]
    norms = np.array(np.sqrt(V_sub.multiply(V_sub).sum(axis=1))).ravel()
    norms[norms == 0] = 1.0
    V_norm = sp.diags(1.0 / norms) @ V_sub

    c_vecs = []
    for c in micros:
        v_c = np.array(V_norm[c, :].sum(axis=0)).ravel()
        norm_c = np.linalg.norm(v_c)
        if norm_c == 0: norm_c = 1.0
        c_vecs.append(v_c / norm_c)
    C_norm = np.array(c_vecs)

    S = C_norm @ C_norm.T
    d = np.clip(1.0 - S, 0.0, 1.0)
    np.fill_diagonal(d, 0.0)

    Z = linkage(squareform(d), method='average')
    labels = fcluster(Z, t=1.0 - tau, criterion='distance')
    groups = {}
    for micro_idx, lbl in enumerate(labels):
        groups.setdefault(lbl, []).append(micro_idx)

    macros = []
    for micro_indices in groups.values():
        m_seeds = []
        for mi in micro_indices:
            m_seeds.extend(micros[mi])
        macros.append(m_seeds)
    macros.sort(key=len, reverse=True)
    return macros

def bounded_macros_tau(engine, righe, micros, tau, M=30):
    macros = aggrega_macro_tau(engine, righe, micros, tau)
    bounded = []
    for m in macros:
        if len(m) <= M:
            bounded.append(m)
        else:
            pieces = split_until_M(engine, righe, m, M)
            bounded.extend(pieces)
    bounded.sort(key=len, reverse=True)
    return bounded

# Precompute micros for each profile
micros_cache = {}
for u, _, _ in PROFILI_10:
    k, righe, plays, eta = storie[u]
    S = calcola_sim_wider(righe, wider_bags)
    micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
    micros_cache[u] = micros

taus = [0.005, 0.01, 0.02, 0.03, 0.05]
summary_rows = []

for tau in taus:
    tot_macros = 0
    all_sizes = []
    tot_pass = 0
    tot_reject = 0
    tot_1_seed = 0
    tot_2_seed = 0
    shelves_served_dict = {}
    shelves_served_ge3_dict = {}
    cov_dict = {}
    cov_ge100 = []
    saga_b_cnt = 0

    per_profile_stats = {}

    for u, _, _ in PROFILI_10:
        k, righe, plays, eta = storie[u]
        n_seeds = len(righe)
        micros = micros_cache[u]
        bounded = bounded_macros_tau(engine, righe, micros, tau, M=30)
        tot_macros += len(bounded)
        sizes = [len(m) for m in bounded]
        all_sizes.extend(sizes)
        ones = sum(1 for sz in sizes if sz == 1)
        twos = sum(1 for sz in sizes if sz == 2)
        tot_1_seed += ones
        tot_2_seed += twos

        cov = (sum(sizes) / n_seeds * 100.0) if n_seeds > 0 else 0.0
        cov_dict[u] = cov
        if n_seeds > 100:
            cov_ge100.append(cov)

        evaluated = []
        u_pass = 0
        u_rej = 0
        for m in bounded:
            sz = len(m)
            c_coll = coll[righe[m]]
            pos = [x for x in c_coll if x > 0]
            if (len(pos) / sz) >= 0.5:
                saga_b_cnt += 1

            kw_counts = Counter()
            for idx in m:
                for kw in get_member_kws(righe[idx]):
                    kw_counts[kw] += 1
            qual_kws = [(kw, cnt, cnt / sz) for kw, cnt in kw_counts.items() if (cnt / sz) >= 0.5]
            best_supp = qual_kws[0][2] if qual_kws else (kw_counts.most_common(1)[0][1] / sz if kw_counts else 0.0)
            gate_pass = len(qual_kws) > 0 and (best_supp >= 0.5)

            if gate_pass:
                tot_pass += 1
                u_pass += 1
            else:
                tot_reject += 1
                u_rej += 1

            min_e = min(eta[idx] for idx in m)
            tot_pl = sum(plays[idx] for idx in m)
            evaluated.append({'seeds': m, 'size': sz, 'min_eta': min_e, 'plays': tot_pl, 'gate_pass': gate_pass})

        evaluated.sort(key=lambda x: x['min_eta'])
        for r_idx, item in enumerate(evaluated): item['r_rec'] = r_idx + 1
        evaluated.sort(key=lambda x: (-x['size'], -x['plays']))
        for r_idx, item in enumerate(evaluated):
            item['r_sup'] = r_idx + 1
            item['r_comb'] = (item['r_rec'] + item['r_sup']) / 2.0
        evaluated.sort(key=lambda x: (x['r_comb'], x['r_rec'], -x['size']))

        # Shelf selection: exclude size 1 (i.e. size >= 2)
        seen_colls = set()
        sel_cnt = 0
        for item in evaluated:
            if not item['gate_pass'] or item['size'] < 2: continue
            m = item['seeds']
            c_coll = coll[righe[m]]
            pos = [x for x in c_coll if x > 0]
            dom_coll = None
            if pos:
                cid, cnt = Counter(pos).most_common(1)[0]
                if (cnt / len(m)) >= 0.5: dom_coll = int(cid)
            if dom_coll is not None and dom_coll in seen_colls: continue
            if dom_coll is not None: seen_colls.add(dom_coll)
            sel_cnt += 1
            if sel_cnt == 5: break
        shelves_served_dict[u] = sel_cnt

        # Shelf selection: exclude size < 3 (i.e. size >= 3)
        seen_colls_ge3 = set()
        sel_cnt_ge3 = 0
        for item in evaluated:
            if not item['gate_pass'] or item['size'] < 3: continue
            m = item['seeds']
            c_coll = coll[righe[m]]
            pos = [x for x in c_coll if x > 0]
            dom_coll = None
            if pos:
                cid, cnt = Counter(pos).most_common(1)[0]
                if (cnt / len(m)) >= 0.5: dom_coll = int(cid)
            if dom_coll is not None and dom_coll in seen_colls_ge3: continue
            if dom_coll is not None: seen_colls_ge3.add(dom_coll)
            sel_cnt_ge3 += 1
            if sel_cnt_ge3 == 5: break
        shelves_served_ge3_dict[u] = sel_cnt_ge3

        per_profile_stats[u] = {
            'macros': len(bounded),
            'pass': u_pass,
            'rej': u_rej,
            'rej_pct': (u_rej / len(bounded) * 100.0) if bounded else 0.0,
            'cov': cov,
            'shelves': sel_cnt,
            'shelves_ge3': sel_cnt_ge3,
        }

    rej_rate = (tot_reject / tot_macros * 100.0) if tot_macros else 0.0
    saga_pct = (saga_b_cnt / tot_macros * 100.0) if tot_macros else 0.0
    med_sz = float(np.median(all_sizes)) if all_sizes else 0.0
    mean_cov_all = float(np.mean(list(cov_dict.values())))
    mean_cov_ge100 = float(np.mean(cov_ge100))

    summary_rows.append({
        'tau': tau,
        'macros': tot_macros,
        'min_sz': min(all_sizes),
        'med_sz': med_sz,
        'max_sz': max(all_sizes),
        '1_seed': tot_1_seed,
        '2_seed': tot_2_seed,
        'cov_mean_all': mean_cov_all,
        'cov_ge100_min': min(cov_ge100),
        'cov_ge100_mean': mean_cov_ge100,
        'gate_pass': tot_pass,
        'gate_rej': tot_reject,
        'rej_rate': rej_rate,
        'saga_pct': saga_pct,
        'shelves_served': shelves_served_dict,
        'shelves_served_ge3': shelves_served_ge3_dict,
        'per_profile': per_profile_stats,
    })

print('=== SWEEP TABLE COMPLETE ===')
for r in summary_rows:
    print(f"tau={r['tau']:.3f} | Macros={r['macros']:3d} | Sz=[{r['min_sz']}, {r['med_sz']:.1f}, {r['max_sz']}] | 1-sd={r['1_seed']:2d}, 2-sd={r['2_seed']:2d} | Cov(>100)={r['cov_ge100_min']:.1f}%..{r['cov_ge100_mean']:.1f}% | GateRej={r['rej_rate']:.2f}% ({r['gate_rej']}/{r['macros']}) | Saga(b)={r['saga_pct']:.1f}% | Total Shelves={sum(r['shelves_served'].values())}")

print('\nPer-timeline shelves served (sz>=2):')
for r in summary_rows:
    sh_str = ', '.join(f"{u[:4]}:{cnt}" for u, cnt in r['shelves_served'].items())
    print(f"tau={r['tau']:.3f}: {sh_str}")
