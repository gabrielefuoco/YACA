"""confronto-v15-v18.py — 25 film + 25 serie + 10 anime, V15 contro V18 (studente nuovo).

  PYTHONPATH=. py .scratch/distillazione-grafo/confronto-v15-v18.py

V15 ha il vecchio studente (66.259 nodi), V18 il nuovo (76.497). I semi sono tutti titoli vecchi,
quindi la stessa riga vale per entrambi: il confronto e' a parita' di seme.
"""
import json

import numpy as np
import pandas as pd
import scipy.sparse as sp

from services.graph_dense import config as C
from services.graph_dense import data as D

FILM = ["Parasite", "Drive", "Inception", "Interstellar", "Jurassic Park", "Matrix", "Get Out",
        "The Godfather Part II", "Cinema Paradiso", "Pan's Labyrinth", "La haine", "Melancholia",
        "Under the Skin", "Arrival", "Ex Machina", "Her", "Gone Girl", "Prisoners", "Nightcrawler",
        "Sicario", "Mad Max: Fury Road", "Barbie", "The Seventh Seal", "Persona",
        "Bicycle Thieves"]
SERIE = ["The Wire", "Twin Peaks", "Chernobyl", "Black Mirror", "Mr. Robot", "Dark", "Succession",
         "BoJack Horseman", "Peaky Blinders", "Money Heist", "Breaking Bad", "The Sopranos",
         "True Detective", "Mad Men", "The Leftovers", "Fargo", "Better Call Saul",
         "Stranger Things", "Westworld", "Sherlock", "Doctor Who", "Game of Thrones",
         "Rick and Morty", "Friends", "The Office"]
ANIME = ["Elfen Lied", "Monster", "Serial Experiments Lain", "Perfect Blue", "Paprika",
         "Attack on Titan", "Death Note", "Fullmetal Alchemist: Brotherhood", "One Piece",
         "Cowboy Bebop"]


def norm(s):
    import re
    import unicodedata
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', s)).strip()


def indice():
    idx = {}
    for tipo, f, cols in (('movie', 'movies.parquet', ['id', 'title', 'title_en', 'original_title']),
                          ('tv', 'tv.parquet', ['id', 'name', 'name_en', 'original_name'])):
        d = pd.read_parquet(C.TMDB / f, columns=cols)
        for r in d.itertuples(index=False):
            k = f'{tipo}:{int(r.id)}'
            for c in cols[1:]:
                v = getattr(r, c, None)
                if isinstance(v, str) and v.strip():
                    idx.setdefault(norm(v), set()).add(k)
    return idx


B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; VOT = B['VOT']; KEYS = B['keys']
idx = indice()
semi = []
for gruppo, nomi in (('film', FILM), ('serie', SERIE), ('anime', ANIME)):
    for n in nomi:
        cand = [k for k in idx.get(norm(n), set()) if k in RO]
        if not cand:
            print(f'  ✗ non risolto: {n}'); continue
        # preferisce il medium giusto
        pref = 'movie' if gruppo == 'film' else 'tv'
        cand.sort(key=lambda k: (not k.startswith(pref), -VOT[RO[k]]))
        semi.append((gruppo, n, cand[0]))

vet = {nome: 'services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz' for nome in ()}
G = {}
for nome, p in (('V15', 'services/graph/data/v15/bolle-eterogeneo-V15-p1.0-triangolo.npz'),
                ('V18', 'services/graph/data/v18/bolle-eterogeneo-V18-p1.0-triangolo.npz')):
    z = np.load(p); n = len(z['indptr']) - 1
    G[nome] = (sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(n, n)), n)
print(f'semi: {len(semi)} · ' + ' · '.join(f'{g}: {sum(1 for x in semi if x[0]==g)}'
                                          for g in ('film', 'serie', 'anime')))

NUOVI = 66259


def top(nome, i, k=10):
    M, n = G[nome]
    if i >= n:
        return []
    r = M.getrow(i)
    return [int(j) for j in r.indices[np.argsort(-r.data)] if int(j) != i][:k]


righe = ['# V15 (vecchio studente) contro V18 (studente nuovo)', '',
         '25 film · 25 serie · 10 anime. Top-10 di ciascuno; in **grassetto** i titoli che compaiono '
         'solo in uno dei due.', '']
agg = {'film': [], 'serie': [], 'anime': []}
for gruppo, nome, key in semi:
    i = RO[key]
    a, b = top('V15', i), top('V18', i)
    inter = len(set(a) & set(b))
    agg[gruppo].append(inter)
    righe += [f'\n### {nome} ({gruppo}) — `{key}`', '',
              '| # | V15 | V18 |', '|---|---|---|']
    for q in range(10):
        ta = T[a[q]] if q < len(a) else ''
        tb = T[b[q]] if q < len(b) else ''
        if ta == tb:
            righe.append(f'| {q+1} | {ta} | {tb} |')
        else:
            righe.append(f'| {q+1} | {ta} | **{tb}** |')
    righe.append(f'\n*top-10 in comune: {inter}/10*')
open('.scratch/distillazione-grafo/confronto-v15-v18.md', 'w', encoding='utf-8').write('\n'.join(righe) + '\n')

print('\n| gruppo | top-10 in comune (media) |')
print('|---|---:|')
for g, v in agg.items():
    print(f'| {g} | {np.mean(v):.1f}/10 |')
# quanto pesano i titoli nuovi nelle liste V18
nuovi = 0
tot = 0
for gruppo, nome, key in semi:
    b = top('V18', RO[key])
    nuovi += sum(1 for j in b if j >= NUOVI); tot += len(b)
print(f'\ntitoli NUOVI (fuori dai 66.259) nelle liste V18: {nuovi}/{tot}')
print('scritto .scratch/distillazione-grafo/confronto-v15-v18.md')
