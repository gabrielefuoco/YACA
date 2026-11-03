"""embed-trama2.py — embedding delle trame per il canone esteso, con `transformers` diretto.

  PYTHONPATH=. py .scratch/distillazione-grafo/embed-trama2.py

Perche' non `embed_trama.py`: usa `sentence_transformers`, che su questa macchina va in segmentation
fault. La ricetta pero' e' la stessa, verificata contro gli embedding gia' salvati (coseno 0,9998):
Qwen3-Embedding-0.6B, padding a SINISTRA, pooling sull'ULTIMO token, righe normalizzate.
Payload identico: `"<titolo>. <trama>"`.

Il canone e' cresciuto in coda, quindi gli indici vecchi restano validi: si allunga `E` con zeri e si
calcolano solo le righe mancanti. Ripresa inclusa.
"""
import json
import time

import numpy as np
import pandas as pd
import torch
from transformers import AutoModel, AutoTokenizer

from services.graph_dense import config as C
from services.graph_dense import data as D

MODEL = 'Qwen/Qwen3-Embedding-0.6B'
BATCH = 32
SALVA_OGNI = 2000
MAXLEN = 512


def payload(B):
    row_of = B['row_of']
    prim = C.DATA / 'overview-en.parquet'
    ovm = {}
    if prim.exists():
        d = pd.read_parquet(prim)
        ovm = {str(r.chiave): r.overview for r in d.itertuples()}
    out = {}
    from services.graph_dense import maschera as MK
    for tipo, f, cols in (('movie', 'movies.parquet',
                           ['id', 'title', 'title_en', 'original_title', 'collection_name', 'overview']),
                          ('tv', 'tv.parquet', ['id', 'name', 'name_en', 'overview'])):
        d = pd.read_parquet(C.TMDB / f, columns=cols)
        for r in d.itertuples(index=False):
            k = f'{tipo}:{int(r.id)}'
            if k not in row_of:
                continue
            o = ovm.get(k) or r.overview
            if not isinstance(o, str) or not o.strip():
                continue
            t = (getattr(r, 'title_en', None) or getattr(r, 'title', None)
                 or getattr(r, 'name_en', None) or getattr(r, 'name', None) or '')
            # TICKET 05: il titolo NON entra nel payload, e i nomi propri del film (titolo, titolo
            # originale, collezione) vengono mascherati anche dentro la sinossi. Prima era
            # `f'{t}. {o}'`: lo spazio TRAMA misurava l'omonimia lessicale, non la storia.
            chiavi = MK.chiavi(t, getattr(r, 'original_title', ''), '',
                               getattr(r, 'collection_name', ''))
            pulita = MK.maschera(o.strip(), chiavi)
            out[k] = pulita if pulita.strip() else o.strip()
    return out


def main():
    t0 = time.time()
    B = D.basic(); N = B['N']; row_of = B['row_of']
    pay = payload(B)
    rows = np.array([row_of[k] for k in pay], np.int32)
    print(f'canone {N:,} · titoli con trama {len(rows):,}', flush=True)

    f = C.DATA / C.TRAMA
    fi = C.DATA / C.TRAMA_IDX
    if f.exists() and fi.exists():
        E = np.load(f).astype(np.float32)
        idx = np.load(fi).astype(np.int32)
        if E.shape[0] < N:
            E2 = np.zeros((N, E.shape[1]), np.float32)
            E2[:E.shape[0]] = E
            E = E2
            print(f'  E allungata: {E.shape}', flush=True)
        done = set(int(x) for x in idx)
        print(f"  riprendo: {len(done):,} gia' fatti", flush=True)
    else:
        E = np.zeros((N, 1024), np.float32); idx = np.zeros(0, np.int32); done = set()

    todo = [(int(r), pay[k]) for k, r in zip(pay, rows) if int(r) not in done]
    print(f'da fare: {len(todo):,}', flush=True)
    if not todo:
        print('niente da fare'); return

    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    if dev == 'cuda':
        torch.cuda.set_per_process_memory_fraction(0.6, 0)
        torch.cuda.empty_cache()
    tok = AutoTokenizer.from_pretrained(MODEL, padding_side='left')
    mod = AutoModel.from_pretrained(MODEL, dtype=torch.float16 if dev == 'cuda' else torch.float32).to(dev).eval()
    print(f'modello su {dev} · dim {mod.config.hidden_size}', flush=True)

    fatti = list(done)
    with torch.inference_mode():
        for st in range(0, len(todo), SALVA_OGNI):
            blocco = todo[st:st + SALVA_OGNI]
            for j in range(0, len(blocco), BATCH):
                sub = blocco[j:j + BATCH]
                rr = np.array([x[0] for x in sub], np.int32)
                tt = [x[1] for x in sub]
                b = tok(tt, padding=True, truncation=True, max_length=MAXLEN,
                        return_tensors='pt').to(dev)
                h = mod(**b).last_hidden_state[:, -1, :].float()
                h = torch.nn.functional.normalize(h, dim=1)
                E[rr] = h.cpu().numpy()
                fatti.extend(int(x) for x in rr)
            idx = np.array(sorted(set(fatti)), np.int32)
            np.save(C.DATA / '_trama.tmp.npy', E)
            np.save(C.DATA / '_trama-idx.tmp.npy', idx)
            (C.DATA / '_trama.tmp.npy').replace(f)
            (C.DATA / '_trama-idx.tmp.npy').replace(fi)
            (C.DATA / 'trama-state.json').write_text(json.dumps({
                'modello': MODEL, 'dim': 1024, 'n_canone': int(N), 'n_trame': int(len(rows)),
                'fatte': int(len(idx)), 'device': dev,
                'ts': time.strftime('%Y-%m-%dT%H:%M:%S')}, indent=2), encoding='utf-8')
            print(f'  {len(idx):,}/{len(rows):,} · {time.time()-t0:.0f}s', flush=True)
    print(f'FINE · {len(idx):,} trame in {time.time()-t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
