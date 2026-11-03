"""anime-30.py — la top-20 di V14 su 30 anime di generi misti.

  PYTHONPATH=. py .scratch/distillazione-grafo/anime-30.py [grafo.npz] [--out nome.md]

Senza argomenti misura V14 (il riferimento storico). Con un percorso misura quel grafo, cosi' si
puo' confrontare la stessa tabella prima e dopo un intervento (es. --damp-anime-saga).
"""
import json
import re
import unicodedata

import numpy as np
import scipy.sparse as sp

from services.graph_dense import data as D

SEMI = [
    ("Horror / psicologico", "Elfen Lied", "tv:42671"),
    ("Horror / psicologico", "Monster", "tv:30981"),
    ("Horror / psicologico", "Serial Experiments Lain", "tv:1087"),
    ("Horror / psicologico", "Perfect Blue", "movie:10494"),
    ("Horror / psicologico", "Paprika", "movie:4977"),
    ("Shonen", "L'attacco dei giganti", "tv:1429"),
    ("Shonen", "Death Note", "tv:13916"),
    ("Shonen", "Fullmetal Alchemist: Brotherhood", "tv:31911"),
    ("Shonen", "Hunter x Hunter", "tv:46298"),
    ("Shonen", "My Hero Academia", "tv:65930"),
    ("Shonen", "Demon Slayer", "tv:85937"),
    ("Shonen", "Jujutsu Kaisen", "tv:95479"),
    ("Shonen", "One Piece", "tv:37854"),
    ("Mecha / sci-fi", "Neon Genesis Evangelion", "tv:890"),
    ("Mecha / sci-fi", "Code Geass", "tv:31724"),
    ("Mecha / sci-fi", "Gurren Lagann", "tv:21729"),
    ("Mecha / sci-fi", "Ghost in the Shell", "movie:9323"),
    ("Mecha / sci-fi", "Akira", "movie:149"),
    ("Mecha / sci-fi", "Ergo Proxy", "tv:1097"),
    ("Mecha / sci-fi", "Psycho-Pass", "tv:43865"),
    ("Mecha / sci-fi", "Cowboy Bebop", "tv:30991"),
    ("Mecha / sci-fi", "Steins;Gate", "tv:42509"),
    ("Avventura / fantastico", "Vinland Saga", "tv:88803"),
    ("Avventura / fantastico", "Made in Abyss", "tv:72636"),
    ("Avventura / fantastico", "Mushishi", "tv:26867"),
    ("Avventura / fantastico", "Berserk", "tv:35935"),
    ("Romantico / slice of life", "Toradora!", "tv:42916"),
    ("Romantico / slice of life", "Clannad", "tv:24835"),
    ("Film", "La città incantata", "movie:129"),
    ("Film", "Your Name.", "movie:372058"),
]

B = D.basic(); N = B["N"]; T = B["titoli"]; RO = B["row_of"]; YEAR = B["year"]; VOT = B["VOT"]
KEYS = B["keys"]
import sys
GRAFO = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].endswith('.npz')     else 'services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz'
USCITA = (sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv
          else '.scratch/distillazione-grafo/anime-30.md')
z = np.load(GRAFO)
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N)); del z
anime = set(json.load(open('.cache/anime-righe.json'))['righe'])


def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', s)).strip()


K = 20
righe = [f'# {GRAFO.split("/")[-1]} su 30 anime — top-20', '',
         'Semi scelti su dieci generi. `✓` = anime, `~` = stessa saga (token del titolo in comune), '
         '`·` = altro.', '']
stats = []
for genere, nome, chiave in SEMI:
    i = RO[chiave]
    r = M.getrow(i)
    o = np.argsort(-r.data)
    c = [int(j) for j in r.indices[o] if j != i][:K]
    segni = []
    for j in c:
        if j in anime:
            segni.append('~' if (set(norm(T[j]).split()) & set(norm(T[i]).split()) - {'the', 'of', 'no', 'il', 'la', 'di'}) else '✓')
        else:
            segni.append('·')
    n_anime = sum(1 for s in segni if s in '✓~')
    n_saga = sum(1 for s in segni if s == '~')
    n_film = sum(1 for j in c if KEYS[j].startswith('movie:'))
    voti = [float(VOT[j]) for j in c]
    stats.append((genere, nome, n_anime, n_saga, n_film, float(np.median(voti)),
                  sum(1 for v in voti if v < 100)))
    righe.append(f'\n### {nome} — `{chiave}`  ·  *{genere}*')
    righe += ['', '| # | titolo | | anno | voti |', '|---|---|---|---:|---:|']
    for q, (j, s) in enumerate(zip(c, segni), 1):
        righe.append(f'| {q} | {T[j]} | {s} | {int(YEAR[j]) if YEAR[j] > 0 else "?"} | {int(VOT[j])} |')
open(USCITA, 'w', encoding='utf-8').write("\n".join(righe) + "\n")

print('| seme | genere | anime nei 20 | di cui saga | film | voti mediani | <100 voti |')
print('|---|---|---:|---:|---:|---:|---:|')
for g, n, a, s, f, v, t in stats:
    print(f'| {n} | {g} | {a}/20 | {s} | {f} | {v:.0f} | {t} |')
tot = np.array([[s[2], s[3], s[4], s[5], s[6]] for s in stats], float)
print(f'\n**media**: {tot[:,0].mean():.1f}/20 anime · {tot[:,1].mean():.1f} saga · '
      f'{tot[:,2].mean():.1f} film · voti mediani {tot[:,3].mean():.0f} · {tot[:,4].mean():.1f} sotto 100 voti')
print(f'scritto {USCITA} (grafo: {GRAFO})')
