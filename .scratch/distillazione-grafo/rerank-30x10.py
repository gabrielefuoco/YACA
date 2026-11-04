"""rerank-30x10.py — V14 vs V14 ⊕ reranker (mu=0.3) sui soliti 30 film + 10 serie.

Tetti leggeri: 40 candidati per seme (1.600 coppie), batch 6, logits_to_keep=1,
VRAM al 50%. Gli score si salvano: cambiare mu non richiede di ricalcolare.
"""
import json
import os

import numpy as np
import pandas as pd
import scipy.sparse as sp
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from services.graph_dense import data as D

MODEL = 'Qwen/Qwen3-Reranker-0.6B'
KCAND = 40
KG = 20
BATCH = 6
MAXS = 320
MU = 0.3
CACHE = '.cache/rerank-30x10.npz'
NL = chr(10)

PREFISSO = ('<|im_start|>system' + NL +
            'Judge whether the Document meets the requirements based on the Query and the Instruct '
            'provided. Note that the answer can only be "yes" or "no".<|im_end|>' + NL +
            '<|im_start|>user' + NL)
SUFFISSO = '<|im_end|>' + NL + '<|im_start|>assistant' + NL
ISTR = ('The user has just watched and loved the query film. Judge whether the document is a film '
        'they would choose next. Ignore mere subject overlap such as the same animals, jobs or '
        'settings.')

FILM = [346698, 64690, 76341, 27205, 11216, 157336, 329, 603, 419430, 496243, 422, 807, 240, 582, 1417,
        406, 11093, 62215, 97370, 329865, 264660, 152601, 210577, 146233, 242582, 273481, 18148, 490, 797, 5156]
SERIE = [1438, 1920, 87108, 42009, 62560, 70523, 76331, 61222, 60574, 71446]

B = D.basic(); N = B['N']; T = B['titoli']; RO = B['row_of']; YEAR = B['year']; VOT = B['VOT']
z = np.load('services/graph/data/v14/bolle-eterogeneo-V14-p1.0-triangolo.npz')
M = sp.csr_matrix((z['data'], z['indices'], z['indptr']), shape=(N, N)); del z
ov = pd.read_parquet('services/graph_dense/data/overview-en.parquet')
ovw = {k: (str(o) if isinstance(o, str) else '') for k, o in zip(ov['chiave'], ov['overview'])}; del ov


def doc(j):
    anno = f' ({int(YEAR[j])})' if YEAR[j] > 0 else ''
    return f'{T[j]}{anno}. {ovw.get(B["keys"][j], "")[:420]}'


semi = [(f'movie:{t}', T[RO[f'movie:{t}']]) for t in FILM if f'movie:{t}' in RO]
semi += [(f'tv:{t}', T[RO[f'tv:{t}']]) for t in SERIE if f'tv:{t}' in RO]
seeds, cands = [], []
for key, _ in semi:
    i = RO[key]
    r = M.getrow(i)
    cands.append([int(j) for j in r.indices[np.argsort(-r.data)][:KCAND] if j != i])
    seeds.append(i)
print(f'semi {len(semi)} · coppie {sum(len(c) for c in cands):,}', flush=True)

if os.path.exists(CACHE):
    scelti = np.load(CACHE)['scores']
    print('score dalla cache', flush=True)
else:
    testi = []
    for i, c in zip(seeds, cands):
        q = doc(i)
        for j in c:
            testi.append(PREFISSO + '<Instruct>: ' + ISTR + NL + '<Query>: ' + q + NL +
                         '<Document>: ' + doc(j) + SUFFISSO)
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    if dev == 'cuda':
        torch.cuda.set_per_process_memory_fraction(0.5, 0); torch.cuda.empty_cache()
    tok = AutoTokenizer.from_pretrained(MODEL, padding_side='left')
    mod = AutoModelForCausalLM.from_pretrained(
        MODEL, dtype=torch.float16 if dev == 'cuda' else torch.float32,
        attn_implementation='sdpa').to(dev).eval()
    id_si = tok.convert_tokens_to_ids('yes'); id_no = tok.convert_tokens_to_ids('no')
    scelti = np.zeros(len(testi), np.float32)
    with torch.inference_mode():
        for st in range(0, len(testi), BATCH):
            b = tok(testi[st:st + BATCH], return_tensors='pt', padding=True,
                    truncation=True, max_length=MAXS).to(dev)
            lg = mod(**b, logits_to_keep=1).logits[:, -1, :]
            par = torch.stack([lg[:, id_no], lg[:, id_si]], dim=1).float()
            scelti[st:st + BATCH] = torch.nn.functional.softmax(par, dim=1)[:, 1].cpu().numpy()
            if (st // BATCH) % 40 == 0:
                print(f'  {st:,}/{len(testi):,}', flush=True)
    np.savez_compressed(CACHE, scores=scelti)
    print('score calcolati e salvati', flush=True)

righe = [f'# V14 vs V14 ⊕ reranker (mu={MU}) — 30 film + 10 serie', '',
         f'Top-8. Fusione RRF: `1/(20+rango_grafo) + {MU}/(20+rango_reranker)` sui primi {KCAND}.', '']
cambiati = 0
prima_mat, dopo_mat = [], []
k = 0
for (key, nome), i, c in zip(semi, seeds, cands):
    s = scelti[k:k + len(c)]; k += len(c)
    rg = {j: p for p, j in enumerate(c)}
    rr = {j: p for p, j in enumerate([c[x] for x in np.argsort(-s)])}
    comb = sorted(c, key=lambda j: -(1 / (KG + rg[j]) + MU / (KG + rr[j])))
    a, b = c[:8], comb[:8]
    prima_mat.append(set(a)); dopo_mat.append(set(b))
    if set(a) != set(b):
        cambiati += 1
        righe.append(f'\n**{nome}** — `{key}`\n')
        for p in range(8):
            segno = '  ' if (p < len(a) and p < len(b) and a[p] == b[p]) else '≠ '
            righe.append(f'- {segno}{p+1}. {T[b[p]]:<45} (era: {T[a[p]] if p < len(a) else "-"})')
righe.append('')
righe.append(f'## Sintesi\n\n- semi con top-8 diverso: **{cambiati}/{len(semi)}**')
stabil = [len(x & y) / 8 for x, y in zip(prima_mat, dopo_mat)]
righe.append(f'- stabilita media del top-8: **{100*np.mean(stabil):.0f}%**')
open('.scratch/distillazione-grafo/rerank-30x10.md', 'w', encoding='utf-8').write(NL.join(righe) + NL)
print(f'\nsemi cambiati {cambiati}/{len(semi)} · stabilita {100*np.mean(stabil):.0f}%')
print('scritto .scratch/distillazione-grafo/rerank-30x10.md')
