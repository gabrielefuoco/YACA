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
from macro import bounded_macros_for_profile

print('Caricamento dati per test_selection_and_naming...', flush=True)
engine = Engine.carica_transizione(pota=16)
meta = K.metadati()
coll = meta['COLL']

PROFILI_10 = [
    ('sangam456', 'Corto storico (10 semi)', 'Campione originale'),
    ('hammers-lists', 'Corto storico (11 semi)', 'Campione originale'),
    ('sappss', 'Medio-basso storico (25 semi)', 'Campione originale'),
    ('flixinatoor99', 'Medio storico (32 semi)', 'Campione originale'),
    ('moppierhead', 'Medio storico (38 semi)', 'Campione originale'),
    ('castoffcrown', 'Lungo storico (412 semi)', 'Campione originale'),
    ('warnok', 'Lungo storico (476 semi)', 'Campione originale'),
    ('pepsipex', 'Massimo storico (568 semi)', 'Campione originale'),
    ('carverclan', 'Ultra-corto (<10 semi, 7 semi)', 'Gap Ultra-Cold Start'),
    ('1jacobjohn', 'Intermedio (167 semi)', 'Gap Utente Medio Attivo (100-300 semi)'),
]

NOISE_KEYWORDS = {'duringcreditsstinger', 'aftercreditsstinger'}

DIZIONARIO_KEYWORD_IT = {
    "based on novel or book": "Tratto da Romanzo",
    "based on manga": "Tratto da Manga",
    "based on comic": "Tratto da Fumetto",
    "based on young adult novel": "Young Adult",
    "based on true story": "Storia Vera",
    "based on video game": "Tratto da Videogiochi",
    "literary adaptation": "Adattamento Letterario",
    "based on play or musical": "Tratto da Opera Teatrale",
    "anime": "Anime",
    "shounen": "Shōnen",
    "sitcom": "Sitcom",
    "superhero": "Supereroi",
    "super power": "Superpoteri",
    "magic": "Magia & Fantasy",
    "space opera": "Space Opera",
    "space": "Spazio",
    "space travel": "Viaggi Spaziali",
    "time travel": "Viaggi nel Tempo",
    "alien": "Alieni",
    "alien invasion": "Invasione Aliena",
    "dystopia": "Distopia",
    "post-apocalyptic future": "Post-Apocalittico",
    "cyberpunk": "Cyberpunk",
    "mecha": "Mecha & Robot",
    "murder": "Giallo & Omicidi",
    "serial killer": "Serial Killer",
    "true crime": "True Crime",
    "thriller": "Thriller",
    "psychological thriller": "Thriller Psicologico",
    "spy": "Spionaggio",
    "spy thriller": "Spy Thriller",
    "miniseries": "Miniserie",
    "period drama": "Dramma in Costume",
    "christian faith": "Fede Cristiana",
    "horror": "Horror",
    "supernatural": "Soprannaturale",
    "supernatural horror": "Horror Soprannaturale",
    "witch": "Streghe & Magia",
    "wizard": "Maghi & Stregoneria",
    "vampire": "Vampiri",
    "zombie": "Zombie",
    "creature": "Creature & Mostri",
    "adult animation": "Animazione per Adulti",
    "3d animation": "Animazione 3D",
    "slice of life": "Slice of Life",
    "coming of age": "Crescita & Adolescenza",
    "teen superhero": "Supereroi Teen",
    "satire": "Satira",
    "social satire": "Satira Sociale",
    "parody": "Parodia",
    "dark comedy": "Commedia Nera",
    "adult humor": "Comicità per Adulti",
    "crude humor": "Umorismo Scorretto",
    "ironic": "Ironico",
    "dysfunctional family": "Famiglia Disfunzionale",
    "family conflict": "Conflitti Familiari",
    "family": "Famiglia",
    "friendship": "Amicizia",
    "friends": "Amicizia",
    "small town": "Provincia",
    "working class": "Classe Operaia",
    "middle class": "Borghesia",
    "class differences": "Differenze Sociali",
    "romance": "Romantico",
    "sequel": "Sequel",
    "anthology": "Antologia",
    "1930s": "Anni '30",
    "1980s": "Anni '80",
    "1990s": "Anni '90",
    "ambivalent": "Conflitto Morale",
    "sports": "Sport",
    "sports entertainment": "Spettacolo Sportivo",
    "wrestling": "Wrestling",
    "fight": "Combattimento",
    "martial arts": "Arti Marziali",
    "sports documentary": "Documentario Sportivo",
    "nature documentary": "Documentario Naturalistico",
    "nature": "Natura",
    "ice age": "Era Glaciale",
    "medical drama": "Medical Drama",
    "hospital": "Ospedale & Medicina",
    "spin off": "Spin-off",
    "automobile": "Automobili & Motori",
    "classic cars": "Auto d'Epoca",
    "car race": "Gare Automobilistiche",
    "hotel": "Hotel & Ospitalità",
    "filmed theater": "Teatro Filmato",
    "dating show": "Dating Show",
    "farm": "Vita Rurale",
    "bathing": "Nuoto & Balneazione",
    "swimming": "Nuoto",
    "inanimate objects come to life": "Oggetti che Prendono Vita",
    "museum": "Museo",
    "villain": "Antagonisti",
}

def translate_kw(kw: str) -> str:
    if kw in DIZIONARIO_KEYWORD_IT:
        return DIZIONARIO_KEYWORD_IT[kw]
    return kw.strip().title()

# Preload parquet metadata for collection names and directors
print('Pre-caricamento collection_name e directors da Parquet...', flush=True)
coll_names = {}
dir_names = {}

for fn, tipo, id_col, name_col, dir_col in [
    ('movies.parquet', 'movie', 'id', 'collection_name', 'directors'),
    ('tv.parquet', 'tv', 'id', None, 'created_by'),
    ('anime-extra-movies.parquet', 'movie', 'id', 'collection_name', 'directors'),
    ('anime-extra-tv.parquet', 'tv', 'id', None, 'created_by'),
]:
    p = Path('.cache/tmdb') / fn
    if p.exists():
        cols = [id_col]
        if name_col: cols.append(name_col)
        if dir_col: cols.append(dir_col)
        df = pd.read_parquet(p, columns=cols)
        for _, row in df.iterrows():
            k_item = f"{tipo}:{int(row[id_col])}"
            if name_col and pd.notna(row[name_col]) and str(row[name_col]).strip():
                coll_names[k_item] = str(row[name_col]).strip()
            if dir_col and pd.notna(row[dir_col]) and str(row[dir_col]).strip():
                try:
                    d_val = row[dir_col]
                    if isinstance(d_val, str):
                        parsed = json.loads(d_val)
                    else:
                        parsed = d_val
                    if isinstance(parsed, list) and parsed:
                        first_dir = parsed[0].get('name')
                        if first_dir:
                            dir_names[k_item] = str(first_dir).strip()
                except Exception:
                    pass

print(f'Mappati {len(coll_names)} titoli con collection_name e {len(dir_names)} con director.', flush=True)

# Load wider bags and stories
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

storie = {u: K.storia_trakt(u, ordine='recente') for u, _, _ in PROFILI_10}
all_righe = sorted(list({r for u in storie for r in storie[u][1]}))
wider_bags = carica_wider_bags(all_righe, Path('services/graph/data/v45/bolle-eterogeneo-V45-p1.0-triangolo.npz'))

cache_file = Path('.scratch/v45-raccomandazioni-yaca/prototipo/profiles_eval_cache.pkl')
if cache_file.exists():
    import pickle
    print(f'Caricamento profiles_eval da cache {cache_file}...', flush=True)
    with open(cache_file, 'rb') as f:
        profiles_eval = pickle.load(f)
else:
    print('Calcolo macro per le 10 timeline a tau=0.03...')
    profiles_eval = {}

    for u, desc_gap, tipo_gap in PROFILI_10:
        k, righe, plays, eta = storie[u]
        S = calcola_sim_wider(righe, wider_bags)
        micros, _, _ = clusterizza_semi(S, min_affinity=0.02, max_k=9999, min_size=2)
        bounded = bounded_macros_for_profile(engine, righe, micros, M=30, tau=0.03)
        
        # Precompute consistency and metadata for each macro
        macro_items = []
        seed_cache = {}
        
        for m_idx, m in enumerate(bounded):
            sz = len(m)
            media_list = ['series' if k[idx].startswith('tv:') else 'movie' for idx in m]
            n_ser = sum(1 for x in media_list if x == 'series')
            macro_med = 'series' if n_ser > (len(m) - n_ser) else 'movie'
            
            # Keyword counts
            kw_counts = Counter()
            for idx in m:
                for kw in get_member_kws(righe[idx]):
                    kw_counts[kw] += 1
                    
            # Keyword gate (old criterion: support >= 0.5)
            qual_kws_05 = [(kw, cnt, cnt / sz) for kw, cnt in kw_counts.items() if (cnt / sz) >= 0.5]
            best_supp = qual_kws_05[0][2] if qual_kws_05 else (kw_counts.most_common(1)[0][1] / sz if kw_counts else 0.0)
            old_gate_pass = (best_supp >= 0.5)
            
            # Consistency computation
            if sz >= 2:
                top10_list = []
                for idx in m:
                    ckey = (idx, macro_med)
                    if ckey not in seed_cache:
                        racs = engine.raccomanda([{'key': k[idx], 'plays': 1.0}], cap=10, medium=macro_med, esclusi=k)
                        seed_cache[ckey] = set(r['key'] for r in racs)
                    top10_list.append(seed_cache[ckey])
                pairs = [jaccard(top10_list[i], top10_list[j]) for i in range(sz) for j in range(i + 1, sz)]
                consistency = float(np.mean(pairs))
            else:
                consistency = 0.0
                
            m_eta = [eta[idx] for idx in m]
            min_e = min(m_eta)
            tot_pl = sum(plays[idx] for idx in m)
            
            macro_items.append({
                'id': m_idx,
                'seeds': m,
                'size': sz,
                'medium': macro_med,
                'min_eta': min_e,
                'plays': tot_pl,
                'best_supp': best_supp,
                'kw_counts': kw_counts,
                'old_gate_pass': old_gate_pass,
                'consistency': consistency,
            })
            
        profiles_eval[u] = {
            'desc_gap': desc_gap,
            'tipo_gap': tipo_gap,
            'n_seeds': len(righe),
            'k': k,
            'righe': righe,
            'plays': plays,
            'eta': eta,
            'macros': macro_items,
        }
    import pickle
    with open(cache_file, 'wb') as f:
        pickle.dump(profiles_eval, f)
    print(f'Salvato profiles_eval in cache {cache_file}!', flush=True)

# Ranking combined: recency rank (min_eta) and support rank (-size, -plays)
for u, p_data in profiles_eval.items():
    macros = p_data['macros']
    macros.sort(key=lambda x: x['min_eta'])
    for r_idx, item in enumerate(macros): item['r_rec'] = r_idx + 1
    macros.sort(key=lambda x: (-x['size'], -x['plays']))
    for r_idx, item in enumerate(macros):
        item['r_sup'] = r_idx + 1
        item['r_comb'] = (item['r_rec'] + item['r_sup']) / 2.0
    macros.sort(key=lambda x: (x['r_comb'], x['r_rec'], -x['size']))

# Sweep over consistency thresholds: [0.15, 0.10, 0.05, 0.02, 0.01, 0.0001, 0.0]
print('\n================ SWEEP DELLE SOGLIE DI ADOZIONE PER CONSISTENZA ================', flush=True)
for thresh in [0.15, 0.10, 0.05, 0.02, 0.01, 0.0001, 0.0]:
    served_by_user = {}
    for u, p_data in profiles_eval.items():
        k = p_data['k']
        righe = p_data['righe']
        macros = p_data['macros']
        
        sel = []
        seen_colls = set()
        for item in macros:
            if item['size'] < 2:
                continue
            if item['consistency'] < thresh:
                continue
            # Coll dedupe
            m = item['seeds']
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
            sel.append(item)
            if len(sel) == 5:
                break
        served_by_user[u] = len(sel)
        
    tot_served = sum(served_by_user.values())
    print(f'Thresh {thresh:6.4f}: Tot Serviti = {tot_served}/40 | Per utente: {served_by_user}', flush=True)

# Now check Naming Fallback Chain for shelves at chosen threshold!

print('\n================ DETTAGLIO CONSISTENZA E VECCHIO GATE PER MACRO ================', flush=True)
for u, p_data in profiles_eval.items():
    print(f"\n--- Profilo: {u} (Semi tot={p_data['n_seeds']}) ---", flush=True)
    for m in p_data['macros']:
        if m['size'] < 2: continue
        titles = [meta['TIT'][p_data['righe'][idx]] for idx in m['seeds'][:3]]
        print(f"  Macro {m['id']:2d} | sz={m['size']:2d} | cons={m['consistency']:.4f} | kw_supp={m['best_supp']:.2f} | old_pass={m['old_gate_pass']} | semi={titles}", flush=True)

# Controlla specificamente castoffcrown per i grab bag storici
print('\n================ VERIFICA GRAB BAG STORICI SU CASTOFFCROWN ================', flush=True)
# Titoli noti dei vecchi grab bag:
# 'Come è fatto', 'I predatori dell'arca perduta', 'Il Signore degli Anelli'
# '梦华录', 'Kamen Rider ZEZTZ', 'Sweet/Vicious'
coc = profiles_eval['castoffcrown']
coc_k = coc['k']
coc_r = coc['righe']
for m in coc['macros']:
    m_titles = [meta['TIT'][coc_r[idx]] for idx in m['seeds']]
    has_how_its_made = any("Come è fatto" in t or "How It's Made" in t for t in m_titles)
    has_indiana = any("predatori" in t.lower() or "indiana jones" in t.lower() for t in m_titles)
    has_lotr = any("signore degli anelli" in t.lower() or "lord of the rings" in t.lower() for t in m_titles)
    has_lav_diaz = any("From What Is Before" in t or "Woman Who Left" in t or "Lav Diaz" in t for t in m_titles)
    has_kamen = any("kamen rider" in t.lower() for t in m_titles)
    has_sweet_vicious = any("sweet/vicious" in t.lower() for t in m_titles)
    
    if (has_how_its_made and has_indiana) or (has_sweet_vicious and has_kamen):
        print(f"ATTENZIONE: Trovato vecchio grab bag saldato! Macro {m['id']} (sz={m['size']}, cons={m['consistency']:.4f}): {m_titles[:5]}", flush=True)
    elif has_how_its_made or has_indiana or has_sweet_vicious:
        print(f"Macro {m['id']} (sz={m['size']}, cons={m['consistency']:.4f}): contiene {m_titles[:3]}", flush=True)

# Test Naming Fallback Chain
print('\n================ TEST NAMING FALLBACK CHAIN ================', flush=True)
def assegna_nome_shelf(item, k_prof, righe_prof):
    m = item['seeds']
    sz = len(m)
    m_rows = [righe_prof[idx] for idx in m]
    m_keys = [k_prof[idx] for idx in m]
    macro_med = item['medium']
    
    # Label medium
    anime_flags = meta['ANIME']
    anime_pct = float(anime_flags[m_rows].mean())
    if anime_pct >= 0.5:
        med_label = "Anime"
    elif macro_med == "series":
        med_label = "Serie"
    else:
        med_label = "Film"
        
    kw_counts = item['kw_counts']
    # 1. Highest-support keyword pair if support >= 0.3
    kws_ge_03 = [(kw, cnt, cnt / sz) for kw, cnt in kw_counts.items() if (cnt / sz) >= 0.3]
    kws_ge_03 = [x for x in kws_ge_03 if not (med_label == "Anime" and x[0].lower() == "anime")]
    kws_ge_03.sort(key=lambda x: (-x[2], -x[1], x[0]))
    
    # Deduplicate in Italian
    dedup_03 = []
    seen_it = set()
    for kw, cnt, supp in kws_ge_03:
        it = translate_kw(kw)
        if it in seen_it: continue
        if any(kw.lower() in d[0].lower() or d[0].lower() in kw.lower() for d in dedup_03): continue
        dedup_03.append((kw, cnt, supp))
        seen_it.add(it)
        if len(dedup_03) == 2: break
        
    if len(dedup_03) == 2:
        label = f"{med_label}: {translate_kw(dedup_03[0][0])} ({dedup_03[0][2]*100:.0f}%) & {translate_kw(dedup_03[1][0])} ({dedup_03[1][2]*100:.0f}%)"
        return label, "1_kw_pair_ge_0.3"
        
    # 2. Else dominant collection name
    c_coll = coll[m_rows]
    pos_coll = [x for x in c_coll if x > 0]
    if pos_coll:
        cid, cnt = Counter(pos_coll).most_common(1)[0]
        # Check if dominant (e.g. >= 50% or most common collection name)
        # Find collection name from coll_names
        sample_keys = [m_keys[i] for i, r in enumerate(m_rows) if coll[r] == cid]
        cname = None
        for sk in sample_keys:
            if sk in coll_names:
                cname = coll_names[sk]
                break
        if cname and (cnt / sz) >= 0.4: # significant collection presence
            return f"{med_label}: Collezione {cname}", "2_collection_name"
            
    # 3. Else dominant director
    m_dirs = [dir_names.get(k) for k in m_keys if dir_names.get(k)]
    if m_dirs:
        dname, cnt = Counter(m_dirs).most_common(1)[0]
        if (cnt / sz) >= 0.4 or cnt >= 2: # dominant director
            return f"{med_label}: Regia di {dname}", "3_director"
            
    # 4. Else label built from medium + strongest available keyword
    # If there was 1 keyword in dedup_03:
    if len(dedup_03) == 1:
        kw, cnt, supp = dedup_03[0]
        return f"{med_label}: {translate_kw(kw)} ({supp*100:.0f}%)", "4_medium_plus_kw"
        
    if kw_counts:
        best_kw, cnt = kw_counts.most_common(1)[0]
        return f"{med_label}: {translate_kw(best_kw)} ({cnt/sz*100:.0f}%)", "4_medium_plus_kw"
        
    return f"{med_label}", "4_medium_only"

# Check served shelves at Thresh = 0.0001 (or >0 consistency) and Thresh = 0.02
for th in [0.02, 0.0001, 0.0]:
    print(f"\n================ NOMI SCAFFALI A SOGLIA CONSISTENZA {th} ================", flush=True)
    for u, p_data in profiles_eval.items():
        k = p_data['k']
        righe = p_data['righe']
        macros = p_data['macros']
        sel = []
        seen_colls = set()
        for item in macros:
            if item['size'] < 2: continue
            if item['consistency'] < th: continue
            m = item['seeds']
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
            sel.append(item)
            if len(sel) == 5:
                break
        print(f"Profilo {u} ({len(sel)} scaffali):")
        for s_i, s_item in enumerate(sel, 1):
            nm, source = assegna_nome_shelf(s_item, k, righe)
            print(f"  {s_i}. {nm} [fonte: {source}] (sz={s_item['size']}, cons={s_item['consistency']:.4f}, best_supp={s_item['best_supp']:.2f})")

