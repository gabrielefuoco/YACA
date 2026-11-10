import sys
sys.path.insert(0, 'services')
import json
import re
import numpy as np
import pandas as pd
from graph import canon as K

keys, row_of, N, is_tv = K.titoli()
meta = K.metadati()
titoli_str = meta['TIT']
vave = meta['VAVE']
vot = meta['VOT']
nep = meta['NEP']

df_m = pd.read_parquet('.cache/tmdb/movies.parquet', columns=['id', 'title', 'keywords', 'overview', 'runtime', 'vote_average', 'vote_count'])
df_tv = pd.read_parquet('.cache/tmdb/tv.parquet', columns=['id', 'name', 'keywords', 'overview', 'runtime', 'vote_average', 'vote_count', 'number_of_episodes'])

# Keyword polarity dictionaries with weights
# TONO: -1 (leggero) to +1 (cupo)
TONO_CUPO_KEYWORDS = {
    # Lutto, suicidio e morte dolorosa
    'suicide': 3.0, 'suicide attempt': 2.5, 'mass suicide': 3.0, 'teen suicide': 2.5,
    'grief': 2.5, 'mourning': 2.0, 'coping with grief': 2.0,
    'death of a loved one': 2.0, 'death of child': 2.5, 'death of mother': 1.5,
    'death of father': 1.5, 'death of brother': 2.0, 'death of wife': 1.5,
    'funeral': 1.2, 'funeral home': 1.0,
    'terminal illness': 2.5, 'cancer': 2.0, 'fatal disease': 2.0,
    'dying and death': 1.8, 'fear of death': 1.5, 'violent death': 2.2,

    # Disperazione, salute mentale e trauma
    'depression': 2.5, 'depressing': 2.5, 'depressed': 2.0, 'manic depression': 2.5,
    'postpartum depression': 2.0, 'melancholy': 1.8, 'sadness': 1.5,
    'despair': 2.5, 'hopeless': 2.5, 'nihilism': 2.5, 'existential dread': 2.5,
    'panic attack': 2.2, 'mental breakdown': 2.2, 'psychosis': 2.0,
    'trauma': 2.2, 'post-traumatic stress disorder (ptsd)': 2.5, 'childhood trauma': 2.5,
    'war trauma': 2.2, 'traumatic childhood': 2.0, 'traumatized woman': 2.0,
    'paranoia': 1.5, 'paranoid': 1.5, 'angst': 1.5,

    # Violenza estrema, crudeltà e sadismo
    'torture': 2.8, 'torture chamber': 2.5, 'torture porn': 3.0, 'sadistic torture': 3.0,
    'sadism': 2.5, 'sadistic': 2.5, 'sadist': 2.5, 'sadistic horror': 2.8,
    'brutality': 2.5, 'police brutality': 2.2, 'brutal violence': 2.8, 'prison brutality': 2.2,
    'gore': 2.5, 'splatter': 2.2, 'body horror': 2.5, 'visceral': 2.0,
    'serial killer': 2.5, 'mass murder': 2.8, 'killing spree': 2.5, 'psycho killer': 2.2,
    'massacre': 2.8, 'slaughter': 2.5, 'slaughterhouse': 2.0,
    'mutilation': 2.8, 'decapitation': 2.5, 'cannibalism': 2.5,
    'graphic violence': 2.5, 'murder': 1.2, 'murderer': 1.5,

    # Orrore, incubo e oscurità
    'psychological horror': 2.2, 'supernatural horror': 1.8, 'horror': 1.5,
    'survival horror': 1.8, 'nightmare': 2.0, 'dystopian nightmare': 2.5,
    'bleak': 2.8, 'grim': 2.2, 'grimdark': 2.5, 'darkness': 1.8, 'dark': 1.2,
    'dark secret': 1.5, 'dark past': 1.5, 'dread': 2.2,

    # Atrocità storiche, sociali e abusi
    'holocaust': 3.0, 'concentration camp': 3.0, 'war crimes': 2.8, 'genocide': 3.0,
    'caste violence': 2.5, 'human trafficking': 2.5, 'sex trafficking': 2.8,
    'sexual violence': 2.8, 'sexual abuse': 2.8, 'rape': 3.0, 'child abuse': 3.0,
    'domestic violence': 2.2, 'domestic abuse': 2.2, 'slavery': 2.2,

    # Distopia cupa e degrado
    'dystopia': 1.8, 'dystopian': 1.8, 'post-apocalyptic': 1.8, 'cynical': 1.5,
    'bleak future': 2.2, 'poverty': 1.2, 'slum': 1.2,
}

TONO_LEGGERO_KEYWORDS = {
    # Umore, spensieratezza e calore
    'lighthearted': 2.5, 'cheerful': 2.5, 'optimistic': 2.2, 'optimism': 2.2,
    'wholesome': 2.5, 'wholesome comedy': 2.5, 'feel-good': 2.5,
    'comforting': 2.0, 'heartwarming': 2.5, 'happy ending': 2.0,

    # Commedia e comicità
    'slapstick comedy': 2.2, 'slapstick humor': 2.0, 'romantic comedy': 2.2,
    'romcom': 2.0, 'sitcom': 2.0, 'spoof': 1.8, 'parody': 1.5,
    'buddy comedy': 2.0, 'teen comedy': 1.8, 'screwball comedy': 2.2,
    'humor': 1.2, 'amusing': 1.5, 'playful': 1.8, 'action comedy': 1.2,
    'sex comedy': 1.5, 'workplace comedy': 1.5, 'stand-up comedy': 1.5,

    # Relazioni positive e affetto
    'friendship': 1.5, 'unlikely friendship': 1.5, 'childhood friends': 1.5,
    'female friendship': 1.5, 'male friendship': 1.5, 'bromance': 1.8,
    'family vacation': 1.8, 'love': 1.0, 'love of one\'s life': 1.2,
    'slice of life': 1.2, 'first love': 1.2,

    # Feste, celebrazioni e vacanze
    'christmas': 1.5, 'christmas eve': 1.5, 'christmas tree': 1.5,
    'christmas party': 1.8, 'holiday': 1.2, 'holiday season': 1.5,
    'vacation': 1.2, 'summer vacation': 1.5, 'wedding': 1.2,
    'birthday': 1.2,

    # Mondi spensierati, animazione per famiglie ed evasione
    'fairytale': 1.5, 'magic': 0.8, 'amusement park': 1.5,
    'anthropomorphism': 1.5, '3d animation': 0.8, 'musical': 1.0,
    'sports victory': 1.2, 'road trip': 0.8, 'cute': 1.8,
}

# COMPLESSITA: -1 (lineare) to +1 (esigente)
COMPLESSITA_ESIGENTE_KEYWORDS = {
    # Filosofia ed esistenzialismo
    'philosophical': 2.5, 'philosophy': 2.2, 'philosopher': 2.0,
    'existentialism': 2.5, 'existential crisis': 2.2, 'existentialist': 2.2,
    'meaningless existence': 2.0, 'morality': 1.8, 'moral ambiguity': 2.5,
    'ethics': 1.8, 'theology': 2.0, 'allegory': 2.0,

    # Narrativa sperimentale e slow cinema
    'slow cinema': 3.0, 'slow burn': 2.0, 'meditative': 2.5,
    'non-linear narrative': 2.8, 'unreliable narrator': 2.8, 'stream of consciousness': 3.0,
    'avant-garde': 2.8, 'avant garde': 2.8, 'experimental cinema': 2.8,
    'experimental film': 2.8, 'experimental': 2.2, 'surrealism': 2.2,
    'surreal': 1.8, 'metafiction': 2.5, 'symbolism': 2.0,
    'art house': 2.5, 'arthouse': 2.5, 'poetic cinema': 2.8, 'poetic documentary': 2.2,

    # Complessità psicologica, politica e sociale
    'psychological': 1.5, 'psychological drama': 2.0, 'psychological thriller': 1.5,
    'cerebral': 2.5, 'complex': 1.8, 'complex relationship': 1.8,
    'social commentary': 2.0, 'political intrigue': 2.0, 'political conspiracy': 1.8,
    'conspiracy': 1.2, 'investigative journalism': 1.8, 'courtroom drama': 1.8,
    'courtroom': 1.5, 'anti-capitalist': 1.8, 'class differences': 1.8,
    'satire': 1.2, 'social satire': 1.8, 'political satire': 1.8,

    # Dramma d'epoca e storico esigente
    'costume drama': 1.5, 'period drama': 1.5, 'historical drama': 1.5,
    '18th century': 1.5, '19th century': 1.2, 'historical fiction': 1.2,
    'historical epic': 1.8,
}

COMPLESSITA_LINEARE_KEYWORDS = {
    # Azione diretta ed esplosiva
    'action hero': 2.2, 'explosion': 2.0, 'explosions': 2.0, 'car chase': 2.2,
    'chase': 1.5, 'police chase': 1.8, 'gunfight': 1.8, 'shootout': 1.8,
    'martial arts': 1.5, 'kung fu': 1.8, 'sword fight': 1.2,
    'superhero': 1.8, 'superhero team': 1.8, 'super power': 1.8,
    'masked vigilante': 1.5, 'rescue mission': 1.5, 'car race': 1.5,

    # Popcorn, formule semplici e intrattenimento leggero
    'popcorn': 2.5, 'b movie': 2.2, 'monster movie': 1.8, 'kaiju': 1.8,
    'creature feature': 1.8, 'disaster movie': 1.8, 'slapstick comedy': 2.0,
    'slapstick humor': 2.0, 'teen comedy': 1.5, 'spoof': 1.8,
    'buddy cop': 1.8, 'formulaic': 2.5, 'pop culture': 1.2,

    # Procedurali e format semplici
    'police procedural': 1.5, 'game show': 2.5, 'reality show': 2.5,
    'talk show': 2.0, 'late-night show': 2.0,
}

# Fast lookup dicts by TMDB id
m_data = {}
for _, row in df_m.iterrows():
    m_data[int(row['id'])] = {
        'keywords': [x['name'].lower().strip() for x in json.loads(row['keywords'])] if row['keywords'] else [],
        'overview': str(row['overview'] or ''),
        'runtime': float(row['runtime']) if pd.notna(row['runtime']) else 100.0,
        'vote_average': float(row['vote_average']) if pd.notna(row['vote_average']) else 6.5,
    }

tv_data = {}
for _, row in df_tv.iterrows():
    tv_data[int(row['id'])] = {
        'keywords': [x['name'].lower().strip() for x in json.loads(row['keywords'])] if row['keywords'] else [],
        'overview': str(row['overview'] or ''),
        'runtime': float(row['runtime']) if pd.notna(row['runtime']) else 45.0,
        'episodes': float(row['number_of_episodes']) if pd.notna(row['number_of_episodes']) else 10.0,
        'vote_average': float(row['vote_average']) if pd.notna(row['vote_average']) else 7.0,
    }

# Compute raw scores
raw_tono = np.zeros(N, dtype=np.float32)
raw_complessita = np.zeros(N, dtype=np.float32)

for i, k in enumerate(keys):
    is_series = is_tv[i]
    tid = int(k.split(':')[1])
    item = tv_data.get(tid) if is_series else m_data.get(tid)
    if not item:
        continue
    kws = item['keywords']
    ov = item['overview'].lower()
    
    # 1. Tono from keywords
    c_score = sum(TONO_CUPO_KEYWORDS.get(w, 0.0) for w in kws)
    l_score = sum(TONO_LEGGERO_KEYWORDS.get(w, 0.0) for w in kws)
    
    # Light overview scan for strong polarity terms
    if 'suicid' in ov or 'depress' in ov or 'traged' in ov or 'lutto' in ov or 'tortur' in ov:
        c_score += 1.0
    if 'allegro' in ov or 'spensierat' in ov or 'divertente' in ov or 'commedia' in ov:
        l_score += 1.0
        
    diff_tono = c_score - l_score
    # Sigmoidal compression to [-1, 1]
    raw_tono[i] = np.tanh(diff_tono / 3.0)
    
    # 2. Complessita from keywords, runtime, ratings
    esig_score = sum(COMPLESSITA_ESIGENTE_KEYWORDS.get(w, 0.0) for w in kws)
    lin_score = sum(COMPLESSITA_LINEARE_KEYWORDS.get(w, 0.0) for w in kws)
    
    # Runtime adjustment (only movies or long episodes)
    if not is_series:
        rt = item['runtime']
        if rt >= 160:
            esig_score += 1.5
        elif rt >= 135:
            esig_score += 0.8
        elif rt < 85:
            lin_score += 1.0
    else:
        ep = item.get('episodes', 10.0)
        if ep >= 30:
            esig_score += 0.8
            
    # Rating influence (demanding works often have high critical consensus)
    va = item['vote_average']
    if va >= 8.2:
        esig_score += 0.5
    elif va < 5.8:
        lin_score += 0.5
        
    diff_comp = esig_score - lin_score
    raw_complessita[i] = np.tanh(diff_comp / 3.0)

# Print anchor titles check
print("=== ANCHOR TITLES CHECK ===")
anchors = [
    ('The Bear', 'tv:136315'),
    ('Cars - Motori ruggenti', 'movie:920'),
    ('Barry Lyndon', 'movie:3175'),
    ('The Transporter', 'movie:4108'),
    ('Parasite', 'movie:496243'),
    ('Love Actually - L\'amore davvero', 'movie:508'),
]

for name, k in anchors:
    r = row_of[k]
    print(f"{name:<35} | Tono: {raw_tono[r]:+6.3f} | Complessità: {raw_complessita[r]:+6.3f}")

# Top 15 nearest each end
print("\n=== TONO: TOP 15 PIÙ LEGGERI (-1) ===")
leggeri_idx = np.argsort(raw_tono)[:15]
for idx in leggeri_idx:
    print(f"  {titoli_str[idx]:<45} | tono: {raw_tono[idx]:+6.3f} | comp: {raw_complessita[idx]:+6.3f}")

print("\n=== TONO: TOP 15 PIÙ CUPI (+1) ===")
cupi_idx = np.argsort(-raw_tono)[:15]
for idx in cupi_idx:
    print(f"  {titoli_str[idx]:<45} | tono: {raw_tono[idx]:+6.3f} | comp: {raw_complessita[idx]:+6.3f}")

print("\n=== COMPLESSITÀ: TOP 15 PIÙ LINEARI (-1) ===")
lineari_idx = np.argsort(raw_complessita)[:15]
for idx in lineari_idx:
    print(f"  {titoli_str[idx]:<45} | comp: {raw_complessita[idx]:+6.3f} | tono: {raw_tono[idx]:+6.3f}")

print("\n=== COMPLESSITÀ: TOP 15 PIÙ ESIGENTI (+1) ===")
esigenti_idx = np.argsort(-raw_complessita)[:15]
for idx in esigenti_idx:
    print(f"  {titoli_str[idx]:<45} | comp: {raw_complessita[idx]:+6.3f} | tono: {raw_tono[idx]:+6.3f}")
