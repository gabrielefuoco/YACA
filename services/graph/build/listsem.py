"""listsem.py — i NOMI delle liste Trakt come segnale di tono (ticket 14).

PERCHE'. Finora abbiamo usato *quali film stanno nella stessa lista*, mai *come si chiama la lista*.
Ma i nomi sono giudizi tonali scritti da persone: «Best Mindfucks», «Campy», «Dystopian, Apocalyptic»,
«weird female rage», «comfort movies». È l'unica sorgente che **aggiunge informazione** invece di
ripesare quella che abbiamo — e l'unica che può alzare il tetto di copertura (26-30%).

COME. Per ogni lista (autori in holdout esclusi): nome + descrizione → embedding Qwen3. Il vettore di un
film è il centroide degli embedding delle sue liste, pesato per **specificità** (1/log dei film della
lista: una lista da 7 titoli dice molto più di una da 700) e non per numero di liste.

FILTRO. Le liste generiche («Watchlist», «2023», «Da vedere», «ranked») non dicono niente e vanno
escluse con una regola esplicita, non a intuito.

  PYTHONPATH=services py -m graph.build.listsem [--k 100]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import scipy.sparse as sp

from . import config as C, data as D

LISTE = Path('.cache/trakt/lists')
HOLDOUT = Path(__import__('os').environ.get('HOLDOUT_AUTORI', C.RECIPES / 'holdout-autori.json'))
MODELLO = 'Qwen/Qwen3-Embedding-0.6B'

# Una lista è "generica" se il nome non dice niente: contenitori, anni, ranking, supporti.
GENERICHE = re.compile(
    r'^(my |the )?(watchlist|watch list|da vedere|to watch|seen|watched|film|films|movie|movies|'
    r'serie|series|tv|tv shows?|list|lista|collection|collezione|ranking|ranked|classifica|'
    r'best of|top \d+|top|favorites?|preferiti|all|tutti|misc|other|altro)\b', re.I)
ANNI = re.compile(r'^(19|20)\d{2}$')


def _utile(nome: str, descrizione: str, n_item: int) -> bool:
    n = nome.strip()
    if len(n) < 4 or ANNI.match(n) or GENERICHE.match(n):
        return False
    if n.isdigit():
        return False
    # una lista enorme è un contenitore; una minuscola non esprime un gusto condiviso
    if n_item < 5 or n_item > 500:
        return False
    # il nome deve avere almeno una parola "di contenuto"
    parole = [w for w in re.split(r'\W+', n.lower()) if len(w) >= 4]
    return len(parole) >= 1


def liste():
    """[(nome, descrizione, n_item, [righe canone])] con autori in holdout esclusi."""
    B = D.basic()
    ro = B['row_of']
    meta = {}
    for f in sorted(LISTE.glob('popular-*.json')):
        for e in json.loads(f.read_text(encoding='utf-8')):
            l = e.get('list') or {}
            lid = (l.get('ids') or {}).get('trakt')
            u = l.get('user') or {}
            if lid is None:
                continue
            meta[int(lid)] = {'nome': str(l.get('name') or ''),
                              'descrizione': str(l.get('description') or '')[:400],
                              'autore': (u.get('ids') or {}).get('slug') or '',
                              'n': int(l.get('item_count') or 0)}
    hold = set(json.loads(HOLDOUT.read_text(encoding='utf-8'))) if HOLDOUT.exists() else set()
    out, tenute, scartate = [], 0, defaultdict(int)
    for lid, m in meta.items():
        if m['autore'] in hold:
            scartate['holdout'] += 1
            continue
        if not _utile(m['nome'], m['descrizione'], m['n']):
            scartate['generica'] += 1
            continue
        f = LISTE / f'items-{lid}.json'
        if not f.exists():
            scartate['senza items'] += 1
            continue
        try:
            items = json.loads(f.read_text(encoding='utf-8'))
        except Exception:
            scartate['items illeggibili'] += 1
            continue
        righe = []
        for it in items:
            o = it.get('movie') or it.get('show') or {}
            t = (o.get('ids') or {}).get('tmdb')
            if not t:
                continue
            r = ro.get(('movie:' if it.get('movie') else 'tv:') + str(int(t)))
            if r is not None:
                righe.append(r)
        righe = list(dict.fromkeys(righe))
        if len(righe) < 5:
            scartate['pochi in canone'] += 1
            continue
        testo = (m['nome'] + '. ' + m['descrizione']).strip('. ')[:400]
        out.append((testo, min(len(righe), max(m['n'], 1)), righe))
        tenute += 1
    print(f'  listsem: {tenute:,} liste utili · scartate {dict(scartate)}', flush=True)
    return out


def embedda(testi, batch=32):
    """Riusa e conserva gli embedding delle descrizioni-lista, legati a testo e ricetta."""
    import torch
    from transformers import AutoModel, AutoTokenizer
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    texts_sha = hashlib.sha256(json.dumps(testi, ensure_ascii=False).encode('utf-8')).hexdigest()
    key = hashlib.sha256(json.dumps({
        'model': MODELLO, 'texts_sha': texts_sha, 'max_length': 128,
        'pooling': 'last-token-left-padding', 'dtype': 'float16' if dev == 'cuda' else 'float32',
    }, sort_keys=True).encode('utf-8')).hexdigest()
    path = Path(os.environ.get('LISTSEM_EMBEDDINGS', C.DATA / 'embeddings' / 'listsem-qwen3-0.6b.npz'))
    if path.exists():
        with np.load(path, allow_pickle=False) as z:
            if str(z['key']) == key and z['E'].shape[0] == len(testi):
                print(f'  listsem: embedding riusati {path} {z["E"].shape}', flush=True)
                return z['E'].astype(np.float32)
    tok = AutoTokenizer.from_pretrained(MODELLO, padding_side='left')
    mod = AutoModel.from_pretrained(MODELLO, dtype=torch.float16 if dev == 'cuda' else torch.float32)
    mod = mod.to(dev).eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(testi), batch):
            b = testi[i:i + batch]
            e = tok(b, padding=True, truncation=True, max_length=128, return_tensors='pt').to(dev)
            out.append(mod(**e).last_hidden_state[:, -1].float().cpu().numpy())
    E = np.concatenate(out).astype(np.float32)
    E /= np.linalg.norm(E, axis=1, keepdims=True) + 1e-9
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.stem + '.tmp.npz')
    np.savez_compressed(tmp, E=E, key=np.array(key), texts_sha=np.array(texts_sha), model=np.array(MODELLO))
    tmp.replace(path)
    print(f'  listsem: embedding conservati {path} {E.shape}', flush=True)
    return E


def costruisci(B=None, k=100):
    """Tipo LISTSEM: per ogni film, i vicini nel suo "spazio delle liste"."""
    t0 = time.time()
    B = D.basic() if B is None else B
    N = B['N']
    L = liste()
    E = embedda([t for t, _, _ in L])
    print(f'  listsem: embedding di {len(E):,} nomi ({time.time()-t0:.0f}s)', flush=True)
    # vettore per film: media pesata per specificità 1/log(1+n) delle liste in cui compare
    righe, cols, vals = [], [], []
    for j, (_, n, films) in enumerate(L):
        w = 1.0 / np.log1p(n)
        for r in films:
            righe.append(r); cols.append(j); vals.append(w)
    A = sp.csr_matrix((np.float32(vals), (np.int32(righe), np.int32(cols))), shape=(N, len(L)))
    Z = (A @ E).astype(np.float32)
    nz = np.linalg.norm(Z, axis=1, keepdims=True)
    Z = Z / (nz + 1e-9)
    copertura = float((nz.ravel() > 0).mean())
    print(f'  listsem: {copertura:.1%} del canone ha un vettore di liste', flush=True)
    from . import tipi
    # i film senza liste non devono entrare come vettori nulli (coseno 0 con tutto)
    Z[nz.ravel() == 0] = 0.0
    M = tipi.topk_cosine(Z, k, etichetta='listsem')
    print(f'  listsem: {M.nnz:,} archi ({time.time()-t0:.0f}s)', flush=True)
    return M


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=int, default=100)
    ap.add_argument('--out', default='services/graph/data/tipi2/LISTSEM.npz')
    ap.add_argument('--manifest', default='services/graph/data/tipi2/manifest.json')
    a = ap.parse_args()
    from . import provenance as PV
    B = D.basic()
    M = costruisci(B, a.k)
    prov = PV.scrivi(a.out, M, step='tipi', params={'tipo': 'LISTSEM', 'k': a.k},
                     inputs={'holdout': PV.sha256_file(HOLDOUT)}, canon_len=B['N'])
    man = json.loads(Path(a.manifest).read_text(encoding='utf-8')) if Path(a.manifest).exists() else {}
    g = np.asarray((M > 0).sum(1)).ravel()
    man['LISTSEM'] = dict(archi=int(M.nnz), copertura=float((g > 0).mean()),
                          grado_mediano=int(np.median(g[g > 0])) if (g > 0).any() else 0,
                          riga_mediana=float(np.median(np.asarray(M.sum(1)).ravel()[g > 0])),
                          ricetta='nomi+descrizioni delle liste Trakt, embedding Qwen3, '
                                  'centroide per film pesato 1/log(1+n), autori holdout esclusi',
                          khi={'k': a.k}, creato=time.strftime('%Y-%m-%d %H:%M'))
    Path(a.manifest).write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'scritto {a.out} · prov {prov["sha256"][:12]} · manifest aggiornato')


if __name__ == '__main__':
    main()
