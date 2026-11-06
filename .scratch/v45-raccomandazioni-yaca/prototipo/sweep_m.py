import sys
sys.path.extend(['services', '.scratch/v45-raccomandazioni-yaca/prototipo'])
from pathlib import Path
from collections import Counter
import json
import time
import numpy as np
import scipy.sparse as sp
import pandas as pd

from graph import canon as K
from graph import provenance as _PV
from graph.runtime import Engine
from graph.build import data as D
from cluster import clusterizza_semi
from macro import aggrega_macro_cluster_tau, split_until_M
from tassonomia import TASSONOMIA_36, assegna_etichetta_cluster

print("Loading data...", flush=True)
engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta["COLL"]
anime_flags = meta["ANIME"]
adult_flags = meta["ADULTO"]

PROFILI_10 = [
    ("sangam456", "Corto storico (10 semi)", "Campione originale"),
    ("hammers-lists", "Corto storico (11 semi)", "Campione originale"),
    ("sappss", "Medio-basso storico (25 semi)", "Campione originale"),
    ("flixinatoor99", "Medio storico (32 semi)", "Campione originale"),
    ("moppierhead", "Medio storico (38 semi)", "Campione originale"),
    ("castoffcrown", "Lungo storico (412 semi)", "Campione originale"),
    ("warnok", "Lungo storico (476 semi)", "Campione originale"),
    ("pepsipex", "Massimo storico (568 semi)", "Campione originale"),
    ("carverclan", "Ultra-corto (<10 semi, 7 semi)", "Gap Ultra-Cold Start"),
    ("1jacobjohn", "Intermedio (167 semi)", "Gap Utente Medio Attivo (100-300 semi)"),
]

NOISE_KEYWORDS = {"duringcreditsstinger", "aftercreditsstinger"}

# Preload language/country info
extra_info = {}
for fn, tipo, id_col in [
    ("movies.parquet", "movie", "id"),
    ("tv.parquet", "tv", "id"),
    ("anime-extra-movies.parquet", "movie", "id"),
    ("anime-extra-tv.parquet", "tv", "id"),
]:
    p = Path(".cache/tmdb") / fn
    if p.exists():
        df = pd.read_parquet(p, columns=[id_col, "original_language", "production_countries"])
        for row in df.itertuples(index=False):
            rd = row._asdict()
            k_item = f"{tipo}:{int(rd[id_col])}"
            p_c = rd.get("production_countries")
            c_code = None
            if p_c and isinstance(p_c, str):
                try:
                    p_list = json.loads(p_c)
                    if isinstance(p_list, list) and p_list:
                        c_code = p_list[0].get("iso_3166_1")
                except Exception:
                    pass
            extra_info[k_item] = {
                "orig_lang": rd.get("original_language"),
                "orig_country": c_code,
            }

V = D.vocab()
kw_items = [(t.split(":", 1)[1], c) for t, c in V.items() if t.startswith("kw:")]
kw_names = [x[0] for x in kw_items]
kw_cols = [x[1] for x in kw_items]
X = D.tfidf()
X_kw = X[:, kw_cols].tocsr()

def get_member_kws(r: int) -> set[str]:
    s, e = X_kw.indptr[r], X_kw.indptr[r+1]
    cols = X_kw.indices[s:e]
    return set(kw_names[c] for c in cols if kw_names[c] not in NOISE_KEYWORDS)

def carica_wider_bags(all_righe, triangolo_path):
    M_tri, _ = _PV.leggi(triangolo_path)
    W = (M_tri + M_tri.T).tocsr()
    wider_bags = {}
    for r in all_righe:
        s, e = W.indptr[r], W.indptr[r+1]
        cols = W.indices[s:e]
        vals = W.data[s:e]
        if len(cols) <= 100:
            wider_bags[r] = [(int(c), float(v)) for c, v in zip(cols, vals)]
        else:
            top_idx = np.argpartition(-vals, 100)[:100]
            wider_bags[r] = [(int(cols[j]), float(vals[j])) for j in top_idx]
    return wider_bags

def calcola_sim_wider(righe, wider_bags, n_canon=76497):
    n = len(righe)
    rows, cols, data = [], [], []
    for i, r in enumerate(righe):
        for c, v in wider_bags[int(r)]:
            rows.append(i); cols.append(c); data.append(v)
    B = sp.csr_matrix((data, (rows, cols)), shape=(n, n_canon), dtype=np.float32)
    norms = np.array(np.sqrt(B.multiply(B).sum(axis=1))).ravel()
    norms[norms == 0] = 1.0
    B_norm = sp.diags(1.0 / norms) @ B
    S = (B_norm @ B_norm.T).toarray()
    np.fill_diagonal(S, 1.0)
    return np.clip(S, 0.0, 1.0)

def jaccard(s1: set, s2: set) -> float:
    if not s1 and not s2: return 1.0
    u = len(s1 | s2)
    return len(s1 & s2) / u if u > 0 else 0.0

storie = {u: K.storia_trakt(u, ordine="recente") for u, _, _ in PROFILI_10}
all_righe = sorted(list({r for u in storie for r in storie[u][1]}))
wider_bags = carica_wider_bags(all_righe, Path("services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz"))

print("Precomputing micros and unconstrained macros (tau=0.03)...", flush=True)
profile_base = {}
for u, desc_gap, tipo_gap in PROFILI_10:
    k, righe, plays, eta = storie[u]
    S = calcola_sim_wider(righe, wider_bags)
    micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
    unconstrained_macros = aggrega_macro_cluster_tau(engine, righe, micros, tau=0.03)
    profile_base[u] = {
        'k': k,
        'righe': righe,
        'plays': plays,
        'eta': eta,
        'micros': micros,
        'unconstrained_macros': unconstrained_macros,
        'seed_cache': {} # ckey -> top10
    }

def get_top10(u, idx, med):
    p = profile_base[u]
    ckey = (idx, med)
    if ckey not in p['seed_cache']:
        racs = engine.raccomanda([{"key": p['k'][idx], "plays": 1.0}], cap=10, medium=med, esclusi=p['k'])
        p['seed_cache'][ckey] = set(r["key"] for r in racs)
    return p['seed_cache'][ckey]

print("Setup completed. Ready to sweep M.", flush=True)

def run_eval_for_M(M):
    results_by_timeline = {}
    all_served_shelves = []
    
    # We will record stats on both raw bounded macros and split_bounded macros
    tot_bounded_macros = 0
    tot_bounded_ge2 = 0
    all_bounded_sizes = []
    
    tot_split_macros = 0
    tot_split_ge2 = 0
    all_split_ge2_sizes = []
    
    for u, desc_gap, tipo_gap in PROFILI_10:
        p = profile_base[u]
        k = p['k']
        righe = p['righe']
        plays = p['plays']
        eta = p['eta']
        unconstrained = p['unconstrained_macros']
        n_seeds = len(righe)
        
        # 1. Bounded macros for this M
        bounded = []
        for m in unconstrained:
            if len(m) <= M:
                bounded.append(m)
            else:
                pieces = split_until_M(engine, righe, m, M)
                bounded.extend(pieces)
        bounded.sort(key=len, reverse=True)
        
        tot_bounded_macros += len(bounded)
        for b in bounded:
            all_bounded_sizes.append(len(b))
            if len(b) >= 2:
                tot_bounded_ge2 += 1
                
        # Raw coverage (before medium split)
        cov_bounded = (sum(len(b) for b in bounded) / n_seeds * 100.0) if n_seeds > 0 else 0.0
        
        # 2. Medium rule with small-cluster waiver (<3 seeds) + split on mixed >= 3 seeds
        split_bounded = []
        for m in bounded:
            if len(m) < 3:
                best_idx = max(m, key=lambda idx: (plays[idx], -eta[idx]))
                med_type = "series" if k[best_idx].startswith("tv:") else "movie"
                split_bounded.append((m, med_type, True))
            else:
                media_list = ["series" if k[idx].startswith("tv:") else "movie" for idx in m]
                if len(set(media_list)) > 1:
                    for med_type in ("series", "movie"):
                        sub_m = [idx for idx in m if ("series" if k[idx].startswith("tv:") else "movie") == med_type]
                        if len(sub_m) >= 2:
                            split_bounded.append((sub_m, med_type, False))
                else:
                    split_bounded.append((m, media_list[0], False))
                    
        # Coverage after split_bounded
        tot_clustered_split = sum(len(m) for m, _, _ in split_bounded)
        cov_split = (tot_clustered_split / n_seeds * 100.0) if n_seeds > 0 else 0.0
        
        macro_items = []
        for m_idx, (m, med_type, is_piccolo) in enumerate(split_bounded):
            sz = len(m)
            if sz >= 2:
                all_split_ge2_sizes.append(sz)
                tot_split_ge2 += 1
            tot_split_macros += 1
            
            # Keyword counts
            kw_counts = Counter()
            for idx in m:
                for kw in get_member_kws(righe[idx]):
                    kw_counts[kw] += 1
                    
            qual_kws_05 = [(kw, cnt, cnt / sz) for kw, cnt in kw_counts.items() if (cnt / sz) >= 0.5]
            best_supp = qual_kws_05[0][2] if qual_kws_05 else (kw_counts.most_common(1)[0][1] / sz if kw_counts else 0.0)
            
            # Consistency
            top10_list = [get_top10(u, idx, med_type) for idx in m]
            pairs = [jaccard(top10_list[i], top10_list[j]) for i in range(sz) for j in range(i + 1, sz)]
            consistency = float(np.mean(pairs)) if pairs else 0.0
            
            m_eta = [eta[idx] for idx in m]
            min_e = min(m_eta)
            tot_pl = sum(plays[idx] for idx in m)
            
            macro_items.append({
                "id": m_idx,
                "seeds": m,
                "size": sz,
                "medium": med_type,
                "is_piccolo": is_piccolo,
                "min_eta": min_e,
                "plays": tot_pl,
                "best_supp": best_supp,
                "kw_counts": kw_counts,
                "consistency": consistency,
            })
            
        # Ranking combined
        macro_items.sort(key=lambda x: x["min_eta"])
        for r_idx, item in enumerate(macro_items): item["r_rec"] = r_idx + 1
        
        macro_items.sort(key=lambda x: (-x["size"], -x["consistency"], -x["plays"]))
        for r_idx, item in enumerate(macro_items):
            item["r_sup"] = r_idx + 1
            item["r_comb"] = (item["r_rec"] + item["r_sup"]) / 2.0
            
        macro_items.sort(key=lambda x: (x["r_comb"], -x["consistency"], -x["size"], -x["plays"]))
        
        # Shelf selection up to 5
        selected = []
        seen_colls = set()
        for item in macro_items:
            if item["size"] < 2:
                continue
            m = item["seeds"]
            c_coll = coll[righe[m]]
            pos = [x for x in c_coll if x > 0]
            dom_coll = None
            if pos:
                dom_cid, dom_cnt = Counter(pos).most_common(1)[0]
                if (dom_cnt / len(m)) >= 0.5:
                    dom_coll = int(dom_cid)
            if dom_coll is not None and dom_coll in seen_colls:
                continue
            if dom_coll is not None:
                seen_colls.add(dom_coll)
            selected.append(item)
            if len(selected) == 5:
                break
                
        # Naming evaluation for selected shelves
        shelves_info = []
        for s_idx, sel in enumerate(selected, start=1):
            m = sel["seeds"]
            m_rows = [righe[idx] for idx in m]
            sz = len(m)
            macro_med = sel["medium"]
            is_piccolo = sel.get("is_piccolo", False) or sz < 3
            anime_pct = float(anime_flags[m_rows].mean())
            med_label = "Anime" if anime_pct >= 0.5 else ("Serie" if macro_med == "series" else "Film")
            
            m_sorted = sorted(m, key=lambda idx: (-plays[idx], eta[idx]))
            repr_seeds = [str(meta["TIT"][righe[idx]]) for idx in m_sorted[:3]]
            
            cluster_evidence = {
                "size": sz,
                "medium": macro_med,
                "anime_pct": anime_pct,
                "adult_pct": float(adult_flags[m_rows].mean()),
                "member_kws": [get_member_kws(r) for r in m_rows],
                "languages": Counter(extra_info.get(k[idx], {}).get("orig_lang") for idx in m if extra_info.get(k[idx], {}).get("orig_lang")),
                "countries": Counter(extra_info.get(k[idx], {}).get("orig_country") for idx in m if extra_info.get(k[idx], {}).get("orig_country")),
                "repr_seeds": repr_seeds,
                "is_piccolo": is_piccolo,
            }
            nome_base, nome_fonte, conf, matched_entry = assegna_etichetta_cluster(cluster_evidence)
            
            # Recommendation candidates
            semi_rac = [
                {
                    "tmdbId": int(k[idx].split(":")[1]),
                    "medium": "series" if k[idx].startswith("tv:") else "movie",
                    "tipo": "watched",
                    "peso": 1.0,
                }
                for idx in m
            ]
            racs = engine.raccomanda(semi_rac, cap=5, medium=macro_med, esclusi=k)
            cands = [
                f"{meta['TIT'][engine.row_of[r['key']]]} ({int(meta['ANNO'][engine.row_of[r['key']]])})"
                for r in racs[:5]
            ]
            
            shelf_entry = {
                "shelf_idx": s_idx,
                "nome": nome_base,
                "nome_fonte": nome_fonte,
                "conf": conf,
                "matched_entry": matched_entry.nome if matched_entry else None,
                "medium": macro_med,
                "size": sz,
                "repr_seeds": repr_seeds,
                "all_seed_titles": [str(meta["TIT"][righe[idx]]) for idx in m],
                "cands": cands,
                "consistency": sel["consistency"]
            }
            shelves_info.append(shelf_entry)
            all_served_shelves.append((u, shelf_entry))
            
        results_by_timeline[u] = {
            "n_seeds": n_seeds,
            "n_bounded": len(bounded),
            "n_split": len(split_bounded),
            "n_split_ge2": len([m for m in macro_items if m['size'] >= 2]),
            "cov_bounded": cov_bounded,
            "cov_split": cov_split,
            "n_shelves": len(shelves_info),
            "shelves": shelves_info,
            "n_tax": sum(1 for s in shelves_info if s['nome_fonte'] == 'tassonomia'),
            "n_phv": sum(1 for s in shelves_info if s['nome_fonte'] != 'tassonomia'),
        }
        
    tot_served = len(all_served_shelves)
    tot_tax = sum(1 for _, s in all_served_shelves if s['nome_fonte'] == 'tassonomia')
    tot_phv = sum(1 for _, s in all_served_shelves if s['nome_fonte'] != 'tassonomia')
    tax_match_rate = (tot_tax / tot_served * 100.0) if tot_served > 0 else 0.0
    
    return {
        "M": M,
        "tot_served": tot_served,
        "tot_tax": tot_tax,
        "tot_phv": tot_phv,
        "tax_match_rate": tax_match_rate,
        "by_timeline": results_by_timeline,
        "tot_bounded_macros": tot_bounded_macros,
        "tot_bounded_ge2": tot_bounded_ge2,
        "bounded_sizes": all_bounded_sizes,
        "tot_split_macros": tot_split_macros,
        "tot_split_ge2": tot_split_ge2,
        "split_ge2_sizes": all_split_ge2_sizes,
    }

print("Running sweep over M in [8, 12, 20, 30]...", flush=True)
all_res = {}
for M in [8, 12, 20, 30]:
    t0 = time.time()
    res = run_eval_for_M(M)
    all_res[M] = res
    print(f"M={M:2d} finished in {time.time()-t0:.2f}s | Shelves={res['tot_served']} | Tax Match={res['tax_match_rate']:.1f}% ({res['tot_tax']}/{res['tot_served']})", flush=True)

# Print Summary Table
print("\n" + "="*80)
print("SWEEP OVER M in {8, 12, 20, 30} SUMMARY")
print("="*80)

for M in [8, 12, 20, 30]:
    r = all_res[M]
    szs = r['split_ge2_sizes']
    b_szs = r['bounded_sizes']
    
    # Coverage for timelines > 100 seeds: castoffcrown, warnok, pepsipex, 1jacobjohn
    covs_gt100 = [r['by_timeline'][u]['cov_split'] for u in ['castoffcrown', 'warnok', 'pepsipex', '1jacobjohn']]
    covs_b_gt100 = [r['by_timeline'][u]['cov_bounded'] for u in ['castoffcrown', 'warnok', 'pepsipex', '1jacobjohn']]
    
    print(f"\n--- M = {M} ---")
    print(f"Total Served Shelves: {r['tot_served']}")
    print(f"Taxonomy Match Rate: {r['tax_match_rate']:.2f}% ({r['tot_tax']} named / {r['tot_phv']} transparent)")
    print(f"Split Macros (>=2): {r['tot_split_ge2']} | Sizes: min={min(szs)}, med={np.median(szs):.1f}, mean={np.mean(szs):.1f}, max={max(szs)}")
    print(f"Raw Bounded Macros (all): {r['tot_bounded_macros']} (>=2: {r['tot_bounded_ge2']}) | Sizes: min={min(b_szs)}, med={np.median(b_szs):.1f}, mean={np.mean(b_szs):.1f}, max={max(b_szs)}")
    u_list = ['castoffcrown', 'warnok', 'pepsipex', '1jacobjohn']
    cov_split_str = [f"{u}: {r['by_timeline'][u]['cov_split']:.1f}%" for u in u_list]
    cov_bounded_str = [f"{u}: {r['by_timeline'][u]['cov_bounded']:.1f}%" for u in u_list]
    print(f"Coverage (>100 seeds, split): min={min(covs_gt100):.1f}%, mean={np.mean(covs_gt100):.1f}% | per user: {cov_split_str}")
    print(f"Coverage (>100 seeds, raw bounded): min={min(covs_b_gt100):.1f}%, mean={np.mean(covs_b_gt100):.1f}% | per user: {cov_bounded_str}")
    
    shelves_per_user = {u: r['by_timeline'][u]['n_shelves'] for u in [x[0] for x in PROFILI_10]}
    print(f"Shelves per user: {shelves_per_user}")
    
# Print castoffcrown shelves for each M
print("\n" + "="*80)
print("CASTOFFCROWN 5 SHELVES ACROSS M")
print("="*80)

for M in [8, 12, 20, 30]:
    print(f"\n>>> CASTOFFCROWN (M={M}) <<<")
    coc = all_res[M]['by_timeline']['castoffcrown']
    for s in coc['shelves']:
        print(f"Shelf {s['shelf_idx']}: {s['nome']} [{s['nome_fonte']}, {s['medium']}, sz={s['size']}, cons={s['consistency']:.4f}]")
        print(f"   Seeds ({len(s['all_seed_titles'])}): {s['all_seed_titles'][:6]}")
        print(f"   Candidates: {s['cands']}")

# Save full results to json for detailed reporting
with open('.scratch/v45-raccomandazioni-yaca/prototipo/sweep_m_results.json', 'w', encoding='utf-8') as f:
    # Serialize cleanly
    def json_default(obj):
        if isinstance(obj, (np.integer, np.floating)): return obj.item()
        if isinstance(obj, np.ndarray): return obj.tolist()
        return str(obj)
    json.dump(all_res, f, default=json_default, indent=2)
print("\nResults saved to .scratch/v45-raccomandazioni-yaca/prototipo/sweep_m_results.json")
