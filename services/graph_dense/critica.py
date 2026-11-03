"""critica.py — il tono preso da dove è scritto: le recensioni (ticket 07, seconda strada).

PERCHE'. Le sinossi descrivono la *fabula* («una bambola va nel mondo reale»). Il tono — «camp»,
«satirico», «surrealista», «di plastica», «allegoria femminista» — sta nelle recensioni, dove qualcuno
lo dice a parole. Questo modulo scarica `/movie/{id}/reviews` da TMDB, embedda il testo e ne fa un tipo
d'arco.

  PYTHONPATH=. py -m services.graph_dense.critica --pilota 300     # campione, per decidere
  PYTHONPATH=. py -m services.graph_dense.critica --tutti 15000    # tutti i film con >=200 voti

La cache è un parquet: una seconda esecuzione non riscarica niente.
"""
from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

from . import config as C, data as D

CACHE = Path(__file__).resolve().parent / "data" / "recensioni.parquet"
API = 'https://api.themoviedb.org/3/movie/{id}/reviews'
MODELLO = 'Qwen/Qwen3-Embedding-0.6B'
MAX_RECENSIONI = 6


def chiave():
    """La chiave TMDB: da ambiente, poi da `.env`, poi da `secrets.env`. Mai in chiaro nel codice."""
    v = os.environ.get('TMDB_API_KEY')
    if v:
        return v.strip()
    for f in ('.env', 'secrets.env'):
        p = Path(f)
        if not p.exists():
            continue
        for riga in p.read_text(encoding='utf-8', errors='ignore').splitlines():
            if riga.strip().startswith('TMDB_API_KEY'):
                return riga.split('=', 1)[1].strip().strip('"\'')
    raise RuntimeError('TMDB_API_KEY non trovata: serve in ambiente o in .env')


def _testo(recensioni):
    """Le prime `MAX_RECENSIONI` recensioni, unite. Si taglia perché il resto è ripetizione."""
    out = []
    for r in recensioni[:MAX_RECENSIONI]:
        t = (r.get('content') or '').strip()
        if len(t) >= 80:
            out.append(t[:1500])
    return '\n\n'.join(out)


def scarica(ids, pausa=0.02, max_pagine=2):
    """Scarica le recensioni e le mette in cache. Restituisce {tmdb_id: testo}."""
    k = chiave()
    gia = {}
    if CACHE.exists():
        d = pd.read_parquet(CACHE)
        gia = {int(r.id): r.testo for r in d.itertuples()}
    mancanti = [i for i in ids if int(i) not in gia]
    print(f'  critica: {len(gia):,} già in cache · {len(mancanti):,} da scaricare', flush=True)
    nuovo = []
    t0 = time.time()
    for n, i in enumerate(mancanti):
        pezzi = []
        for pagina in range(1, max_pagine + 1):
            try:
                r = requests.get(API.format(id=int(i)), params={'api_key': k, 'page': pagina},
                                 timeout=20)
                if r.status_code != 200:
                    break
                res = r.json().get('results') or []
                pezzi.extend(res)
                if len(res) < 20:
                    break
            except Exception:
                break
            time.sleep(pausa)
        nuovo.append({'id': int(i), 'testo': _testo(pezzi), 'n': len(pezzi)})
        if n and n % 50 == 0:
            print(f'    {n:,}/{len(mancanti):,} ({time.time()-t0:.0f}s)', flush=True)
    if nuovo:
        d = pd.DataFrame(nuovo)
        if CACHE.exists():
            d = pd.concat([pd.read_parquet(CACHE), d], ignore_index=True)
            d = d.drop_duplicates('id', keep='last')
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        d.to_parquet(CACHE, index=False)
    d = pd.read_parquet(CACHE)
    con = d[d.testo.str.len() > 0]
    print(f'  critica: {len(d):,} film in cache · {len(con):,} con almeno una recensione utile',
          flush=True)
    return {int(r.id): r.testo for r in d.itertuples()}


def embedda(testi, batch=16):
    """Embedding Qwen3 delle recensioni (stesso modello delle trame: gli spazi restano confrontabili)."""
    import torch
    from transformers import AutoModel, AutoTokenizer
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    tok = AutoTokenizer.from_pretrained(MODELLO, padding_side='left')
    mod = AutoModel.from_pretrained(MODELLO, dtype=torch.float16 if dev == 'cuda' else torch.float32)
    mod = mod.to(dev).eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(testi), batch):
            b = testi[i:i + batch]
            e = tok(b, padding=True, truncation=True, max_length=512, return_tensors='pt').to(dev)
            h = mod(**e).last_hidden_state[:, -1]
            out.append(h.float().cpu().numpy())
            if i and i % (batch * 20) == 0:
                print(f'    embedding {i:,}/{len(testi):,}', flush=True)
    E = np.concatenate(out).astype(np.float32)
    return E / (np.linalg.norm(E, axis=1, keepdims=True) + 1e-9)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pilota', type=int, default=0, help='numero di film da campionare')
    ap.add_argument('--tutti', type=int, default=0, help='film con >=200 voti da scaricare')
    ap.add_argument('--min-voti', type=int, default=200)
    ap.add_argument('--out', default='services/graph_dense/data/critica.npz')
    a = ap.parse_args()
    B = D.basic()
    ro = B['row_of']
    d = pd.read_parquet(C.TMDB / 'movies.parquet', columns=['id', 'vote_count'])
    d = d[d.vote_count >= a.min_voti]
    if a.pilota:
        # campione stratificato per popolarità: i blockbuster da soli non dicono se il tono funziona
        rng = np.random.default_rng(7)
        d = d.iloc[rng.choice(len(d), min(a.pilota, len(d)), replace=False)]
    elif a.tutti:
        d = d.nlargest(min(a.tutti, len(d)), 'vote_count')
    ids = [int(x) for x in d.id]
    testi = scarica(ids)
    righe, ttl = [], []
    for i, t in testi.items():
        r = ro.get(f'movie:{i}')
        if r is not None and isinstance(t, str) and t.strip():
            righe.append(r); ttl.append(t)
    print(f'  critica: {len(righe):,} film del canone con recensioni', flush=True)
    E = embedda(ttl)
    np.savez_compressed(a.out, idx=np.asarray(righe, np.int32), emb=E)
    print(f'scritto {a.out} · {E.shape}')


if __name__ == '__main__':
    main()
