"""Confronto V10 vs V12 candidato su 40 titoli mai usati prima (25 film, 15 serie)."""
import numpy as np, scipy.sparse as sp
from services.graph_dense import data as D

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; COLL = B['COLL'].astype(np.int64)
V10 = D.triangle()
z = np.load('services/graph/data/v12/MIX-rrf-dc-dt.npz')
V12 = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N))

FILM = [(429,'Il buono, il brutto, il cattivo'),(637,'La vita e bella'),(11216,'Cinema Paradiso'),
        (78,'Blade Runner'),(550,'Fight Club'),(27205,'Inception'),(157336,'Interstellar'),(694,'Shining'),
        (28,'Apocalypse Now'),(194,'Amelie'),(128,'Princess Mononoke'),(807,'Se7en'),(313369,'La La Land'),
        (244786,'Whiplash'),(76341,'Mad Max: Fury Road'),(419430,'Get Out'),(530385,'Midsommar'),
        (531428,'Ritratto della giovane in fiamme'),(64690,'Drive'),(10272,'Il gattopardo'),(422,'8 e mezzo'),
        (439,'La dolce vita'),(101,'Leon'),(603,'Matrix'),(329,'Jurassic Park')]
SERIE = [(1438,'The Wire'),(1398,'I Soprano'),(1920,'Twin Peaks'),(87108,'Chernobyl'),(70523,'Dark'),
         (60574,'Peaky Blinders'),(65494,'The Crown'),(42009,'Black Mirror'),(67070,'Fleabag'),(62560,'Mr. Robot'),
         (71446,'La casa di carta'),(76331,'Succession'),(61222,'BoJack Horseman'),(2316,'The Office US'),
         (60059,'Better Call Saul')]

def top(M, i, k=8):
    r = M.getrow(i)
    if r.nnz == 0: return []
    g = np.zeros(N, np.float32); g[r.indices] = r.data; g[i] = -1e9
    return [int(x) for x in np.argsort(-g)[:k]]

def riga(M, i, k=8):
    t = top(M, i, k)
    return ' · '.join(T[j] for j in t) if t else '(nessun arco)'

righe = ['# Confronto V10 vs V12 — 40 titoli (25 film, 15 serie)', '',
         'Titoli mai usati nei test precedenti. Top-8 per ciascun grafo. V12 = rrf(60) + damping famiglia + hub su TRAMA/KW/CAST/PROD.', '']
jacs = []; fr10 = []; fr12 = []
for gruppo, casi in (('Film', FILM), ('Serie', SERIE)):
    righe.append(f'## {gruppo}')
    for tid, lab in casi:
        key = f'{"movie" if gruppo=="Film" else "tv"}:{tid}'
        i = RO.get(key)
        if i is None:
            righe.append(f'\n**{lab}** — fuori canone'); continue
        a, b = top(V10, i, 10), top(V12, i, 10)
        if a and b:
            jacs.append(len(set(a) & set(b)) / len(set(a) | set(b)))
        c = COLL[i]
        if c > 0:
            fr10.append(sum(1 for j in a if COLL[j] == c) / max(len(a), 1))
            fr12.append(sum(1 for j in b if COLL[j] == c) / max(len(b), 1))
        righe.append(f'\n**{lab}** — `{key}`\n\n- V10: {riga(V10, i)}\n- V12: {riga(V12, i)}')
righe += ['', '## Sintesi', '',
          f'- Sovrapposizione media top-10 V10/V12: **{np.mean(jacs):.3f}** (Jaccard)',
          f'- Quota di top-10 nella stessa collezione del seme — V10 **{np.mean(fr10):.3f}** · V12 **{np.mean(fr12):.3f}**']
open('.scratch/distillazione-grafo/confronto-v10-v12.md', 'w', encoding='utf-8').write('\n'.join(righe) + '\n')
print(f'scritto · jaccard medio {np.mean(jacs):.3f} · collezione V10 {np.mean(fr10):.3f} vs V12 {np.mean(fr12):.3f}')
